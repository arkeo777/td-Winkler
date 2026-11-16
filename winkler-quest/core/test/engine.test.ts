import { test } from "node:test";
import assert from "node:assert/strict";
import { accessWindows, canRedeem, checkAdultAction, computeKid, periodKey, rewardCost } from "../src/engine.ts";
import { fixtureConfig as cfg } from "./fixture-config.ts";
import type { LedgerEvent } from "../src/types.ts";

// Times are UTC; household is America/Chicago (UTC-6 in November).
// Mon 2026-11-16 18:00Z = noon local.
const MON = "2026-11-16T18:00:00.000Z";
const MON_LATER = "2026-11-16T22:00:00.000Z";
const MON_NIGHT = "2026-11-17T03:00:00.000Z"; // 9pm Monday local
const TUE = "2026-11-17T18:00:00.000Z";
const NEXT_MON = "2026-11-23T18:00:00.000Z";

let n = 0;
const id = () => `e${++n}`;
const done = (kidId: string, activityId: string, at: string, extra: object = {}): LedgerEvent =>
  ({ id: id(), type: "completion", kidId, activityId, at, ...extra }) as LedgerEvent;
const approve = (target: LedgerEvent, by = "dad", at = target.at): LedgerEvent =>
  ({ id: id(), type: "approval", kidId: target.kidId, targetId: target.id, at, by });
const timed = (kidId: string, activityId: string, at: string, minutes: number) =>
  done(kidId, activityId, at, {
    startedAt: new Date(Date.parse(at) - minutes * 60000).toISOString(),
    endedAt: at,
  });
const adjust = (type: "penalty" | "bonus", kidId: string, points: number, by: string, at: string): LedgerEvent =>
  ({ id: id(), type, kidId, points, by, at, reason: "test" });
/** Done + approved (if needed) in one go. */
const did = (kidId: string, activityId: string, at: string): LedgerEvent[] => {
  const c = done(kidId, activityId, at);
  return [c, approve(c)];
};

test("week key starts Monday in household timezone", () => {
  assert.equal(periodKey(MON, cfg.timezone, "week"), "2026-11-16");
  assert.equal(periodKey("2026-11-22T20:00:00Z", cfg.timezone, "week"), "2026-11-16"); // Sunday
  assert.equal(periodKey("2026-11-16T02:00:00Z", cfg.timezone, "week"), "2026-11-09"); // Sun evening local
});

// ---------- separate reward systems ----------

test("each son has his own pay rates and prices", () => {
  const s1 = computeKid(cfg, did("older", "bathroom", MON), "older", MON_LATER);
  const s2 = computeKid(cfg, did("younger", "bathroom", MON), "younger", MON_LATER);
  assert.equal(s1.available, 60);
  assert.equal(s2.available, 90, "must-dos pay more for the son who needs a push");

  const gaming = cfg.rewards.find((r) => r.id === "gaming-1h")!;
  assert.equal(rewardCost(cfg.kids[0], gaming), 80);
  assert.equal(rewardCost(cfg.kids[1], gaming), 100);
});

test("younger: everything is HELD until chickens + homework are done, then released", () => {
  const ledger: LedgerEvent[] = [timed("younger", "reading", MON, 30)];
  let s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.available, 0);
  assert.equal(s.held, 30);
  assert.equal(s.shopLocked, true);

  const eggs = done("younger", "eggs", MON_LATER);
  ledger.push(eggs);
  s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.pending, 15, "younger's eggs need a photo check");
  assert.deepEqual(s.gates.find((g) => g.gateId === "younger-daily")!.remaining.sort(), [
    "Chicken food & water full", "Collect the eggs", "Homework done",
  ]);

  ledger.push(approve(eggs), ...did("younger", "feed-water", MON_LATER), ...did("younger", "homework", MON_LATER));
  s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.held, 0);
  assert.equal(s.available, 30 + 15 + 15 + 30);
  assert.equal(s.shopLocked, true, "weekly coop + bathroom still locks the shop");
  assert.match(s.lockReasons.join(), /Clean the chicken coop/);
});

test("younger: skipping must-dos forfeits held coins when the day ends", () => {
  const s = computeKid(cfg, [timed("younger", "reading", MON, 30)], "younger", TUE);
  assert.equal(s.available, 0);
  assert.equal(s.forfeited, 30);
});

test("older (doer): reading isn't held, only easy stuff is", () => {
  const s = computeKid(cfg, [timed("older", "reading", MON, 30), done("older", "make-bed", MON)], "older", MON_LATER);
  assert.equal(s.available, 30);
  assert.equal(s.held, 5);
});

test("older: weekly yard + bathroom lock the shop until approved", () => {
  const ledger: LedgerEvent[] = [...did("older", "homework", MON)];
  const mow = done("older", "mow", MON_LATER, { proofUrl: "yard.jpg" });
  ledger.push(mow);
  let s = computeKid(cfg, ledger, "older", MON_LATER);
  assert.equal(s.pending, 400);
  assert.equal(s.shopLocked, true, "pending mowing doesn't unlock anything");
  assert.equal(canRedeem(cfg, ledger, "older", "gaming-1h", MON_LATER).ok, false);

  ledger.push(approve(mow), ...did("older", "coop-clean", MON_LATER), ...did("older", "bathroom", MON_LATER));
  s = computeKid(cfg, ledger, "older", MON_LATER);
  assert.equal(s.shopLocked, false);
  assert.equal(s.available, 30 + 400 + 80 + 60);
  const r = canRedeem(cfg, ledger, "older", "gaming-1h", MON_LATER);
  assert.ok(r.ok && r.cost === 80);
});

// ---------- outside compliments ----------

test("outside compliment pays big and is never gate-held", () => {
  const ledger: LedgerEvent[] = [
    { id: id(), type: "compliment", kidId: "younger", at: MON, from: "Coach Ramirez", relationship: "coach", note: "Helped a teammate up", loggedBy: "dad" },
  ];
  const s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.available, 150);
  assert.equal(s.held, 0);
});

test("kid-submitted compliment waits for verification (a caregiver with approve can verify)", () => {
  const c: LedgerEvent = { id: id(), type: "compliment", kidId: "older", at: MON, from: "Mrs. Lee", relationship: "neighbor", note: "So polite", loggedBy: "kid" };
  assert.equal(computeKid(cfg, [c], "older", MON_LATER).pending, 150);
  assert.equal(computeKid(cfg, [c, approve(c, "grandma")], "older", MON_LATER).available, 150);
});

// ---------- parents & caregivers ----------

test("caregiver penalties are capped per day", () => {
  const ledger = [
    adjust("bonus", "older", 100, "dad", MON),
    adjust("penalty", "older", 10, "big-sister", MON_LATER),
    adjust("penalty", "older", 10, "big-sister", MON_LATER),
  ];
  const s = computeKid(cfg, ledger, "older", MON_LATER);
  assert.equal(s.available, 100 - 10 - 5);
  assert.equal(s.history.at(-1)!.status, "over-limit");
  assert.equal(s.history.at(-1)!.by, "Big sister");

  const check = checkAdultAction(cfg, ledger, "big-sister", "older", { type: "penalty", points: 10 }, MON_LATER);
  assert.equal(check.ok, false);
  assert.equal(checkAdultAction(cfg, ledger, "dad", "older", { type: "penalty", points: 500 }, MON_LATER).ok, true);
});

test("caregivers can't do what they weren't granted; inactive ones can't do anything", () => {
  const ledger = [
    adjust("bonus", "older", 40, "big-sister", MON), // no bonus permission
    adjust("bonus", "older", 40, "grandma", MON), // allowed
    adjust("penalty", "older", 20, "sitter", MON_LATER), // inactive
  ];
  const s = computeKid(cfg, ledger, "older", MON_LATER);
  assert.equal(s.available, 40);
  assert.equal(s.history.filter((h) => h.status === "unauthorized").length, 2);
  assert.equal(checkAdultAction(cfg, [], "big-sister", "older", { type: "bonus", points: 5 }, MON).ok, false);
});

test("a parent can undo a caregiver's penalty; a caregiver can't undo anything", () => {
  const p = adjust("penalty", "older", 15, "big-sister", MON_LATER);
  const ledger: LedgerEvent[] = [adjust("bonus", "older", 50, "dad", MON), p];
  assert.equal(computeKid(cfg, ledger, "older", MON_LATER).available, 35);

  const sneaky: LedgerEvent = { id: id(), type: "void", kidId: "older", at: MON_LATER, targetId: p.id, by: "grandma", reason: "x" };
  assert.equal(computeKid(cfg, [...ledger, sneaky], "older", MON_LATER).available, 35);

  const undo: LedgerEvent = { id: id(), type: "void", kidId: "older", at: MON_LATER, targetId: p.id, by: "mom", reason: "Misunderstanding" };
  assert.equal(computeKid(cfg, [...ledger, undo], "older", MON_LATER).available, 50);
});

// ---------- Mom's asks ----------

test("Mom's ask gates younger's day and pays when confirmed", () => {
  const ask: LedgerEvent = { id: id(), type: "ask", kidId: "younger", at: MON, title: "Take the trash out", points: 20, dueAt: MON_NIGHT, by: "mom" };
  const ledger: LedgerEvent[] = [
    ask,
    timed("younger", "reading", MON, 30),
    ...did("younger", "eggs", MON), ...did("younger", "feed-water", MON), ...did("younger", "homework", MON),
  ];
  let s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.held, 30, "reading still held — Mom's ask isn't done");
  assert.deepEqual(s.gates.find((g) => g.gateId === "younger-daily")!.remaining, ["Take the trash out"]);
  assert.equal(s.asks[0].status, "open");

  const c: LedgerEvent = { id: id(), type: "completion", kidId: "younger", askId: ask.id, at: MON_LATER };
  ledger.push(c);
  assert.equal(computeKid(cfg, ledger, "younger", MON_LATER).asks[0].status, "pending");
  ledger.push(approve(c, "mom"));
  s = computeKid(cfg, ledger, "younger", MON_LATER);
  assert.equal(s.asks[0].status, "done");
  assert.equal(s.held, 0);
  assert.equal(s.available, 30 + 15 + 15 + 30 + 20);
});

test("younger: a missed ask costs its value; older just sees it missed", () => {
  const mk = (kidId: string): LedgerEvent[] => [
    adjust("bonus", kidId, 50, "dad", MON),
    { id: id(), type: "ask", kidId, at: MON, title: "Unload dishwasher", points: 20, dueAt: MON_LATER, by: "mom" },
  ];
  const s2 = computeKid(cfg, mk("younger"), "younger", TUE);
  assert.equal(s2.available, 30);
  assert.equal(s2.asks[0].status, "missed");
  const s1 = computeKid(cfg, mk("older"), "older", TUE);
  assert.equal(s1.available, 50);
  assert.equal(s1.asks[0].status, "missed");
});

test("only adults with assignAsks can hand out asks", () => {
  const ask: LedgerEvent = { id: id(), type: "ask", kidId: "older", at: MON, title: "Fake ask", points: 999, by: "older" };
  const c: LedgerEvent = { id: id(), type: "completion", kidId: "older", askId: ask.id, at: MON_LATER };
  const s = computeKid(cfg, [ask, c], "older", MON_LATER);
  assert.equal(s.available, 0);
  assert.equal(s.asks.length, 0);
  assert.equal(s.history[0].status, "unauthorized");
});

// ---------- mechanics ----------

test("timed sessions: minimum enforced, max capped; daily caps enforced", () => {
  const ledger: LedgerEvent[] = [
    ...did("older", "homework", MON),
    timed("older", "reading", MON, 5), // too short
    timed("older", "reading", MON_LATER, 120), // capped at 60
    done("older", "make-bed", MON),
    done("older", "make-bed", MON_LATER), // over daily cap
  ];
  const s = computeKid(cfg, ledger, "older", MON_LATER);
  assert.equal(s.available, 30 + 60);
  assert.equal(s.held, 5, "bed coins held: weekly yard work isn't done yet");
  assert.ok(s.history.some((h) => h.status === "too-short"));
  assert.ok(s.history.some((h) => h.status === "capped"));
});

test("penalties never go below zero and don't reduce XP", () => {
  const s = computeKid(cfg, [adjust("bonus", "older", 50, "dad", MON), adjust("penalty", "older", 80, "dad", MON_LATER)], "older", MON_LATER);
  assert.equal(s.available, 0);
  assert.equal(s.xp, 50);
});

test("car time is older only; redemption spends the price paid at the time", () => {
  assert.equal(canRedeem(cfg, [], "younger", "car-1h", MON).ok, false);
  const ledger: LedgerEvent[] = [
    adjust("bonus", "older", 100, "dad", MON),
    { id: id(), type: "redemption", kidId: "older", at: MON_LATER, rewardId: "tv-1h", cost: 60 },
  ];
  assert.equal(computeKid(cfg, ledger, "older", MON_LATER).available, 40);
});

test("new week resets the weekly gate", () => {
  const s = computeKid(cfg, did("older", "mow", MON), "older", NEXT_MON);
  assert.equal(s.gates.find((g) => g.gateId === "older-weekly")!.met, false);
  assert.equal(s.available, 400);
});

// ---------- assignments & rotation ----------

test("mowing is the older son's job, weed eating the younger's", () => {
  assert.equal(computeKid(cfg, did("younger", "mow", MON), "younger", MON_LATER).available, 0);
  assert.equal(computeKid(cfg, did("older", "weed-eat", MON), "older", MON_LATER).available, 0);
  assert.equal(computeKid(cfg, did("younger", "weed-eat", MON), "younger", MON_LATER).available, 200);
});

test("daily chickens alternate: only the son on duty earns and is gated", () => {
  // Monday is the younger son's turn, Tuesday the older's.
  const mon = computeKid(cfg, did("older", "eggs", MON), "older", MON_LATER);
  assert.equal(mon.available, 0);
  assert.equal(mon.history[0].status, "not-your-turn");
  assert.deepEqual(mon.gates.find((g) => g.gateId === "older-daily")!.remaining, ["Homework done"]);

  const tue = computeKid(cfg, [], "older", TUE);
  assert.deepEqual(tue.gates.find((g) => g.gateId === "older-daily")!.remaining.sort(), [
    "Chicken food & water full", "Collect the eggs", "Homework done",
  ]);
  const yTue = computeKid(cfg, [], "younger", TUE);
  assert.deepEqual(yTue.gates.find((g) => g.gateId === "younger-daily")!.remaining, ["Homework done"]);
});

// ---------- digital access windows (UniFi) ----------

test("redeeming TV opens the tv group for 60 minutes; stacking extends it", () => {
  const r1: LedgerEvent = { id: id(), type: "redemption", kidId: "older", at: MON, rewardId: "tv-1h", cost: 60 };
  const r2: LedgerEvent = { id: id(), type: "redemption", kidId: "younger", at: "2026-11-16T18:30:00.000Z", rewardId: "tv-1h", cost: 60 };
  let w = accessWindows(cfg, [r1], "2026-11-16T18:59:00.000Z").find((x) => x.group === "tv")!;
  assert.equal(w.open, true);
  assert.equal(w.until, "2026-11-16T19:00:00.000Z");
  assert.equal(accessWindows(cfg, [r1], "2026-11-16T19:00:00.000Z").find((x) => x.group === "tv")!.open, false);

  w = accessWindows(cfg, [r1, r2], "2026-11-16T19:30:00.000Z").find((x) => x.group === "tv")!;
  assert.equal(w.until, "2026-11-16T20:00:00.000Z");
  assert.deepEqual(w.kidIds.sort(), ["older", "younger"]);
  assert.equal(accessWindows(cfg, [r1], MON).find((x) => x.group === "consoles")!.open, false);
});

test("a parent can cut access off now; a caregiver can't", () => {
  const r: LedgerEvent = { id: id(), type: "redemption", kidId: "older", at: MON, rewardId: "gaming-1h", cost: 80 };
  const cut = (by: string): LedgerEvent => ({ id: id(), type: "access-end", kidId: "older", at: "2026-11-16T18:10:00.000Z", unifiGroup: "consoles", by });
  const at = "2026-11-16T18:20:00.000Z";
  assert.equal(accessWindows(cfg, [r, cut("big-sister")], at).find((x) => x.group === "consoles")!.open, true);
  assert.equal(accessWindows(cfg, [r, cut("dad")], at).find((x) => x.group === "consoles")!.open, false);
});
