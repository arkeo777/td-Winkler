import { test } from "node:test";
import assert from "node:assert/strict";
import { canRedeem, computeKid, periodKey } from "../src/engine.ts";
import { sampleConfig as cfg } from "../src/sample-config.ts";
import type { LedgerEvent } from "../src/types.ts";

// Times are in UTC; household is America/Chicago (UTC-6 in November).
// Mon 2026-11-16 18:00Z = noon local.
const MON = "2026-11-16T18:00:00.000Z";
const MON_LATER = "2026-11-16T22:00:00.000Z";
const TUE = "2026-11-17T18:00:00.000Z";
const NEXT_MON = "2026-11-23T18:00:00.000Z";

let n = 0;
const id = () => `e${++n}`;
const done = (kidId: string, activityId: string, at: string, extra: object = {}): LedgerEvent =>
  ({ id: id(), type: "completion", kidId, activityId, at, ...extra }) as LedgerEvent;
const approve = (target: LedgerEvent, at = target.at): LedgerEvent =>
  ({ id: id(), type: "approval", kidId: target.kidId, targetId: target.id, at, by: "dad" });
const timed = (kidId: string, activityId: string, at: string, minutes: number) =>
  done(kidId, activityId, at, {
    startedAt: new Date(Date.parse(at) - minutes * 60000).toISOString(),
    endedAt: at,
  });

test("week key starts Monday in household timezone", () => {
  assert.equal(periodKey(MON, cfg.timezone, "week"), "2026-11-16");
  assert.equal(periodKey("2026-11-22T20:00:00Z", cfg.timezone, "week"), "2026-11-16"); // Sunday
  // 02:00Z Monday is still Sunday evening in Chicago
  assert.equal(periodKey("2026-11-16T02:00:00Z", cfg.timezone, "week"), "2026-11-09");
});

test("easy/growth coins are HELD until must-dos are done, then released", () => {
  const ledger: LedgerEvent[] = [timed("younger", "reading", MON, 30), done("younger", "make-bed", MON)];
  let s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.available, 0);
  assert.equal(s.held, 35);
  assert.equal(s.shopLocked, true);

  const hw = done("younger", "homework", MON_LATER);
  ledger.push(hw, approve(hw), done("younger", "dishes", MON_LATER));
  s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.held, 0);
  assert.equal(s.available, 35 + 30 + 25);
  assert.equal(s.shopLocked, false);
});

test("skipping must-dos forfeits held coins when the day ends", () => {
  const ledger = [timed("younger", "reading", MON, 30)];
  const s = computeKid(cfg, ledger, "younger", TUE);
  assert.equal(s.available, 0);
  assert.equal(s.forfeited, 30);
  assert.equal(s.history[0].status, "forfeited");
});

test("must-dos pay even if other must-dos are missing (the chore never locks itself)", () => {
  const ledger = [done("younger", "dishes", MON)];
  const s = computeKid(cfg, ledger, "younger", TUE);
  assert.equal(s.available, 25);
});

test("weekly mowing gate locks the shop all week until mowing is approved", () => {
  const hw = done("older", "homework", MON);
  const ledger: LedgerEvent[] = [hw, approve(hw), done("older", "dishes", MON), timed("older", "lifting", MON, 45)];
  let s = computeKid(cfg, ledger, "older", MON_LATER);
  assert.equal(s.available, 30 + 25 + 45);
  assert.equal(s.shopLocked, true);
  assert.match(s.lockReasons.join(), /Mow the lawn/);
  assert.equal(canRedeem(cfg, ledger, "older", "gaming-1h", MON_LATER).ok, false);

  const mow = done("older", "mow", MON_LATER, { proofUrl: "photo.jpg" });
  ledger.push(mow);
  s = computeKid(cfg, ledger, "older", MON_LATER);
  assert.equal(s.pending, 120);
  assert.equal(s.shopLocked, true, "pending mowing doesn't unlock — dad has to approve");

  ledger.push(approve(mow));
  s = computeKid(cfg, ledger, "older", MON_LATER);
  assert.equal(s.shopLocked, false);
  assert.equal(s.available, 100 + 120);
  assert.equal(canRedeem(cfg, ledger, "older", "gaming-1h", MON_LATER).ok, true);
});

test("outside compliment pays big and is never gate-held", () => {
  const ledger: LedgerEvent[] = [
    { id: id(), type: "compliment", kidId: "younger", at: MON, from: "Coach Ramirez", relationship: "coach", note: "Helped a teammate up", loggedBy: "parent" },
  ];
  const s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.available, 150);
  assert.equal(s.held, 0);
});

test("kid-submitted compliment waits for parent verification", () => {
  const c: LedgerEvent = { id: id(), type: "compliment", kidId: "younger", at: MON, from: "Mrs. Lee", relationship: "neighbor", note: "Said I was polite", loggedBy: "kid" };
  let s = computeKid(cfg, [c], "younger", MON_LATER);
  assert.equal(s.pending, 150);
  assert.equal(s.available, 0);
  s = computeKid(cfg, [c, approve(c)], "younger", MON_LATER);
  assert.equal(s.available, 150);
});

test("penalties subtract, never below zero, and don't reduce XP", () => {
  const ledger: LedgerEvent[] = [
    { id: id(), type: "bonus", kidId: "younger", at: MON, points: 50, reason: "Helped grandma", by: "dad" },
    { id: id(), type: "penalty", kidId: "younger", at: MON_LATER, points: 80, reason: "Talked back", by: "dad" },
  ];
  const s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.available, 0);
  assert.equal(s.xp, 50);
});

test("timed sessions: minimum enforced, max capped; daily caps enforced", () => {
  const hw = done("younger", "homework", MON);
  const ledger: LedgerEvent[] = [
    hw, approve(hw), done("younger", "dishes", MON),
    timed("younger", "reading", MON, 5), // too short
    timed("younger", "reading", MON_LATER, 120), // capped at 60
    done("younger", "make-bed", MON),
    done("younger", "make-bed", MON_LATER), // over daily cap
  ];
  const s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.available, 30 + 25 + 60 + 5);
  assert.ok(s.history.some((h) => h.status === "too-short"));
  assert.ok(s.history.some((h) => h.status === "capped"));
});

test("car time is only for the older son; redemption spends coins", () => {
  assert.equal(canRedeem(cfg, [], "younger", "car-1h", MON).ok, false);
  const hw = done("younger", "homework", MON);
  const ledger: LedgerEvent[] = [
    hw, approve(hw), done("younger", "dishes", MON), done("younger", "make-bed", MON),
  ];
  assert.equal(canRedeem(cfg, ledger, "younger", "tv-1h", MON_LATER).ok, true); // 60 coins
  ledger.push({ id: id(), type: "redemption", kidId: "younger", at: MON_LATER, rewardId: "tv-1h" });
  const s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.available, 0);
  assert.equal(s.xp, 60);
});

test("new week resets the weekly gate", () => {
  const mow = done("older", "mow", MON);
  const s = computeKid(cfg, [mow, approve(mow)], "older", NEXT_MON);
  const weekly = s.gates.find((g) => g.gateId === "older-weekly")!;
  assert.equal(weekly.met, false);
  assert.equal(s.available, 120);
});
