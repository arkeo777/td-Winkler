"""LOGGER agent: writes every decision with its reason, and saves state.

Files in the data folder:
  state.json       current cash, open positions, counters (resumes after restart)
  decisions.jsonl  one line per decision: ENTER, EXIT, REJECT, HALT, SUMMARY, ERROR
  trades.jsonl     one line per closed trade
"""
from __future__ import annotations

import json
import os
import sys
import time

from .models import BookState

COLORS = {"ENTER": "\033[92m", "EXIT": "\033[96m", "REJECT": "\033[93m", "HALT": "\033[91m",
          "ERROR": "\033[91m", "SUMMARY": "\033[95m", "INFO": "\033[0m"}
RESET = "\033[0m"


class Ledger:
    def __init__(self, data_dir: str, notifier=None, quiet: bool = False, clock=time.time):
        self.dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        self.state_path = os.path.join(data_dir, "state.json")
        self.decisions_path = os.path.join(data_dir, "decisions.jsonl")
        self.trades_path = os.path.join(data_dir, "trades.jsonl")
        self.notifier = notifier
        self.quiet = quiet
        self.clock = clock
        self.color = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None

    # ---- state -------------------------------------------------------------
    def load_books(self) -> dict:
        if not os.path.exists(self.state_path):
            return {}
        with open(self.state_path, encoding="utf-8") as f:
            raw = json.load(f)
        return {name: BookState.from_dict(b) for name, b in raw.get("books", {}).items()}

    def save_books(self, books: dict) -> None:
        tmp = self.state_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"saved_at": self.clock(), "books": {n: b.to_dict() for n, b in books.items()}},
                      f, indent=1)
        os.replace(tmp, self.state_path)

    # ---- logs --------------------------------------------------------------
    def log(self, event: str, book: str, symbol: str = "", reason: str = "", **details) -> None:
        ts = self.clock()
        rec = {"ts": ts, "time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts)),
               "book": book, "event": event, "symbol": symbol, "reason": reason}
        rec.update(details)
        with open(self.decisions_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
        line = f"{rec['time']}  {book.upper():<4} {event:<7} {symbol:<14} {reason}"
        if not self.quiet:
            print(f"{COLORS.get(event, '')}{line}{RESET}" if self.color else line, flush=True)
        if self.notifier:
            self.notifier.maybe_send(event, line)

    def record_trade(self, trade: dict) -> None:
        with open(self.trades_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(trade) + "\n")

    def read_jsonl(self, path: str) -> list:
        if not os.path.exists(path):
            return []
        out = []
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        out.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        return out


class NtfyNotifier:
    """DESK MANAGER alerts: pushes chosen events to the free ntfy app on your phone."""

    def __init__(self, topic: str, events: list):
        self.topic = topic
        self.events = set(events)

    def maybe_send(self, event: str, text: str) -> None:
        if not self.topic or event not in self.events:
            return
        try:
            import requests
            requests.post(f"https://ntfy.sh/{self.topic}", data=text.encode("utf-8"),
                          headers={"Title": f"Paper trader: {event}"}, timeout=5)
        except Exception:
            pass  # alerts are best-effort; never stop trading over them
