"""EQUITY agent / morning report: what actually happened, from the saved logs."""
from __future__ import annotations

import csv
import os
import time
from collections import Counter


def _reason_kind(reason: str) -> str:
    r = reason.lower()
    for k in ("take-profit", "trailing stop", "stop-loss", "max hold", "liquidity pulled"):
        if k in r:
            return k
    return reason.split("(")[0].strip()[:40]


def build(ledger) -> str:
    books = ledger.load_books()
    trades = ledger.read_jsonl(ledger.trades_path)
    decisions = ledger.read_jsonl(ledger.decisions_path)
    if not books:
        return "No data yet. Start the desk with:  python -m papertrader run"
    out = ["", "PAPER TRADING REPORT (simulated money, no real trades)", "=" * 60]
    for name, b in books.items():
        eq = b.equity()
        bt = [t for t in trades if t["book"] == name]
        wins = [t["pnl_usd"] for t in bt if t["pnl_usd"] > 0]
        losses = [t["pnl_usd"] for t in bt if t["pnl_usd"] <= 0]
        gross_win, gross_loss = sum(wins), -sum(losses)
        pf = gross_win / gross_loss if gross_loss > 0 else float("inf") if gross_win else 0.0
        label = "Exchange coins (Kraken)" if name == "cex" else "New Solana tokens (DEX)"
        out += [
            "", f"{label}",
            f"  Equity          ${eq:,.2f}  (started ${b.starting_equity:,.2f}, "
            f"{(eq / b.starting_equity - 1) * 100:+.2f}%)",
            f"  Cash / open     ${b.cash:,.2f} cash, {len(b.positions)} open position(s)",
            f"  Closed trades   {len(bt)}  ({len(wins)} wins / {len(losses)} losses"
            + (f", win rate {len(wins) / len(bt) * 100:.0f}%)" if bt else ")"),
            f"  Realized P&L    ${b.realized_pnl:,.2f}   fees paid ${b.fees_paid:,.2f}",
        ]
        if bt:
            out += [
                f"  Avg win / loss  ${(gross_win / len(wins)) if wins else 0:,.2f} / "
                f"${(-gross_loss / len(losses)) if losses else 0:,.2f}   profit factor "
                f"{'inf' if pf == float('inf') else f'{pf:.2f}'}",
                f"  Best / worst    ${max(t['pnl_usd'] for t in bt):,.2f} / ${min(t['pnl_usd'] for t in bt):,.2f}",
                "  Exits by reason " + ", ".join(f"{k}: {v}" for k, v in
                                                 Counter(_reason_kind(t['exit_reason']) for t in bt).most_common()),
            ]
        out.append(f"  Max drawdown    {b.max_drawdown_pct:.1f}%")
        rej = Counter(_reason_kind(d["reason"]) for d in decisions
                      if d.get("book") == name and d.get("event") == "REJECT")
        out.append(f"  Rejected        {b.rejected} (plus {b.screened_out} quietly screened out)")
        for k, v in rej.most_common(6):
            out.append(f"      {v:>4} x {k}")
        for p in b.positions.values():
            mark = b.marks.get(p.id, p.cost_usd)
            out.append(f"  OPEN {p.symbol:<12} cost ${p.cost_usd:,.2f} now ${mark:,.2f} "
                       f"({(mark / p.cost_usd - 1) * 100:+.1f}%) since "
                       f"{time.strftime('%m-%d %H:%M', time.localtime(p.entry_ts))}")
    out += ["", "Every decision with its reason: " + ledger.decisions_path,
            "Closed trades (open in Excel):  " + os.path.join(ledger.dir, "trades.csv"), ""]
    export_csv(trades, os.path.join(ledger.dir, "trades.csv"))
    return "\n".join(out)


def export_csv(trades: list, path: str) -> None:
    cols = ["book", "symbol", "entry_time", "exit_time", "hold_min", "entry_price", "exit_price",
            "cost_usd", "proceeds_usd", "pnl_usd", "pnl_pct", "entry_reason", "exit_reason", "key"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for t in trades:
            row = dict(t)
            row["entry_time"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t["entry_ts"]))
            row["exit_time"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t["exit_ts"]))
            w.writerow(row)
