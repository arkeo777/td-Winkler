"""Settings. Every number here can be overridden in config.json."""
from __future__ import annotations

import copy
import json
import os

DEFAULTS = {
    # Where state, logs and trade history are written.
    "data_dir": "data",

    # Optional phone alerts through ntfy.sh (free app). Leave blank to disable.
    "alerts": {
        "ntfy_topic": "",
        "notify_on": ["ENTER", "EXIT", "HALT", "SUMMARY"],
    },

    # Shared risk rules. A book can override any of these in its own "risk" block.
    "risk": {
        "position_pct": 10.0,          # % of the book's equity per trade (the post used 40%)
        "max_position_usd": 250.0,     # hard cap per trade
        "min_position_usd": 5.0,       # skip trades smaller than this
        "max_open_positions": 5,
        "max_slippage_pct": 2.0,       # reject entries that would fill worse than this
        "daily_loss_limit_pct": 10.0,  # stop opening trades for the day after this drawdown
        "cooldown_min": 60,            # don't re-buy the same coin this soon after selling
    },

    # Shared exit rules. A book can override these in its own "exits" block.
    "exits": {
        "stop_loss_pct": 6.0,          # -6% stop, as in the post
        "take_profit_r": 3.0,          # take profit at 3x the stop distance (+18%)
        "trail_activate_pct": 3.0,     # once up this much, start a trailing stop...
        "trail_pct": 4.0,              # ...this far below the highest price seen
        "max_hold_hours": 24.0,
    },

    "books": {
        # Coins listed on a centralized exchange (Kraken public data, no account needed).
        "cex": {
            "enabled": True,
            "starting_equity": 1000.0,
            "interval_sec": 30,
            "universe": "all",          # "all" USD pairs, or "watchlist" only
            "watchlist": [],            # e.g. ["BTC/USD", "ETH/USD", "SOL/USD"]; always scanned
            "exclude_bases": ["USDT", "USDC", "DAI", "PYUSD", "USDG", "RLUSD", "TUSD", "USDS",
                              "FDUSD", "USDD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "EURT",
                              "EURR", "USDQ", "USDR"],
            "min_volume_usd_24h": 1_000_000.0,
            "max_candidates": 15,       # how many movers get a closer look each cycle
            "breakout_lookback_min": 60,
            "volume_window_min": 5,
            "volume_spike_mult": 3.0,
            "max_extension_pct": 3.0,   # don't chase if already this far above the 1h high
            "fee_pct": 0.40,            # Kraken Pro taker fee for small accounts
        },
        # Brand-new tokens on Solana DEXes (DexScreener + RugCheck + Jupiter quotes).
        "dex": {
            "enabled": True,
            "starting_equity": 1000.0,
            "interval_sec": 20,
            "min_liquidity_usd": 20_000.0,
            "min_age_min": 10,
            "max_age_hours": 72,
            "min_volume_m5_usd": 2_000.0,
            "min_buy_sell_ratio": 1.2,
            "min_change_m5_pct": 0.0,
            "min_change_h1_pct": 0.0,
            "require_lp_locked_pct": 90.0,
            "max_roundtrip_loss_pct": 5.0,   # buy-then-sell quote must lose less than this
            "max_pct_of_liquidity": 1.0,     # never be more than 1% of the pool
            "liquidity_drop_exit_pct": 40.0, # sell immediately if pool liquidity falls this much
            "network_fee_usd": 0.02,         # Solana fee + priority fee per swap
            "recheck_after_min": 30,         # don't re-examine a rejected token sooner
            "risk": {"position_pct": 5.0, "max_position_usd": 100.0},
        },
    },
}


def _merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load(path: str | None = None) -> dict:
    cfg = copy.deepcopy(DEFAULTS)
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            cfg = _merge(cfg, json.load(f))
    return cfg


def book_cfg(cfg: dict, name: str) -> dict:
    """A book's settings with the shared risk/exit rules merged in."""
    b = copy.deepcopy(cfg["books"][name])
    b["risk"] = _merge(cfg["risk"], b.get("risk", {}))
    b["exits"] = _merge(cfg["exits"], b.get("exits", {}))
    return b
