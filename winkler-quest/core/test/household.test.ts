// Tests for the real household setup (src/sample-config.ts) and the newer features.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accessWindows, canRedeem, computeKid, snapshotFor, suggestedPoints } from "../src/engine.ts";
import { sampleConfig as cfg } from "../src/sample-config.ts";
import type { LedgerEvent } from "../src/types.ts";

// Mon 2026-11-16 (younger's chicken day = day A index 1), noon Central.
const MON = "2026-11-16T18:00:00.000Z";
const MON_NIGHT = "2026-11-17T02:30:00.000Z"; // 8:30 pm Monday local
const TUE = "2026-11-17T18:00:00.000Z";
const JUNE_MON = "2027-06-07T17:00:00.000Z";

let n = 0;
const id = () => `h${++n}`;
const done = (kidId: string, activityId: string, at: string): LedgerEvent =>
  ({ id: id(), type: "completion", kidId, activityId, at, proofUrl: "p.jpg" });

test("config is consistent: every gate/tuning/reward reference exists", () => {
  const ids = new Set(cfg.activities.map((a) => a.id));
  for (const g of cfg.gates) for (const a of g.requiredActivityIds) assert.ok(ids.has(a), `${g.id} -> ${a}`);
  for (const k of cfg.kids) {
    for (const a of Object.keys(k.economy.activityTuning ?? {})) assert.ok(ids.has(a), `${k.id} tuning -> ${a}`);
    for (const r of Object.keys(k.economy.rewardCosts ?? {})) assert.ok(cfg.rewards.some((x) => x.id === r), `${k.id} cost -> ${r}`);
  }
  for (const k of cfg.kids) computeKid(cfg, [], k.id, MON); // doesn't throw
});

test("in winter, mowing and weed eating aren't required", () => {
  const s = computeKid(cfg, [], "older", MON);
  const weekly = s.gates.find((g) => g.gateId === "older-weekly")!;
  assert.ok(!weekly.remaining.some((r) => r.startsWith("Mow")));
  const summer = computeKid(cfg, [], "older", JUNE_MON).gates.find((g) => g.gateId === "older-weekly")!;
  assert.ok(summer.remaining.some((r) => r.startsWith("Mow")));
});

test("trash night is Monday only, for both boys", () => {
  for (const kid of ["older", "younger"]) {
    const mon = computeKid(cfg, [], kid, MON).gates.find((g) => g.period === "day")!;
    assert.ok(mon.remaining.some((r) => r.startsWith("Trash")), `${kid} Monday`);
    const tue = computeKid(cfg, [], kid, TUE).gates.find((g) => g.period === "day")!;
    assert.ok(!tue.remaining.some((r) => r.startsWith("Trash")), `${kid} Tuesday`);
  }
  assert.equal(computeKid(cfg, [done("older", "trash", MON_NIGHT)], "older", MON_NIGHT).available, 20);
  assert.equal(computeKid(cfg, [done("older", "trash", TUE)], "older", TUE).history[0].status, "not-your-turn");
});

test("chickens and kitchen are opposite each day", () => {
  const today = (kid: string) => computeKid(cfg, [], kid, MON).gates.find((g) => g.period === "day")!.remaining;
  // Monday: younger has chickens, older has the kitchen.
  assert.ok(today("younger").includes("Collect eggs"));
  assert.ok(!today("younger").includes("Kitchen clean after dinner"));
  assert.ok(today("older").includes("Kitchen clean after dinner"));
  assert.ok(!today("older").includes("Collect eggs"));
});

test("helpers can add or take away coins within their daily limit, nothing else", () => {
  const ledger: LedgerEvent[] = [
    { id: id(), type: "bonus", kidId: "younger", at: MON, points: 40, reason: "Very helpful", by: "sister-1" },
    { id: id(), type: "penalty", kidId: "younger", at: MON, points: 15, reason: "Talked back", by: "brother" },
    { id: id(), type: "ask", kidId: "younger", at: MON, title: "Fold towels", points: 20, by: "sister-in-law" }, // not allowed
  ];
  const s = computeKid(cfg, ledger, "younger", MON);
  assert.equal(s.available, 25);
  assert.equal(s.asks.length, 0);
});

test("gaming: he picks Xbox, Switch or desktop; only that device unlocks", () => {
  const ok = canRedeem(cfg, [], "older", "xbox-switch-desktop-1h", MON, "tv-youtube");
  assert.equal(ok.ok, false);
  const r: LedgerEvent = { id: id(), type: "redemption", kidId: "older", at: MON, rewardId: "xbox-switch-desktop-1h", unifiGroup: "desktop", cost: 80 };
  const w = accessWindows(cfg, [r], "2026-11-16T18:30:00.000Z");
  assert.equal(w.find((x) => x.group === "desktop")!.open, true);
  assert.equal(w.find((x) => x.group === "xbox")!.open, false);
});

test("family movie night opens the TV for everyone without coins; caregivers can't", () => {
  const grant = (by: string): LedgerEvent =>
    ({ id: id(), type: "access-grant", kidId: "family", at: MON, unifiGroups: ["tv-youtube"], minutes: 120, by });
  const at = "2026-11-16T19:30:00.000Z";
  const w = accessWindows(cfg, [grant("mom")], at).find((x) => x.group === "tv-youtube")!;
  assert.equal(w.open, true);
  assert.deepEqual(w.kidIds, ["family"]);
  assert.equal(accessWindows(cfg, [grant("brother")], at).find((x) => x.group === "tv-youtube")!.open, false);
});

test("cash-out is capped per week", () => {
  const ledger: LedgerEvent[] = [
    { id: id(), type: "bonus", kidId: "older", at: MON, points: 1000, reason: "test", by: "dad" },
    { id: id(), type: "redemption", kidId: "older", at: MON, rewardId: "cash-10", cost: 100 },
    { id: id(), type: "redemption", kidId: "older", at: MON, rewardId: "cash-5", cost: 50 },
  ];
  // Shop must be open for this check: give him a perfect Monday + week.
  const s = computeKid(cfg, ledger, "older", MON);
  assert.equal(s.available, 850);
  const r = canRedeem({ ...cfg, gates: [] }, ledger, "older", "cash-10", MON);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /\$5 left/);
  assert.equal(canRedeem({ ...cfg, gates: [] }, ledger, "older", "cash-5", MON).ok, true);
});

// ---------- settings page: adjusting values ----------

test("raising a chore's value only affects work done after the change", () => {
  const before: LedgerEvent = { id: id(), type: "completion", kidId: "older", activityId: "bathroom", at: MON, snapshot: snapshotFor(cfg, "older", "bathroom") };
  const raised = { ...cfg, activities: cfg.activities.map((a) => (a.id === "bathroom" ? { ...a, points: 100 } : a)) };
  const after: LedgerEvent = { id: id(), type: "completion", kidId: "older", activityId: "laundry", at: MON, snapshot: snapshotFor(raised, "older", "laundry") };
  const after2: LedgerEvent = { id: id(), type: "completion", kidId: "older", activityId: "bathroom", at: TUE, snapshot: snapshotFor(raised, "older", "bathroom") };
  const s = computeKid(raised, [before, after, after2], "older", TUE);
  assert.deepEqual(s.history.map((h) => h.delta), [60, 40, 100]);
});

test("suggested value comes from difficulty x time", () => {
  const scaled = { ...cfg, payScale: { coinsPerMinute: 1, difficultyMultipliers: [0.5, 1, 1.25, 1.5, 2] as [number, number, number, number, number] } };
  assert.equal(suggestedPoints(scaled, { ...cfg.activities[0], typicalMinutes: 300, difficulty: 4 }), 450); // mowing-like
  assert.equal(suggestedPoints(scaled, { ...cfg.activities[0], typicalMinutes: 5, difficulty: 1 }), 5);
  assert.equal(suggestedPoints(cfg, { ...cfg.activities[0], typicalMinutes: 5, difficulty: 1 }), cfg.payScale ? 5 : undefined);
});

test("per-son pay multiplier scales chore pay but not compliments", () => {
  const boosted = { ...cfg, kids: cfg.kids.map((k) => (k.id === "older" ? { ...k, economy: { ...k.economy, payMultiplier: 1.5 } } : k)) };
  const ledger: LedgerEvent[] = [
    done("older", "laundry", MON),
    { id: id(), type: "compliment", kidId: "older", at: MON, from: "Teacher", relationship: "teacher", note: "x", loggedBy: "dad" },
  ];
  assert.deepEqual(computeKid(boosted, ledger, "older", MON).history.map((h) => h.delta), [60, 200]);
});
