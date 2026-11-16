// Compare what SHOULD be open (from the Winkler Quest backend) with what the
// router is doing, and produce the minimal set of block/unblock actions.

import type { AccessWindow } from "../../core/src/engine.ts";

/**
 * group -> either device MACs (block the whole device), or a UniFi traffic rule
 * that blocks something specific (e.g. YouTube on the TV). Open = rule disabled.
 */
export type Groups = Record<string, string[] | { blockRule: string }>;

export type Action =
  | { kind: "device"; mac: string; action: "block" | "unblock"; reason: string }
  | { kind: "rule"; ruleId: string; enable: boolean; reason: string };

/**
 * @param windows current access windows, or null if the backend can't be
 *   reached — then every managed device is blocked (fail closed, so pulling
 *   the bridge's plug or killing Wi-Fi to it never means free gaming).
 */
export function reconcile(
  groups: Groups,
  windows: AccessWindow[] | null,
  blocked: Set<string>,
  rules: Map<string, boolean> = new Map(),
): Action[] {
  const openGroups = new Set((windows ?? []).filter((w) => w.open).map((w) => w.group));
  const actions: Action[] = [];
  const managed = new Map<string, string[]>(); // mac -> groups it belongs to
  for (const [group, target] of Object.entries(groups)) {
    if (!Array.isArray(target)) {
      const shouldBlock = windows === null || !openGroups.has(group);
      if (rules.get(target.blockRule) !== shouldBlock) {
        const reason = windows === null ? "backend unreachable (fail closed)" : shouldBlock ? "no time running" : `${group} time running`;
        actions.push({ kind: "rule", ruleId: target.blockRule, enable: shouldBlock, reason });
      }
      continue;
    }
    for (const raw of target) {
      const mac = raw.toLowerCase();
      managed.set(mac, [...(managed.get(mac) ?? []), group]);
    }
  }

  for (const [mac, gs] of managed) {
    const openVia = gs.find((g) => openGroups.has(g));
    const shouldBeOpen = windows !== null && openVia !== undefined;
    const isBlocked = blocked.has(mac);
    if (shouldBeOpen && isBlocked) actions.push({ kind: "device", mac, action: "unblock", reason: `${openVia} time running` });
    if (!shouldBeOpen && !isBlocked) {
      actions.push({ kind: "device", mac, action: "block", reason: windows === null ? "backend unreachable (fail closed)" : "no time running" });
    }
  }
  return actions;
}
