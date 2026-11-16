// Winkler Quest home bridge.
// Runs on a Pi / Docker / always-on box inside the house. Every few seconds it
// asks the backend which device groups should be open, then makes the UniFi
// console match. Outbound connections only — no ports opened on the router.
//
//   node src/main.ts bridge.config.json

import { readFileSync } from "node:fs";
import type { AccessWindow } from "../../core/src/engine.ts";
import { reconcile, type Groups } from "./reconcile.ts";
import { LegacyUnifiClient, type UnifiController } from "./unifi.ts";

export interface BridgeConfig {
  unifi: { baseUrl: string; username: string; passwordEnv: string; site?: string };
  /** Backend endpoint that returns AccessWindow[] for this household. */
  backend: { url: string; tokenEnv: string };
  groups: Groups;
  pollSeconds?: number;
  /** How long a backend outage is tolerated before everything locks. */
  graceSeconds?: number;
}

export async function tick(
  unifi: UnifiController,
  groups: Groups,
  getWindows: () => Promise<AccessWindow[] | null>,
  log: (msg: string) => void = console.log,
): Promise<void> {
  const windows = await getWindows();
  const blocked = await unifi.blockedMacs();
  const usesRules = Object.values(groups).some((g) => !Array.isArray(g));
  const rules = usesRules ? await unifi.ruleStates() : new Map<string, boolean>();
  for (const a of reconcile(groups, windows, blocked, rules)) {
    if (a.kind === "device") {
      await (a.action === "block" ? unifi.block(a.mac) : unifi.unblock(a.mac));
      log(`${new Date().toISOString()} ${a.action} ${a.mac} (${a.reason})`);
    } else {
      await unifi.setRule(a.ruleId, a.enable);
      log(`${new Date().toISOString()} rule ${a.ruleId} ${a.enable ? "on" : "off"} (${a.reason})`);
    }
  }
}

function backendSource(cfg: BridgeConfig) {
  let lastGood: AccessWindow[] | null = null;
  let lastGoodAt = 0;
  const grace = (cfg.graceSeconds ?? 120) * 1000;
  return async (): Promise<AccessWindow[] | null> => {
    try {
      const res = await fetch(cfg.backend.url, {
        headers: { authorization: `Bearer ${process.env[cfg.backend.tokenEnv] ?? ""}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      lastGood = (await res.json()) as AccessWindow[];
      lastGoodAt = Date.now();
      return lastGood;
    } catch (err) {
      console.error(`backend unreachable: ${(err as Error).message}`);
      if (lastGood && Date.now() - lastGoodAt < grace) {
        // Keep honoring windows we already know about, but let them expire on time.
        const now = Date.now();
        return lastGood.map((w) => (w.until && Date.parse(w.until) > now ? w : { ...w, open: false }));
      }
      return null; // fail closed
    }
  };
}

async function main() {
  const path = process.argv[2] ?? "bridge.config.json";
  const cfg = JSON.parse(readFileSync(path, "utf8")) as BridgeConfig;
  const password = process.env[cfg.unifi.passwordEnv];
  if (!password) throw new Error(`Set ${cfg.unifi.passwordEnv} to the bridge account's password`);
  const unifi = new LegacyUnifiClient({ ...cfg.unifi, password });
  const source = backendSource(cfg);
  const every = (cfg.pollSeconds ?? 15) * 1000;
  console.log(`Winkler Quest bridge running; managing ${Object.keys(cfg.groups).join(", ")}`);
  for (;;) {
    try {
      await tick(unifi, cfg.groups, source);
    } catch (err) {
      console.error(`tick failed: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, every));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
