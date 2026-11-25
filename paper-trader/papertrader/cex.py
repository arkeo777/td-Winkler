"""Exchange-listed coins: Kraken public market data + the SCANNER strategy for them.

No API key or account is needed: only public price, candle and order-book endpoints are used.
"""
from __future__ import annotations

import time

KRAKEN = "https://api.kraken.com/0/public"
RENAME = {"XBT": "BTC", "XDG": "DOGE"}


class KrakenFeed:
    """Interface shared with the simulator: tickers(), ohlc(key), book(key)."""

    def __init__(self, http):
        self.http = http
        self._pairs = {}
        self._pairs_ts = 0.0
        self._ohlc_cache = {}

    def _call(self, path: str, **params):
        data = self.http.get(f"{KRAKEN}/{path}", params=params or None)
        if data.get("error"):
            raise RuntimeError(f"Kraken {path}: {data['error']}")
        return data["result"]

    def usd_pairs(self) -> dict:
        """pair key -> display symbol like 'BTC/USD' (refreshed hourly)."""
        if time.time() - self._pairs_ts > 3600 or not self._pairs:
            res = self._call("AssetPairs")
            pairs = {}
            for key, info in res.items():
                ws = info.get("wsname") or ""
                if not ws.endswith("/USD") or info.get("status", "online") != "online":
                    continue
                base = ws.split("/")[0]
                pairs[key] = f"{RENAME.get(base, base)}/USD"
            self._pairs, self._pairs_ts = pairs, time.time()
        return self._pairs

    def tickers(self) -> dict:
        pairs = self.usd_pairs()
        res = self._call("Ticker")
        out = {}
        for key, t in res.items():
            if key not in pairs:
                continue
            last = float(t["c"][0])
            bid, ask = float(t["b"][0]), float(t["a"][0])
            vwap24 = float(t["p"][1]) or last
            opened = float(t["o"]) or last
            out[key] = {"symbol": pairs[key], "last": last, "bid": bid, "ask": ask,
                        "vol_usd_24h": float(t["v"][1]) * vwap24,
                        "chg_today_pct": (last / opened - 1) * 100 if opened else 0.0}
        return out

    def ohlc(self, key: str) -> list:
        """1-minute candles [ts, open, high, low, close, quote_volume], oldest first. Cached 55s."""
        hit = self._ohlc_cache.get(key)
        if hit and time.time() - hit[0] < 55:
            return hit[1]
        res = self._call("OHLC", pair=key, interval=1)
        rows = next(v for k, v in res.items() if k != "last")
        candles = []
        for r in rows:
            close, vwap, vol = float(r[4]), float(r[5]), float(r[6])
            candles.append([float(r[0]), float(r[1]), float(r[2]), float(r[3]), close, vol * (vwap or close)])
        self._ohlc_cache[key] = (time.time(), candles)
        return candles

    def book(self, key: str) -> dict:
        res = self._call("Depth", pair=key, count=100)
        b = next(iter(res.values()))
        return {"bids": [(float(p), float(q)) for p, q, *_ in b["bids"]],
                "asks": [(float(p), float(q)) for p, q, *_ in b["asks"]]}


def pick_candidates(tickers: dict, cfg: dict) -> list:
    """Keys worth a closer look: the watchlist plus the biggest liquid movers today."""
    watch = {s.upper() for s in cfg.get("watchlist", [])}
    excluded = {b.upper() for b in cfg.get("exclude_bases", [])}
    chosen = [k for k, t in tickers.items() if t["symbol"].upper() in watch]
    if cfg.get("universe", "all") == "all":
        movers = [(t["chg_today_pct"], k) for k, t in tickers.items()
                  if t["vol_usd_24h"] >= cfg["min_volume_usd_24h"]
                  and t["symbol"].split("/")[0].upper() not in excluded and k not in chosen]
        movers.sort(reverse=True)
        chosen += [k for _, k in movers[: max(0, cfg["max_candidates"] - len(chosen))]]
    return chosen


def breakout_signal(candles: list, price: float, cfg: dict):
    """Return (is_signal, reason, strength).

    Signal = price breaks above the high of the last `breakout_lookback_min` completed 1-minute
    candles AND the last `volume_window_min` minutes traded at least `volume_spike_mult` times the
    normal volume for that window. Skips if price already ran too far past the breakout level.
    """
    look, win = int(cfg["breakout_lookback_min"]), int(cfg["volume_window_min"])
    done = candles[:-1]  # last candle is still forming
    if len(done) < look + win:
        return False, "not enough candle history", 0.0
    recent = done[-win:]
    prior = done[-(look + win):-win]
    hi = max(c[2] for c in prior)
    if price <= hi:
        return False, f"no breakout (price {price:.6g} <= 1h high {hi:.6g})", 0.0
    ext = (price / hi - 1) * 100
    if ext > cfg["max_extension_pct"]:
        return False, f"too extended: {ext:.1f}% above 1h high", 0.0
    prior_vol = sum(c[5] for c in prior)
    avg_window = prior_vol / (len(prior) / win) if prior_vol > 0 else 0.0
    recent_vol = sum(c[5] for c in recent)
    mult = recent_vol / avg_window if avg_window > 0 else 0.0
    if mult < cfg["volume_spike_mult"]:
        return False, f"breakout without volume ({mult:.1f}x)", 0.0
    return True, f"breakout {ext:+.1f}% over 1h high, volume {mult:.1f}x", mult
