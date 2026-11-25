"""The desk: runs each book's cycle (scan -> check -> size -> paper-execute -> manage exits -> log).

Nothing here can place a real order. Fills are simulated from real order books (exchange coins)
and real swap quotes (DEX tokens), then fees are subtracted.
"""
from __future__ import annotations

import time

from . import cex as cexmod
from . import dex as dexmod
from .config import book_cfg
from .models import BookState, Position
from .rules import check_exit, fill_from_book, initial_levels, position_size


def _day(ts: float) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ts))


class Desk:
    def __init__(self, cfg: dict, ledger, cex_feed=None, dex_feed=None, clock=time.time):
        self.cfg = cfg
        self.ledger = ledger
        self.clock = clock
        self.feeds = {"cex": cex_feed, "dex": dex_feed}
        self.bcfg = {n: book_cfg(cfg, n) for n in cfg["books"]}
        self.books = ledger.load_books()
        for name, bc in self.bcfg.items():
            if bc.get("enabled") and name not in self.books:
                eq = float(bc["starting_equity"])
                self.books[name] = BookState(name=name, starting_equity=eq, cash=eq, peak_equity=eq)
        self.next_run = {n: 0.0 for n in self.books}
        self.last_summary = clock()

    # ---- shared helpers ------------------------------------------------------
    def active_books(self):
        return [n for n in self.books if self.bcfg.get(n, {}).get("enabled") and self.feeds.get(n)]

    def _new_day_and_halt(self, b: BookState, bc: dict, now: float) -> bool:
        """Returns True when new entries are allowed."""
        today = _day(now)
        if b.day != today:
            b.day, b.day_start_equity = today, b.equity()
        limit = bc["risk"]["daily_loss_limit_pct"]
        if b.halted_day == today:
            return False
        if b.day_start_equity > 0 and b.equity() < b.day_start_equity * (1 - limit / 100):
            b.halted_day = today
            self.ledger.log("HALT", b.name, reason=f"daily loss limit {limit:g}% reached; "
                            "no new trades until tomorrow (UTC)", equity=round(b.equity(), 2))
            return False
        return True

    def _track_drawdown(self, b: BookState) -> None:
        eq = b.equity()
        b.peak_equity = max(b.peak_equity, eq)
        if b.peak_equity > 0:
            b.max_drawdown_pct = max(b.max_drawdown_pct, (1 - eq / b.peak_equity) * 100)

    def _open(self, b: BookState, bc: dict, key: str, symbol: str, price: float, qty: float,
              cost: float, fees: float, reason: str, now: float, **meta) -> Position:
        b.seq += 1
        stop, tp = initial_levels(price, bc["exits"])
        pos = Position(id=f"{b.name}-{b.seq}", book=b.name, key=key, symbol=symbol, entry_ts=now,
                       entry_price=price, qty=qty, cost_usd=cost, stop_price=stop,
                       take_profit_price=tp, peak_price=price, entry_reason=reason, meta=meta)
        b.cash -= cost
        b.fees_paid += fees
        b.positions[pos.id] = pos
        b.marks[pos.id] = cost
        self.ledger.log("ENTER", b.name, symbol, reason, price=price, usd=round(cost, 2),
                        stop=stop, take_profit=tp, **{k: v for k, v in meta.items() if k != "raw"})
        return pos

    def _close(self, b: BookState, bc: dict, pos: Position, proceeds: float, exit_price: float,
               fees: float, reason: str, now: float) -> None:
        pnl = proceeds - pos.cost_usd
        b.cash += proceeds
        b.fees_paid += fees
        b.realized_pnl += pnl
        b.trades += 1
        if pnl > 0:
            b.wins += 1
        else:
            b.losses += 1
        b.positions.pop(pos.id, None)
        b.marks.pop(pos.id, None)
        b.cooldowns[pos.key] = now + bc["risk"]["cooldown_min"] * 60
        pct = pnl / pos.cost_usd * 100 if pos.cost_usd else 0.0
        self.ledger.log("EXIT", b.name, pos.symbol, reason, pnl=round(pnl, 2), pnl_pct=round(pct, 2),
                        exit_price=exit_price, equity=round(b.equity(), 2))
        self.ledger.record_trade({
            "book": b.name, "symbol": pos.symbol, "key": pos.key, "entry_ts": pos.entry_ts,
            "exit_ts": now, "entry_price": pos.entry_price, "exit_price": exit_price, "qty": pos.qty,
            "cost_usd": round(pos.cost_usd, 4), "proceeds_usd": round(proceeds, 4),
            "pnl_usd": round(pnl, 4), "pnl_pct": round(pct, 3), "entry_reason": pos.entry_reason,
            "exit_reason": reason, "hold_min": round((now - pos.entry_ts) / 60, 1)})

    def _reject(self, b: BookState, bc: dict, key: str, symbol: str, reason: str, now: float, **d):
        b.rejected += 1
        b.rejected_until[key] = now + bc.get("recheck_after_min", 15) * 60
        self.ledger.log("REJECT", b.name, symbol, reason, **d)

    def _blocked(self, b: BookState, key: str, now: float) -> bool:
        held = any(p.key == key for p in b.positions.values())
        return held or b.cooldowns.get(key, 0) > now or b.rejected_until.get(key, 0) > now

    def _prune(self, b: BookState, now: float) -> None:
        b.cooldowns = {k: t for k, t in b.cooldowns.items() if t > now}
        b.rejected_until = {k: t for k, t in b.rejected_until.items() if t > now}

    # ---- exchange coins ------------------------------------------------------
    def step_cex(self, now: float) -> None:
        b, bc, feed = self.books["cex"], self.bcfg["cex"], self.feeds["cex"]
        fee = bc["fee_pct"] / 100
        tickers = feed.tickers()

        for pos in list(b.positions.values()):
            t = tickers.get(pos.key)
            if not t:
                continue
            b.marks[pos.id] = pos.qty * t["bid"] * (1 - fee)
            reason = check_exit(pos, t["bid"], now, bc["exits"])
            if reason:
                book = feed.book(pos.key)
                avg, qty, usd = fill_from_book(book["bids"], qty=pos.qty)
                if qty < pos.qty:  # thin book: value the remainder at the worst level seen
                    worst = book["bids"][-1][0] if book["bids"] else t["bid"]
                    usd += (pos.qty - qty) * worst
                    avg = usd / pos.qty
                fees = usd * fee
                self._close(b, bc, pos, usd - fees, avg, fees, reason, now)

        if not self._new_day_and_halt(b, bc, now):
            return
        slots = bc["risk"]["max_open_positions"] - len(b.positions)
        if slots <= 0:
            return
        signals = []
        for key in cexmod.pick_candidates(tickers, bc):
            if self._blocked(b, key, now):
                continue
            t = tickers[key]
            ok, why, strength = cexmod.breakout_signal(feed.ohlc(key), t["last"], bc)
            if ok:
                signals.append((strength, key, why))
            else:
                b.screened_out += 1
        signals.sort(reverse=True)

        for _, key, why in signals[:slots]:
            t = tickers[key]
            usd, size_note = position_size(b.equity(), b.cash, bc["risk"])
            if usd <= 0:
                self._reject(b, bc, key, t["symbol"], size_note, now)
                continue
            book = feed.book(key)
            spend = usd * (1 - fee)
            avg, qty, filled = fill_from_book(book["asks"], usd=spend)
            mid = (t["bid"] + t["ask"]) / 2
            if filled < spend * 0.999 or qty <= 0:
                self._reject(b, bc, key, t["symbol"], "order book too thin for size", now)
                continue
            slip = (avg / mid - 1) * 100
            if slip > bc["risk"]["max_slippage_pct"]:
                self._reject(b, bc, key, t["symbol"], f"estimated slippage {slip:.2f}% > max "
                             f"{bc['risk']['max_slippage_pct']:g}%", now)
                continue
            self._open(b, bc, key, t["symbol"], avg, qty, usd, usd * fee,
                       f"{why} | size {size_note} | slip {slip:.2f}%", now, slippage_pct=round(slip, 3))

    # ---- DEX tokens ----------------------------------------------------------
    def step_dex(self, now: float) -> None:
        b, bc, dex = self.books["dex"], self.bcfg["dex"], self.feeds["dex"]
        netfee = bc["network_fee_usd"]

        if b.positions:
            live = dex.pairs(list({p.key for p in b.positions.values()}))
            for pos in list(b.positions.values()):
                p = live.get(pos.key)
                if not p:
                    continue
                b.marks[pos.id] = pos.qty * p["price"]
                reason = None
                entry_liq = pos.meta.get("entry_liquidity") or 0
                if entry_liq and p["liquidity"] < entry_liq * (1 - bc["liquidity_drop_exit_pct"] / 100):
                    reason = f"liquidity pulled ({(p['liquidity'] / entry_liq - 1) * 100:+.0f}%)"
                reason = reason or check_exit(pos, p["price"], now, bc["exits"])
                if reason:
                    usd = dex.quote_sell(pos.key, pos.meta["raw"])
                    if usd is None:
                        usd, reason = 0.0, reason + "; NO SELL ROUTE - position lost"
                    proceeds = max(0.0, usd - netfee)
                    self._close(b, bc, pos, proceeds, usd / pos.qty if pos.qty else 0.0, netfee,
                                reason, now)

        if not self._new_day_and_halt(b, bc, now):
            return
        slots = bc["risk"]["max_open_positions"] - len(b.positions)
        if slots <= 0:
            return
        mints = [m for m in dex.discover() if not self._blocked(b, m, now)]
        if not mints:
            return
        data = dex.pairs(mints)
        now_ms = now * 1000
        for mint in mints:
            if slots <= 0:
                break
            p = data.get(mint)
            if not p:
                continue
            ok, why = dexmod.screen(p, now_ms, bc)
            if not ok:
                b.screened_out += 1
                b.rejected_until[mint] = now + 5 * 60  # look again in 5 min, quietly
                continue
            sym = "$" + p["symbol"]
            safe, safety_note, info = dexmod.safety_check(dex, mint, bc)
            if not safe:
                self._reject(b, bc, mint, sym, safety_note, now)
                continue
            cap = p["liquidity"] * bc["max_pct_of_liquidity"] / 100
            usd, size_note = position_size(b.equity(), b.cash, bc["risk"], liquidity_cap=cap)
            if usd <= 0:
                self._reject(b, bc, mint, sym, size_note, now)
                continue
            raw = dex.quote_buy(mint, usd)
            if not raw:
                self._reject(b, bc, mint, sym, "no buy route on Jupiter", now)
                continue
            tokens = raw / 10 ** info["decimals"]
            eff = usd / tokens
            slip = (eff / p["price"] - 1) * 100
            if slip > bc["risk"]["max_slippage_pct"]:
                self._reject(b, bc, mint, sym, f"estimated slippage {slip:.1f}%, maximum allowed "
                             f"{bc['risk']['max_slippage_pct']:g}%", now)
                continue
            back = dex.quote_sell(mint, raw)
            if back is None:
                self._reject(b, bc, mint, sym, "honeypot: sell simulation failed (no route)", now)
                continue
            rt_loss = (1 - back / usd) * 100
            if rt_loss > bc["max_roundtrip_loss_pct"]:
                self._reject(b, bc, mint, sym, f"honeypot/tax: buy-then-sell loses {rt_loss:.1f}%", now)
                continue
            self._open(b, bc, mint, sym, eff, tokens, usd + netfee, netfee,
                       f"{why} | {safety_note} | size {size_note} | slip {slip:.2f}%", now,
                       raw=raw, decimals=info["decimals"], entry_liquidity=p["liquidity"],
                       slippage_pct=round(slip, 3), roundtrip_loss_pct=round(rt_loss, 2))
            slots -= 1

    # ---- loop ------------------------------------------------------------------
    def summary(self) -> None:
        for name in self.active_books():
            b = self.books[name]
            eq = b.equity()
            self.ledger.log("SUMMARY", name, reason=(
                f"equity ${eq:,.2f} ({(eq / b.starting_equity - 1) * 100:+.1f}%), "
                f"{len(b.positions)} open, {b.trades} closed ({b.wins}W/{b.losses}L), "
                f"{b.rejected} rejected, max drawdown {b.max_drawdown_pct:.1f}%"))

    def step(self, now: float | None = None) -> None:
        now = self.clock() if now is None else now
        for name in self.active_books():
            if now < self.next_run.get(name, 0):
                continue
            self.next_run[name] = now + self.bcfg[name]["interval_sec"]
            b = self.books[name]
            try:
                (self.step_cex if name == "cex" else self.step_dex)(now)
            except Exception as e:  # noqa: BLE001  keep the desk alive through API hiccups
                self.ledger.log("ERROR", name, reason=f"{type(e).__name__}: {e}")
            self._prune(b, now)
            self._track_drawdown(b)
        if now - self.last_summary >= 3600:
            self.last_summary = now
            self.summary()
        self.ledger.save_books(self.books)

    def run_forever(self) -> None:
        self.ledger.log("INFO", "desk", reason="paper trading started (simulated money only). "
                        "Press Ctrl+C to stop.")
        self.summary()
        try:
            while True:
                self.step()
                time.sleep(1)
        except KeyboardInterrupt:
            self.ledger.save_books(self.books)
            self.summary()
            self.ledger.log("INFO", "desk", reason="stopped; state saved")
