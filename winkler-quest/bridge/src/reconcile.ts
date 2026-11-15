// Compare what SHOULD be open (from the Winkler Quest backend) with what the
// router is doing, and produce the minimal set of block/unblock actions.

import type { AccessWindow } from "../../core/src/engine.ts";

export type Groups = Record<string, string[]>; // group -> device MACs

export interface Action {
  mac: string;
  action: "block" | "unblock";
  reason: string;
}

/**
 * @param windows current access windows, or null if the backend can't be
 *   reached — then every managed device is blocked (fail closed, so pulling
 *   the bridge's plug or killing Wi-Fi to it never means free gaming).
 */
export function reconcile(groups: Groups, windows: AccessWindow[] | null, blocked: Set<string>): Action[] {
  const openGroups = new Set((windows ?? []).filter((w) => w.open).map((w) => w.group));
  const managed = new Map<string, string[]>(); // mac -> groups it belongs to
  for (const [group, macs] of Object.entries(groups)) {
    for (const raw of macs) {
      const mac = raw.toLowerCase();
      managed.set(mac, [...(managed.get(mac) ?? []), group]);
    }
  }

  const actions: Action[] = [];
  for (const [mac, gs] of managed) {
    const openVia = gs.find((g) => openGroups.has(g));
    const shouldBeOpen = windows !== null && openVia !== undefined;
    const isBlocked = blocked.has(mac);
    if (shouldBeOpen && isBlocked) actions.push({ mac, action: "unblock", reason: `${openVia} time running` });
    if (!shouldBeOpen && !isBlocked) {
      actions.push({ mac, action: "block", reason: windows === null ? "backend unreachable (fail closed)" : "no time running" });
    }
  }
  return actions;
}
