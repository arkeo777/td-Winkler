# Paper Trader

An automated **paper-trading** desk for crypto. It watches real, live markets and makes trades
with **simulated money**, so you can see whether a strategy actually works before risking
anything.

> **It cannot trade real money.** It has no exchange account, no API keys and no wallet. It only
> reads public price data. Results are an estimate: real trading adds delays, failed transactions
> and competition from faster bots, so expect live results to be **worse** than paper results.

It runs two separate accounts ("books"), each starting with $1,000 of pretend money:

| Book | What it trades | Where the data comes from |
|---|---|---|
| `cex` | Any coin listed in USD on Kraken (BTC, ETH, SOL, DOGE, PEPE, ...) | Kraken public API |
| `dex` | Brand-new Solana tokens (pump.fun / Raydium / Meteora) | DexScreener, RugCheck.xyz, Solana RPC, Jupiter quotes |

## How it decides (the "agents")

Each cycle runs the same pipeline: **scan → check → size → execute → manage → log**.

- **Scanner.** Exchange coins: the biggest liquid movers of the day, plus your watchlist. A
  coin is a candidate when its price breaks above its 1-hour high *and* the last 5 minutes
  traded at least 3x normal volume. It won't chase a coin that is already more than 3% past the
  breakout. New tokens: recently promoted tokens with rising price, more buys than sells, at
  least $20k of liquidity and an age between 10 minutes and 3 days.
- **Rug check** (new tokens only). It rejects a token if any of these is true, and also if any
  check can't be completed:
  - the mint authority is still on, so the developer can print more tokens
  - the freeze authority is on, so the developer can freeze your tokens
  - the token uses a risky Token-2022 feature (transfer fees, transfer hooks, a permanent delegate)
  - RugCheck.xyz reports any "danger" risk
  - less than 90% of the liquidity is locked or burned
  - honeypot test: a simulated buy can't be sold back, or buying and selling straight away loses more than 5%
- **Sizer.** Each trade uses 10% of the book's equity for exchange coins, or 5% for new tokens,
  capped at $250 and $100. A trade is never more than 1% of a token's liquidity pool. (The post
  you saw used 40% per trade, which means four bad trades in a row lose about 10% of everything.)
- **Executor.** The fill price is simulated from the **real order book** (Kraken) or a **real
  swap quote** (Jupiter), and fees are subtracted. If the estimated slippage is over 2%, there's
  no trade.
- **Exit manager.** A position is sold at the first of these:
  - a −6% stop-loss
  - take-profit at +18% (3 times the stop distance)
  - a trailing stop 4% below the peak, which turns on once the trade is up 3%
  - 24 hours held
  - for new tokens, an immediate exit if the pool's liquidity drops 40% (a rug in progress)
- **Risk manager.** No more than 5 open positions per book. It stops opening trades for the day
  after a 10% daily loss, and won't re-buy a coin within 60 minutes of selling it.
- **Logger.** Every entry, exit and rejection is written to `data/decisions.jsonl` with its reason.
- **Desk manager.** Prints an hourly summary and can send optional alerts to your phone.

## Setup (one time)

You need **Python 3.9 or newer**.

**Mac:** open *Terminal*, type `python3 --version`. If it's missing, install it from
<https://www.python.org/downloads/>, then run *Install Certificates.command* from the Python
folder in Applications.

**Windows:** install Python from <https://www.python.org/downloads/>, and tick **"Add python.exe
to PATH"** during setup. In the commands below, use `python` instead of `python3`.

Then download this folder (`paper-trader`) onto your computer, open a terminal in it and run:

```bash
python3 -m pip install -r requirements.txt
```

## Use it

```bash
python3 -m papertrader demo      # 24 hours of a FAKE market in ~10 seconds, to see how it works
python3 -m papertrader run       # start paper trading on live data (Ctrl+C to stop)
python3 -m papertrader report    # results so far; also writes data/trades.csv for Excel
python3 -m papertrader check <solana-token-address>   # rug-check any token by hand
python3 -m papertrader reset     # wipe the pretend money and start over
```

- `run` keeps going until you stop it, and picks up where it left off when you start it again.
- Your computer must be awake while it runs. On a Mac you can keep it awake with
  `caffeinate -i python3 -m papertrader run`.
- To run only one book, use `run --only cex` or `run --only dex`.
- The demo's results are random and mean nothing. Only live paper results tell you something,
  and only after weeks of them.

## Settings

Copy `config.example.json` to `config.json` and change anything you like. You only need to
include the settings you want to change. Everything available, with notes, is in
`papertrader/config.py`. Examples:

```json
{
  "books": {
    "cex": { "universe": "watchlist", "watchlist": ["BTC/USD", "ETH/USD", "SOL/USD"] },
    "dex": { "enabled": false }
  },
  "risk": { "position_pct": 5 }
}
```

### Phone alerts (optional)

1. Install the free **ntfy** app (iPhone or Android).
2. Subscribe to a hard-to-guess topic name, like `paper-desk-7f3k29`.
3. Put that name in `config.json` under `"alerts": {"ntfy_topic": "paper-desk-7f3k29"}`.

You'll then get a notification for every entry, exit, halt and hourly summary. Anyone who knows
the topic name can read these alerts, so pick an obscure name.

## Reading the results honestly

- Give it **at least 2–4 weeks** and 100+ closed trades before drawing conclusions. A good night
  or a bad night is noise.
- Look at **profit factor** (above 1.3 is promising), **max drawdown** and how the results
  compare with simply holding BTC over the same period.
- The new-token book usually rejects most tokens. That's the rug check doing its job.
- If the paper results are still good after a month and you want to go further, keep the real
  stake small enough that losing all of it would be fine. Never give any bot or website your
  seed phrase, or exchange keys with withdrawal permission.

## Tests

```bash
python3 -m unittest discover -s tests -t .
```
