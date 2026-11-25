"""Positions and per-book account state (all simulated money)."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class Position:
    id: str
    book: str
    key: str               # exchange pair or token mint address
    symbol: str
    entry_ts: float
    entry_price: float     # average fill price in USD
    qty: float             # coins/tokens held
    cost_usd: float        # cash spent, including fees
    stop_price: float
    take_profit_price: float
    peak_price: float
    trailing: bool = False
    entry_reason: str = ""
    meta: dict = field(default_factory=dict)


@dataclass
class BookState:
    name: str
    starting_equity: float
    cash: float
    positions: dict = field(default_factory=dict)      # id -> Position
    marks: dict = field(default_factory=dict)          # position id -> last USD value
    day: str = ""
    day_start_equity: float = 0.0
    halted_day: str = ""
    cooldowns: dict = field(default_factory=dict)      # key -> ts when re-entry allowed
    rejected_until: dict = field(default_factory=dict) # key -> ts when it may be re-checked
    trades: int = 0
    wins: int = 0
    losses: int = 0
    realized_pnl: float = 0.0
    fees_paid: float = 0.0
    peak_equity: float = 0.0
    max_drawdown_pct: float = 0.0
    screened_out: int = 0
    rejected: int = 0
    seq: int = 0

    def equity(self) -> float:
        return self.cash + sum(self.marks.get(pid, p.cost_usd) for pid, p in self.positions.items())

    def to_dict(self) -> dict:
        d = asdict(self)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "BookState":
        d = dict(d)
        d["positions"] = {k: Position(**v) for k, v in d.get("positions", {}).items()}
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in known})
