"""SIZER and EXIT agents, plus order-book fill simulation. Pure functions, easy to test."""
from __future__ import annotations


def position_size(equity: float, cash: float, risk: dict, liquidity_cap: float | None = None):
    """Return (usd, reason). usd is 0 when the trade should be skipped."""
    usd = equity * risk["position_pct"] / 100.0
    usd = min(usd, risk["max_position_usd"], cash)
    if liquidity_cap is not None:
        usd = min(usd, liquidity_cap)
    if usd < risk["min_position_usd"]:
        return 0.0, f"size ${usd:,.2f} below minimum ${risk['min_position_usd']:,.2f}"
    return round(usd, 2), f"{usd / equity * 100:.1f}% of ${equity:,.2f} equity"


def initial_levels(entry_price: float, exits: dict):
    """Return (stop_price, take_profit_price)."""
    sl = exits["stop_loss_pct"] / 100.0
    return entry_price * (1 - sl), entry_price * (1 + exits["take_profit_r"] * sl)


def check_exit(pos, price: float, now: float, exits: dict):
    """Update the position's peak/trailing stop and return an exit reason, or None."""
    if price > pos.peak_price:
        pos.peak_price = price
    if pos.peak_price >= pos.entry_price * (1 + exits["trail_activate_pct"] / 100.0):
        trail_stop = pos.peak_price * (1 - exits["trail_pct"] / 100.0)
        if trail_stop > pos.stop_price:
            pos.stop_price = trail_stop
            pos.trailing = True
    change = (price / pos.entry_price - 1) * 100
    if price <= pos.stop_price:
        if pos.trailing:
            return f"trailing stop hit ({change:+.1f}%, peak {(pos.peak_price / pos.entry_price - 1) * 100:+.1f}%)"
        return f"stop-loss hit ({change:+.1f}%)"
    if price >= pos.take_profit_price:
        return f"take-profit {exits['take_profit_r']:g}R ({change:+.1f}%)"
    if now - pos.entry_ts >= exits["max_hold_hours"] * 3600:
        return f"max hold time {exits['max_hold_hours']:g}h ({change:+.1f}%)"
    return None


def fill_from_book(levels, usd: float | None = None, qty: float | None = None):
    """Walk order-book levels [(price, qty), ...] best-first.

    Buy with usd= (walk asks) or sell qty= (walk bids). Returns (avg_price, qty_filled, usd_filled).
    If the book is too thin, fills what it can; caller compares against what it asked for.
    """
    filled_qty = 0.0
    filled_usd = 0.0
    for price, size in levels:
        price, size = float(price), float(size)
        if price <= 0 or size <= 0:
            continue
        if usd is not None:
            take = min(size, (usd - filled_usd) / price)
        else:
            take = min(size, qty - filled_qty)
        filled_qty += take
        filled_usd += take * price
        if usd is not None and filled_usd >= usd - 1e-9:
            break
        if qty is not None and filled_qty >= qty - 1e-12:
            break
    if filled_qty <= 0:
        return 0.0, 0.0, 0.0
    return filled_usd / filled_qty, filled_qty, filled_usd
