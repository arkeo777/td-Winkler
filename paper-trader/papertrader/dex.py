"""New Solana tokens: discovery (DexScreener), RUG CHECK (Solana RPC + RugCheck.xyz),
and fill simulation from real swap quotes (Jupiter). All public, read-only, no wallet.

Interface shared with the simulator:
  discover() -> [mint, ...]
  pairs(mints) -> {mint: {symbol, price, liquidity, vol_m5, buys_m5, sells_m5, chg_m5, chg_h1, created_ms}}
  mint_info(mint) -> {decimals, mint_authority, freeze_authority, program, extensions}
  rug_summary(mint) -> {lp_locked_pct, danger: [...], warn: [...], score}
  quote_buy(mint, usd) -> raw token amount or None (no route)
  quote_sell(mint, raw) -> usd or None (no route = cannot sell)
"""
from __future__ import annotations

DEXSCREENER = "https://api.dexscreener.com"
JUPITER = "https://lite-api.jup.ag/swap/v1/quote"
RUGCHECK = "https://api.rugcheck.xyz/v1/tokens"
SOLANA_RPC = "https://api.mainnet-beta.solana.com"
USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"


def _f(x, default=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


class LiveDex:
    def __init__(self, http, rpc_url: str = SOLANA_RPC):
        self.http = http
        self.rpc_url = rpc_url

    # ---- discovery & prices ----------------------------------------------------
    def discover(self) -> list:
        mints = []
        for path in ("token-profiles/latest/v1", "token-boosts/latest/v1"):
            try:
                for item in self.http.get(f"{DEXSCREENER}/{path}") or []:
                    if item.get("chainId") == "solana" and item.get("tokenAddress"):
                        mints.append(item["tokenAddress"])
            except RuntimeError:
                continue
        return list(dict.fromkeys(mints))

    def pairs(self, mints: list) -> dict:
        out = {}
        for i in range(0, len(mints), 30):
            chunk = mints[i:i + 30]
            data = self.http.get(f"{DEXSCREENER}/tokens/v1/solana/{','.join(chunk)}") or []
            for p in data:
                mint = (p.get("baseToken") or {}).get("address")
                if mint not in chunk:
                    continue
                liq = _f((p.get("liquidity") or {}).get("usd"))
                if mint in out and out[mint]["liquidity"] >= liq:
                    continue  # keep the deepest pool per token
                tx = (p.get("txns") or {}).get("m5") or {}
                pc = p.get("priceChange") or {}
                out[mint] = {
                    "symbol": (p.get("baseToken") or {}).get("symbol", mint[:6]),
                    "price": _f(p.get("priceUsd")),
                    "liquidity": liq,
                    "vol_m5": _f((p.get("volume") or {}).get("m5")),
                    "buys_m5": int(tx.get("buys") or 0),
                    "sells_m5": int(tx.get("sells") or 0),
                    "chg_m5": _f(pc.get("m5")),
                    "chg_h1": _f(pc.get("h1")),
                    "created_ms": _f(p.get("pairCreatedAt")),
                    "dex": p.get("dexId", ""),
                }
        return out

    # ---- safety ----------------------------------------------------------------
    def mint_info(self, mint: str) -> dict:
        body = {"jsonrpc": "2.0", "id": 1, "method": "getAccountInfo",
                "params": [mint, {"encoding": "jsonParsed"}]}
        res = self.http.post(self.rpc_url, json=body)
        value = (res or {}).get("result", {}).get("value")
        if not value:
            raise RuntimeError("mint account not found")
        info = value["data"]["parsed"]["info"]
        exts = [e.get("extension") for e in info.get("extensions", []) if isinstance(e, dict)]
        return {"decimals": int(info["decimals"]), "mint_authority": info.get("mintAuthority"),
                "freeze_authority": info.get("freezeAuthority"), "program": value.get("owner"),
                "extensions": exts}

    def rug_summary(self, mint: str) -> dict:
        d = self.http.get(f"{RUGCHECK}/{mint}/report/summary")
        risks = d.get("risks") or []
        return {
            "lp_locked_pct": d.get("lpLockedPct"),
            "danger": [r.get("name", "?") for r in risks if r.get("level") == "danger"],
            "warn": [r.get("name", "?") for r in risks if r.get("level") == "warn"],
            "score": d.get("score_normalised", d.get("score")),
        }

    # ---- execution simulation via real quotes --------------------------------------
    def quote_buy(self, mint: str, usd: float):
        q = self.http.get(JUPITER, ok_404=True, params={
            "inputMint": USDC, "outputMint": mint, "amount": int(usd * 1e6), "slippageBps": 200})
        return int(q["outAmount"]) if q and q.get("outAmount") else None

    def quote_sell(self, mint: str, raw: int):
        q = self.http.get(JUPITER, ok_404=True, params={
            "inputMint": mint, "outputMint": USDC, "amount": int(raw), "slippageBps": 200})
        return int(q["outAmount"]) / 1e6 if q and q.get("outAmount") else None


BAD_EXTENSIONS = {"transferFeeConfig", "transferHook", "permanentDelegate", "nonTransferable",
                  "defaultAccountState", "confidentialTransferMint"}


def screen(p: dict, now_ms: float, cfg: dict):
    """Cheap momentum screen on DexScreener data. Returns (passed, reason)."""
    age_min = (now_ms - p["created_ms"]) / 60000 if p["created_ms"] else 0
    if p["price"] <= 0:
        return False, "no price"
    if p["liquidity"] < cfg["min_liquidity_usd"]:
        return False, f"liquidity ${p['liquidity']:,.0f} too low"
    if age_min < cfg["min_age_min"]:
        return False, f"too new ({age_min:.0f} min)"
    if age_min > cfg["max_age_hours"] * 60:
        return False, "too old"
    if p["vol_m5"] < cfg["min_volume_m5_usd"]:
        return False, "5-min volume too low"
    ratio = p["buys_m5"] / max(1, p["sells_m5"])
    if ratio < cfg["min_buy_sell_ratio"]:
        return False, f"buy/sell ratio {ratio:.2f}"
    if p["chg_m5"] <= cfg["min_change_m5_pct"] or p["chg_h1"] <= cfg["min_change_h1_pct"]:
        return False, "no upward momentum"
    return True, (f"momentum: 5m {p['chg_m5']:+.1f}%, 1h {p['chg_h1']:+.1f}%, "
                  f"buys/sells {ratio:.1f}, liq ${p['liquidity']:,.0f}")


def safety_check(dex, mint: str, cfg: dict):
    """RUG CHECK agent. Returns (ok, reason, info). Anything it cannot verify is a rejection."""
    try:
        mi = dex.mint_info(mint)
    except Exception as e:  # noqa: BLE001
        return False, f"could not read mint account ({e})", {}
    if mi.get("mint_authority"):
        return False, "mint authority still enabled (dev can print more tokens)", mi
    if mi.get("freeze_authority"):
        return False, "freeze authority enabled (dev can freeze your tokens)", mi
    bad = BAD_EXTENSIONS.intersection(mi.get("extensions") or [])
    if bad:
        return False, f"risky Token-2022 extension: {', '.join(sorted(bad))}", mi
    try:
        rs = dex.rug_summary(mint)
    except Exception as e:  # noqa: BLE001
        return False, f"RugCheck unavailable ({e})", mi
    if rs["danger"]:
        return False, f"RugCheck danger: {', '.join(rs['danger'][:3])}", {**mi, **rs}
    lp = rs.get("lp_locked_pct")
    if lp is None or float(lp) < cfg["require_lp_locked_pct"]:
        lp_txt = "unknown" if lp is None else f"{float(lp):.0f}%"
        return False, f"LP lock {lp_txt} < {cfg['require_lp_locked_pct']:.0f}%", {**mi, **rs}
    return True, f"mint+freeze revoked, LP {float(lp):.0f}% locked", {**mi, **rs}
