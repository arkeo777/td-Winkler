import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHouseholdConfig, CHORE_LIBRARY } from "../src/templates.ts";
import { computeKid } from "../src/engine.ts";
import type { LedgerEvent } from "../src/types.ts";

const MON = "2026-11-16T18:00:00.000Z";

const answers = {
  timezone: "America/New_York",
  parents: [{ id: "p1", name: "Parent" }],
  kids: [
    { id: "k1", name: "Ava", age: 12, style: "doer" as const },
    { id: "k2", name: "Ben", age: 9, style: "needs-push" as const },
  ],
  chores: [
    { templateId: "make-bed", kidIds: ["k1", "k2"] },
    { templateId: "dishwasher", kidIds: ["k1", "k2"], takeTurns: true },
    { templateId: "bathroom", kidIds: ["k1"] },
    { templateId: "reading", kidIds: ["k1", "k2"] },
    { custom: { name: "Feed the fish", difficulty: 1 as const, typicalMinutes: 2 }, kidIds: ["k2"] },
  ],
  rewards: [{ templateId: "tv-1h" }, { templateId: "pizza", cost: 1000 }, { id: "zoo", name: "Zoo trip", cost: 2000, kind: "physical" as const }],
};

test("a new family's choices become a working household", () => {
  const cfg = buildHouseholdConfig(answers);
  assert.equal(cfg.kids.length, 2);
  assert.equal(cfg.activities.length, 5);
  assert.equal(cfg.rewards.find((r) => r.id === "pizza")!.cost, 1000);
  assert.ok(cfg.activities.some((a) => a.id === "custom-feed-the-fish"));
  // every gate reference resolves, and the engine runs
  const ids = new Set(cfg.activities.map((a) => a.id));
  for (const g of cfg.gates) for (const id of g.requiredActivityIds) assert.ok(ids.has(id));
  for (const k of cfg.kids) computeKid(cfg, [], k.id, MON);
});

test("values come from hardness x time; parents can override", () => {
  const cfg = buildHouseholdConfig(answers);
  assert.equal(cfg.activities.find((a) => a.id === "bathroom")!.points, 60); // 40 min x 1.5
  const custom = buildHouseholdConfig({ ...answers, chores: [{ templateId: "bathroom", kidIds: ["k1"], points: 75 }] });
  assert.equal(custom.activities[0].points, 75);
});

test("'needs a push' kids get stricter gates and higher must-do pay", () => {
  const cfg = buildHouseholdConfig(answers);
  const ben = cfg.kids.find((k) => k.id === "k2")!;
  assert.equal(ben.economy.activityTuning!["make-bed"].points, 5); // 5 x 1.4 rounded to 5
  const benDaily = cfg.gates.find((g) => g.id === "k2-daily")!;
  assert.deepEqual(benDaily.holdsTiers, ["growth", "easy", "bonus"]);
  assert.equal(cfg.gates.find((g) => g.id === "k1-daily")!.onMiss, "release");
  // reading is held for Ben until his must-dos are done
  const ledger: LedgerEvent[] = [{
    id: "e1", type: "completion", kidId: "k2", activityId: "reading", at: MON,
    startedAt: "2026-11-16T17:30:00.000Z", endedAt: MON,
  }];
  assert.ok(computeKid(cfg, ledger, "k2", MON).held > 0);
});

test("library chores all have sane values", () => {
  for (const t of CHORE_LIBRARY) {
    assert.ok(t.typicalMinutes > 0 && t.difficulty >= 1 && t.difficulty <= 5, t.id);
  }
});
