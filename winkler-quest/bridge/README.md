# Winkler Quest — home bridge

Keeps the TV / consoles blocked on the UniFi network except while a son has
redeemed time. Runs on any always-on box at home (Raspberry Pi, NAS, Docker).

## How it works
Every 15 s: ask the backend which device groups should be open → read which
devices UniFi currently blocks → block/unblock to match. If the backend can't be
reached for 2 minutes, it **fails closed** (everything blocked).

## Setup
1. In UniFi OS, create a **local-only admin** just for this (e.g. `wq-bridge`),
   with Network permission only. Don't use your Ubiquiti cloud account.
2. Copy `bridge.config.example.json` → `bridge.config.json` (git-ignored) and fill in:
   console IP, and the MAC addresses for each group (`tv`, `consoles`, ...).
   On each of those devices, turn **off private/random MAC** for your Wi-Fi.
3. Export the console's TLS certificate to `console.pem` and run with
   `NODE_EXTRA_CA_CERTS=console.pem` (don't disable TLS checking).
4. `WQ_UNIFI_PASSWORD=... WQ_BRIDGE_TOKEN=... npm start`

## Notes
- Uses the local Network API (`cmd/stamgr` block-sta / unblock-sta), which
  blocks the device on the network entirely. The newer official Integration
  API (X-API-Key) is checked per firmware; an adapter can be added behind the
  same `UnifiController` interface.
- Shared devices (living-room TV) unlock for whoever's in the room — group
  per-son devices separately if that matters.
