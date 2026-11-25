"""Command line:  python -m papertrader <command>

  run            start paper trading with live market data (Ctrl+C to stop; resumes where it left off)
  report         summary of results so far, and writes trades.csv
  check MINT     run the rug checks on one Solana token address and explain the result
  demo           run 24 hours of a FAKE market in a few seconds to see how it works
  reset          delete saved state and logs to start over with fresh simulated money
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys

from . import config as config_mod
from .ledger import Ledger, NtfyNotifier
from .report import build


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="papertrader", description="Paper-trading desk (simulated money only)")
    ap.add_argument("--config", default="config.json", help="settings file (default: config.json)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--only", choices=["cex", "dex"], help="run just one book")
    sub.add_parser("report")
    c = sub.add_parser("check")
    c.add_argument("mint")
    d = sub.add_parser("demo")
    d.add_argument("--hours", type=float, default=24.0)
    d.add_argument("--seed", type=int, default=7)
    d.add_argument("--verbose", action="store_true")
    sub.add_parser("reset")
    a = ap.parse_args(argv)

    cfg = config_mod.load(a.config)

    if a.cmd == "demo":
        data_dir = "demo-data"
        shutil.rmtree(data_dir, ignore_errors=True)
        ledger = Ledger(data_dir, quiet=not a.verbose)
        from .demo import run_demo
        print(f"Running {a.hours:g} simulated hours on a FAKE market...")
        run_demo(cfg, ledger, hours=a.hours, seed=a.seed)
        print(build(ledger))
        print("Last decisions:")
        for d_ in ledger.read_jsonl(ledger.decisions_path)[-12:]:
            print(f"  {d_['book'].upper():<4} {d_['event']:<7} {d_['symbol']:<12} {d_['reason']}")
        print("\nThis was a random fake market. Run it live with:  python -m papertrader run")
        return 0

    ledger = Ledger(cfg["data_dir"])

    if a.cmd == "report":
        print(build(ledger))
        return 0

    if a.cmd == "reset":
        if input(f"Delete everything in '{cfg['data_dir']}' and start over? [y/N] ").lower() == "y":
            shutil.rmtree(cfg["data_dir"], ignore_errors=True)
            print("Reset.")
        return 0

    from .http import Http
    http = Http(min_interval={"api.kraken.com": 1.1, "api.rugcheck.xyz": 1.0,
                              "lite-api.jup.ag": 1.1, "api.mainnet-beta.solana.com": 0.3,
                              "api.dexscreener.com": 0.25})

    if a.cmd == "check":
        from .dex import LiveDex, safety_check
        dex = LiveDex(http)
        ok, reason, info = safety_check(dex, a.mint, config_mod.book_cfg(cfg, "dex"))
        print(("PASS  " if ok else "FAIL  ") + reason)
        for k in ("mint_authority", "freeze_authority", "lp_locked_pct", "danger", "warn", "score"):
            if k in info:
                print(f"  {k}: {info[k]}")
        if ok:
            raw = dex.quote_buy(a.mint, 50)
            back = dex.quote_sell(a.mint, raw) if raw else None
            if back is None:
                print("FAIL  honeypot: a $50 buy could not be sold back (no route)")
            else:
                print(f"  $50 buy -> sell back now returns ${back:.2f} ({(1 - back / 50) * 100:.1f}% round-trip cost)")
        return 0

    if a.cmd == "run":
        if a.only:
            for name in cfg["books"]:
                cfg["books"][name]["enabled"] = name == a.only
        ledger.notifier = NtfyNotifier(cfg["alerts"]["ntfy_topic"], cfg["alerts"]["notify_on"]) \
            if cfg["alerts"]["ntfy_topic"] else None
        from .cex import KrakenFeed
        from .desk import Desk
        from .dex import LiveDex
        desk = Desk(cfg, ledger, cex_feed=KrakenFeed(http), dex_feed=LiveDex(http))
        if not desk.active_books():
            print("No books enabled in config.json.")
            return 1
        desk.run_forever()
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
