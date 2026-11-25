import json
import os
import random
import tempfile
import unittest

from papertrader import config
from papertrader.cex import breakout_signal, pick_candidates
from papertrader.demo import SimDex, run_demo
from papertrader.dex import safety_check, screen
from papertrader.ledger import Ledger
from papertrader.models import BookState, Position
from papertrader.rules import check_exit, fill_from_book, initial_levels, position_size

EXITS = config.DEFAULTS["exits"]
RISK = config.DEFAULTS["risk"]


def pos(entry=100.0):
    stop, tp = initial_levels(entry, EXITS)
    return Position(id="x", book="cex", key="K", symbol="T", entry_ts=0, entry_price=entry, qty=1,
                    cost_usd=entry, stop_price=stop, take_profit_price=tp, peak_price=entry)


class Rules(unittest.TestCase):
    def test_levels(self):
        stop, tp = initial_levels(100, EXITS)
        self.assertAlmostEqual(stop, 94.0)
        self.assertAlmostEqual(tp, 118.0)

    def test_stop_loss(self):
        self.assertIn("stop-loss", check_exit(pos(), 93.9, 10, EXITS))
        self.assertIsNone(check_exit(pos(), 95, 10, EXITS))

    def test_trailing_stop_locks_profit(self):
        p = pos()
        self.assertIsNone(check_exit(p, 110, 10, EXITS))
        self.assertTrue(p.trailing)
        self.assertAlmostEqual(p.stop_price, 105.6)
        self.assertIn("trailing stop", check_exit(p, 105, 20, EXITS))

    def test_take_profit_and_max_hold(self):
        self.assertIn("take-profit", check_exit(pos(), 118.5, 10, EXITS))
        self.assertIn("max hold", check_exit(pos(), 101, 25 * 3600, EXITS))

    def test_size_caps(self):
        usd, _ = position_size(1000, 1000, RISK)
        self.assertEqual(usd, 100.0)
        usd, _ = position_size(10_000, 10_000, RISK)
        self.assertEqual(usd, 250.0)  # max_position_usd
        usd, _ = position_size(1000, 30, RISK)
        self.assertEqual(usd, 30.0)  # limited by cash
        usd, why = position_size(1000, 1000, RISK, liquidity_cap=2)
        self.assertEqual(usd, 0.0)
        self.assertIn("below minimum", why)

    def test_fill_walks_book(self):
        asks = [(10, 1), (11, 1), (12, 10)]
        avg, qty, usd = fill_from_book(asks, usd=21)
        self.assertAlmostEqual(qty, 2.0)
        self.assertAlmostEqual(avg, 10.5)
        bids = [(10, 1), (9, 1)]
        avg, qty, usd = fill_from_book(bids, qty=1.5)
        self.assertAlmostEqual(usd, 14.5)
        avg, qty, usd = fill_from_book(bids, qty=5)  # thin book fills partially
        self.assertAlmostEqual(qty, 2.0)


class CexSignal(unittest.TestCase):
    cfg = config.book_cfg(config.DEFAULTS, "cex")

    def candles(self, n=70, spike=False):
        rows = [[i * 60, 100, 101, 99, 100, 1000.0] for i in range(n)]
        if spike:
            for r in rows[-6:-1]:
                r[5] = 5000.0
        return rows

    def test_breakout_requires_volume(self):
        ok, why, _ = breakout_signal(self.candles(), 101.5, self.cfg)
        self.assertFalse(ok)
        self.assertIn("without volume", why)
        ok, why, _ = breakout_signal(self.candles(spike=True), 101.5, self.cfg)
        self.assertTrue(ok, why)

    def test_no_chasing_and_no_breakout(self):
        self.assertFalse(breakout_signal(self.candles(spike=True), 110, self.cfg)[0])
        self.assertFalse(breakout_signal(self.candles(spike=True), 100.5, self.cfg)[0])

    def test_candidates_skip_stables_and_illiquid(self):
        t = {"A": {"symbol": "USDC/USD", "vol_usd_24h": 9e9, "chg_today_pct": 0.1},
             "B": {"symbol": "PEPE/USD", "vol_usd_24h": 5e6, "chg_today_pct": 9},
             "C": {"symbol": "TINY/USD", "vol_usd_24h": 1e3, "chg_today_pct": 50}}
        self.assertEqual(pick_candidates(t, self.cfg), ["B"])


class FakeDex:
    def __init__(self, mi=None, rs=None, fail_rug=False):
        self.mi = {"decimals": 6, "mint_authority": None, "freeze_authority": None, "extensions": []}
        self.mi.update(mi or {})
        self.rs = {"lp_locked_pct": 100, "danger": [], "warn": [], "score": 1}
        self.rs.update(rs or {})
        self.fail_rug = fail_rug

    def mint_info(self, mint):
        return self.mi

    def rug_summary(self, mint):
        if self.fail_rug:
            raise RuntimeError("down")
        return self.rs


class DexSafety(unittest.TestCase):
    cfg = config.book_cfg(config.DEFAULTS, "dex")

    def check(self, **kw):
        return safety_check(FakeDex(**kw), "M", self.cfg)

    def test_pass(self):
        self.assertTrue(self.check()[0])

    def test_rejections(self):
        self.assertIn("mint authority", self.check(mi={"mint_authority": "dev"})[1])
        self.assertIn("freeze authority", self.check(mi={"freeze_authority": "dev"})[1])
        self.assertIn("Token-2022", self.check(mi={"extensions": ["transferHook"]})[1])
        self.assertIn("danger", self.check(rs={"danger": ["Top 10 holders high ownership"]})[1])
        self.assertIn("LP lock", self.check(rs={"lp_locked_pct": 20})[1])
        self.assertIn("unknown", self.check(rs={"lp_locked_pct": None})[1])
        # if a check cannot be completed, the token is rejected, never assumed safe
        self.assertIn("unavailable", self.check(fail_rug=True)[1])

    def test_screen(self):
        p = {"price": 1, "liquidity": 50_000, "vol_m5": 5000, "buys_m5": 30, "sells_m5": 10,
             "chg_m5": 3, "chg_h1": 10, "created_ms": 1}
        self.assertTrue(screen(p, 60 * 60_000, self.cfg)[0])
        self.assertIn("too new", screen(p, 60_000, self.cfg)[1])
        self.assertIn("too new", screen({**p, "created_ms": 0}, 3.6e6, self.cfg)[1])  # unknown age
        self.assertIn("liquidity", screen({**p, "liquidity": 100}, 3.6e6, self.cfg)[1])


class DeskEndToEnd(unittest.TestCase):
    def test_demo_accounting_is_consistent(self):
        with tempfile.TemporaryDirectory() as d:
            ledger = Ledger(d, quiet=True)
            desk = run_demo(config.load(None), ledger, hours=12, seed=3)
            trades = ledger.read_jsonl(ledger.trades_path)
            decisions = ledger.read_jsonl(ledger.decisions_path)
            self.assertTrue(trades)
            for name, b in desk.books.items():
                bt = [t for t in trades if t["book"] == name]
                self.assertEqual(len(bt), b.trades)
                # cash = start - cost of open positions + realized P&L
                open_cost = sum(p.cost_usd for p in b.positions.values())
                self.assertAlmostEqual(b.cash, b.starting_equity - open_cost + b.realized_pnl, places=4)
                self.assertAlmostEqual(sum(t["pnl_usd"] for t in bt), b.realized_pnl, places=2)
                self.assertGreaterEqual(b.cash, 0)
            for e in decisions:
                if e["event"] in ("ENTER", "EXIT", "REJECT"):
                    self.assertTrue(e["reason"], e)
                if e["event"] == "ENTER":
                    self.assertLessEqual(e["usd"], 250.02)
                    self.assertLessEqual(e.get("slippage_pct", 0), 2.0)
            # state survives a restart
            again = Ledger(d, quiet=True).load_books()
            self.assertAlmostEqual(again["dex"].cash, desk.books["dex"].cash)

    def test_no_unsafe_token_is_ever_bought(self):
        with tempfile.TemporaryDirectory() as d:
            ledger = Ledger(d, quiet=True)
            desk = run_demo(config.load(None), ledger, hours=12, seed=5)
            dex = desk.feeds["dex"]
            assert isinstance(dex, SimDex)
            bought = {e["symbol"] for e in ledger.read_jsonl(ledger.decisions_path)
                      if e["event"] == "ENTER" and e["book"] == "dex"}
            traits = {"$" + t["symbol"]: t["trait"] for t in dex.tokens.values()}
            for sym in bought:
                if sym in traits:
                    self.assertIn(traits[sym], ("honest",), sym)

    def test_daily_loss_limit_halts(self):
        with tempfile.TemporaryDirectory() as d:
            ledger = Ledger(d, quiet=True)
            cfg = config.load(None)
            from papertrader.desk import Desk
            desk = Desk(cfg, ledger, cex_feed=None, dex_feed=object(), clock=lambda: 0)
            b = desk.books["dex"]
            bc = desk.bcfg["dex"]
            self.assertTrue(desk._new_day_and_halt(b, bc, 1000))
            b.cash -= 150  # lose 15% within the day
            self.assertFalse(desk._new_day_and_halt(b, bc, 2000))
            self.assertFalse(desk._new_day_and_halt(b, bc, 3000))
            self.assertTrue(desk._new_day_and_halt(b, bc, 1000 + 86400))  # next day resumes


if __name__ == "__main__":
    unittest.main()


class FakeHttp:
    """Returns canned responses shaped like the real public APIs."""

    def __init__(self, routes):
        self.routes = routes

    def get(self, url, params=None, ok_404=False, **kw):
        for frag, resp in self.routes.items():
            if frag in url and (not isinstance(resp, dict) or "_match" not in resp
                                or resp["_match"](params)):
                return resp["_body"] if isinstance(resp, dict) and "_body" in resp else resp
        return None if ok_404 else (_ for _ in ()).throw(RuntimeError(url))

    def post(self, url, json=None, **kw):
        return self.routes["rpc"]


class LiveParsers(unittest.TestCase):
    def test_kraken(self):
        from papertrader.cex import KrakenFeed
        http = FakeHttp({
            "AssetPairs": {"error": [], "result": {
                "XXBTZUSD": {"wsname": "XBT/USD", "status": "online"},
                "XETHZEUR": {"wsname": "ETH/EUR", "status": "online"}}},
            "Ticker": {"error": [], "result": {
                "XXBTZUSD": {"a": ["100.5", "1", "1"], "b": ["100.0", "1", "1"], "c": ["100.2", "0.1"],
                             "v": ["10", "200"], "p": ["100", "99"], "o": "95.0"},
                "XETHZEUR": {"a": ["1", "1", "1"], "b": ["1", "1", "1"], "c": ["1", "1"],
                             "v": ["1", "1"], "p": ["1", "1"], "o": "1"}}},
            "OHLC": {"error": [], "result": {"XXBTZUSD": [
                [1700000000, "1", "2", "0.5", "1.5", "1.4", "10", 5]], "last": 1700000000}},
            "Depth": {"error": [], "result": {"XXBTZUSD": {
                "asks": [["100.5", "2", 1700000000]], "bids": [["100.0", "3", 1700000000]]}}},
        })
        f = KrakenFeed(http)
        t = f.tickers()
        self.assertEqual(list(t), ["XXBTZUSD"])
        self.assertEqual(t["XXBTZUSD"]["symbol"], "BTC/USD")
        self.assertAlmostEqual(t["XXBTZUSD"]["vol_usd_24h"], 200 * 99)
        self.assertAlmostEqual(f.ohlc("XXBTZUSD")[0][5], 14.0)
        self.assertEqual(f.book("XXBTZUSD")["bids"], [(100.0, 3.0)])

    def test_dex(self):
        from papertrader.dex import LiveDex
        mint = "So1MintAddr"
        http = FakeHttp({
            "token-profiles": [{"chainId": "solana", "tokenAddress": mint},
                               {"chainId": "ethereum", "tokenAddress": "0xabc"}],
            "token-boosts": [{"chainId": "solana", "tokenAddress": mint}],
            "tokens/v1/solana": [
                {"baseToken": {"address": mint, "symbol": "WIF2"}, "priceUsd": "0.0123",
                 "liquidity": {"usd": 50000}, "volume": {"m5": 3000}, "txns": {"m5": {"buys": 30, "sells": 10}},
                 "priceChange": {"m5": 2.5, "h1": 8}, "pairCreatedAt": 1700000000000, "dexId": "raydium"},
                {"baseToken": {"address": mint, "symbol": "WIF2"}, "priceUsd": "0.0120",
                 "liquidity": {"usd": 900}, "pairCreatedAt": 1700000000000}],
            "report/summary": {"lpLockedPct": 100, "score_normalised": 3,
                               "risks": [{"name": "Low amount of holders", "level": "warn"}]},
            "quote": {"outAmount": "123456789"},
            "rpc": {"result": {"value": {"owner": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                    "data": {"parsed": {"info": {"decimals": 6, "mintAuthority": None,
                                                  "freezeAuthority": None}}}}}},
        })
        d = LiveDex(http)
        self.assertEqual(d.discover(), [mint])
        p = d.pairs([mint])[mint]
        self.assertEqual((p["symbol"], p["price"], p["liquidity"], p["buys_m5"]), ("WIF2", 0.0123, 50000.0, 30))
        ok, why, info = safety_check(d, mint, config.book_cfg(config.DEFAULTS, "dex"))
        self.assertTrue(ok, why)
        self.assertEqual(info["warn"], ["Low amount of holders"])
        self.assertEqual(d.quote_buy(mint, 10), 123456789)
        self.assertAlmostEqual(d.quote_sell(mint, 1), 123.456789)
