"""A fake market for trying the desk offline and for tests. Its results mean nothing about
real markets: prices are random, with made-up pumps, dumps, rugs and honeypots mixed in."""
from __future__ import annotations

import math
import random
import string


class SimCex:
    def __init__(self, rng: random.Random, start: float, n_pairs: int = 15):
        self.rng = rng
        self.t = start - 3 * 3600  # pre-generate 3h of history
        self.pairs = {}
        for i in range(n_pairs):
            price = math.exp(rng.uniform(math.log(0.05), math.log(500)))
            self.pairs[f"SIM{i}USD"] = {
                "symbol": f"SIM{i}/USD", "price": price, "base_vol": rng.uniform(5e3, 6e4),
                "candles": [], "regime": 0, "drift": 0.0, "volmult": 1.0}
        self.advance(start)

    def advance(self, now: float) -> None:
        while self.t + 60 <= now:
            self.t += 60
            for p in self.pairs.values():
                r = self.rng
                if p["regime"] <= 0:
                    p["drift"], p["volmult"] = 0.0, 1.0
                    # Volume spikes come with a random direction: some breakouts keep going,
                    # just as many reverse. On average there is no edge to find here.
                    if r.random() < 0.005:
                        p["regime"], p["volmult"] = r.randint(5, 30), r.uniform(3, 8)
                        p["drift"] = r.gauss(0, 0.003)
                else:
                    p["regime"] -= 1
                o = p["price"]
                path = [o]
                for _ in range(4):
                    path.append(path[-1] * math.exp(p["drift"] / 4 + r.gauss(0, 0.0025 * math.sqrt(p["volmult"]) / 2)))
                c = path[-1]
                p["price"] = c
                vol = p["base_vol"] * p["volmult"] * r.lognormvariate(0, 0.4)
                p["candles"].append([self.t, o, max(path), min(path), c, vol])
                if len(p["candles"]) > 1500:
                    p["candles"] = p["candles"][-1500:]

    def tickers(self) -> dict:
        out = {}
        for k, p in self.pairs.items():
            day = p["candles"][-1440:]
            opened = day[0][1] if day else p["price"]
            out[k] = {"symbol": p["symbol"], "last": p["price"], "bid": p["price"] * 0.9995,
                      "ask": p["price"] * 1.0005, "vol_usd_24h": sum(c[5] for c in day) * 1440 / max(1, len(day)),
                      "chg_today_pct": (p["price"] / opened - 1) * 100}
        return out

    def ohlc(self, key: str) -> list:
        p = self.pairs[key]
        return p["candles"] + [[self.t + 60, p["price"], p["price"], p["price"], p["price"], 0.0]]

    def book(self, key: str) -> dict:
        px = self.pairs[key]["price"]
        depth = self.pairs[key]["base_vol"] / 4
        return {"bids": [(px * (0.9995 - i * 0.0005), depth / px) for i in range(50)],
                "asks": [(px * (1.0005 + i * 0.0005), depth / px) for i in range(50)]}


TRAITS = ["honest"] * 8 + ["mint_auth"] * 3 + ["freeze"] * 2 + ["lp_unlocked"] * 3 + \
         ["honeypot"] * 2 + ["tax"] * 2


class SimDex:
    def __init__(self, rng: random.Random, start: float):
        self.rng = rng
        self.t = start - 3 * 3600
        self.tokens = {}
        self.n = 0
        self.advance(start)

    def _spawn(self) -> None:
        r = self.rng
        self.n += 1
        mint = f"SIMMINT{self.n:05d}"
        price = math.exp(r.uniform(math.log(1e-5), math.log(1e-2)))
        self.tokens[mint] = {
            "symbol": "".join(r.choice(string.ascii_uppercase) for _ in range(5)),
            "created": self.t, "price": price, "liq": r.uniform(15e3, 250e3), "decimals": 6,
            "trait": r.choice(TRAITS), "hist": [price], "drift": 0.0, "regime": 0,
            "rug_at": self.t + r.uniform(20, 600) * 60 if r.random() < 0.3 else None, "rugged": False,
            "vol_m5": 0.0, "buys": 0, "sells": 0}

    def advance(self, now: float) -> None:
        while self.t + 60 <= now:
            self.t += 60
            if self.rng.random() < 0.35:
                self._spawn()
            for m, tk in list(self.tokens.items()):
                r = self.rng
                if self.t - tk["created"] > 30 * 3600:
                    del self.tokens[m]
                    continue
                if tk["rug_at"] and not tk["rugged"] and self.t >= tk["rug_at"]:
                    tk["rugged"], tk["price"], tk["liq"] = True, tk["price"] * 0.03, 400.0
                if not tk["rugged"]:
                    if tk["regime"] <= 0:
                        # Short, random trends with a slow bleed, like most new tokens.
                        tk["regime"], tk["drift"] = r.randint(1, 6), r.gauss(-0.003, 0.015)
                    tk["regime"] -= 1
                    step = tk["drift"] + r.gauss(0, 0.03)
                    tk["price"] *= math.exp(step)
                    tk["liq"] *= math.exp(step / 2)
                    trades = r.randint(5, 80)
                    share = min(0.95, max(0.05, 0.5 + step * 10))
                    tk["buys"], tk["sells"] = int(trades * share), trades - int(trades * share)
                    tk["vol_m5"] = tk["liq"] * r.uniform(0.01, 0.2)
                tk["hist"].append(tk["price"])
                tk["hist"] = tk["hist"][-61:]

    # interface ------------------------------------------------------------
    def discover(self) -> list:
        recent = sorted(self.tokens, key=lambda m: -self.tokens[m]["created"])
        return recent[:30]

    def pairs(self, mints: list) -> dict:
        out = {}
        for m in mints:
            tk = self.tokens.get(m)
            if not tk:
                continue
            h = tk["hist"]
            out[m] = {"symbol": tk["symbol"], "price": tk["price"], "liquidity": tk["liq"],
                      "vol_m5": tk["vol_m5"], "buys_m5": tk["buys"], "sells_m5": tk["sells"],
                      "chg_m5": (h[-1] / h[max(0, len(h) - 6)] - 1) * 100,
                      "chg_h1": (h[-1] / h[0] - 1) * 100, "created_ms": tk["created"] * 1000, "dex": "sim"}
        return out

    def mint_info(self, mint: str) -> dict:
        tk = self.tokens[mint]
        return {"decimals": tk["decimals"], "program": "sim", "extensions": [],
                "mint_authority": "DevWallet111" if tk["trait"] == "mint_auth" else None,
                "freeze_authority": "DevWallet111" if tk["trait"] == "freeze" else None}

    def rug_summary(self, mint: str) -> dict:
        tk = self.tokens[mint]
        return {"lp_locked_pct": 5.0 if tk["trait"] == "lp_unlocked" else 100.0,
                "danger": ["Liquidity removed"] if tk["rugged"] else [], "warn": [], "score": 1}

    def _pool(self, tk):
        y = tk["liq"] / 2
        return y / tk["price"], y  # token reserve, usd reserve

    def quote_buy(self, mint: str, usd: float):
        tk = self.tokens.get(mint)
        if not tk or tk["rugged"]:
            return None
        x, y = self._pool(tk)
        out = x * usd * 0.9975 / (y + usd * 0.9975)
        return int(out * 10 ** tk["decimals"])

    def quote_sell(self, mint: str, raw: int):
        tk = self.tokens.get(mint)
        if not tk or tk["rugged"] or tk["trait"] == "honeypot":
            return None
        x, y = self._pool(tk)
        t = raw / 10 ** tk["decimals"] * 0.9975
        usd = y * t / (x + t)
        return usd * (0.8 if tk["trait"] == "tax" else 1.0)


def run_demo(cfg: dict, ledger, hours: float = 24.0, seed: int = 7, start: float = 1_767_225_600.0):
    """Run the real desk logic against the fake market for `hours` of simulated time."""
    from .desk import Desk

    rng = random.Random(seed)
    clock = {"t": start}
    cex, dex = SimCex(rng, start), SimDex(rng, start)
    ledger.clock = lambda: clock["t"]
    desk = Desk(cfg, ledger, cex_feed=cex, dex_feed=dex, clock=lambda: clock["t"])
    end = start + hours * 3600
    while clock["t"] < end:
        clock["t"] += 10
        cex.advance(clock["t"])
        dex.advance(clock["t"])
        desk.step(clock["t"])
    ledger.save_books(desk.books)
    return desk
