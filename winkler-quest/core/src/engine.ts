// Winkler Quest — rules engine.
// Pure functions: (config, ledger, now) -> what each kid has.
// Runs on the server; the apps only render the result.

import type {
  Activity,
  Actor,
  AskEvent,
  CompletionEvent,
  Config,
  Gate,
  Kid,
  LedgerEvent,
  Period,
  Permission,
  Reward,
} from "./types.ts";

export type EntryStatus =
  | "available" // spendable
  | "held" // earned, but locked behind an unmet must-do gate
  | "pending" // waiting on adult approval
  | "forfeited" // gate was missed for that period
  | "rejected" // an adult rejected it
  | "capped" // over the daily limit for that activity / ask already paid
  | "too-short" // timed session under the minimum
  | "over-limit" // caregiver hit their daily penalty/bonus limit (partially applied)
  | "unauthorized" // someone without permission tried it — ignored, shown to parents
  | "missed"; // an ask passed its due time undone

export interface HistoryEntry {
  eventId: string;
  at: string;
  label: string;
  delta: number;
  status: EntryStatus;
  /** For held/forfeited entries: which gate did it. */
  gate?: string;
  /** Who did it (adult's name), for penalties, bonuses, asks, compliments. */
  by?: string;
}

export interface GateStatus {
  gateId: string;
  name: string;
  period: Period;
  periodKey: string;
  met: boolean;
  remaining: string[]; // what's still to do
}

export interface AskStatus {
  askId: string;
  title: string;
  points: number;
  by: string;
  at: string;
  dueAt?: string;
  status: "open" | "pending" | "done" | "missed";
}

export interface KidState {
  kidId: string;
  available: number;
  held: number;
  pending: number;
  forfeited: number;
  /** Lifetime coins earned (spending/penalties don't reduce it). Drives the map. */
  xp: number;
  level: number;
  nextLevelAt: number | null;
  gates: GateStatus[];
  asks: AskStatus[];
  shopLocked: boolean;
  lockReasons: string[];
  history: HistoryEntry[];
}

// ---------- time helpers (household timezone) ----------

export function localDate(iso: string, tz: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Day -> "YYYY-MM-DD"; week -> the Monday that starts it. */
export function periodKey(iso: string, tz: string, period: Period): string {
  const day = localDate(iso, tz);
  if (period === "day") return day;
  const d = new Date(day + "T00:00:00Z");
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

export function timedMinutes(ev: CompletionEvent): number {
  if (!ev.startedAt || !ev.endedAt) return 0;
  const ms = Date.parse(ev.endedAt) - Date.parse(ev.startedAt);
  return Math.max(0, Math.floor(ms / 60000));
}

// ---------- per-kid economy + permissions ----------

function getKid(config: Config, kidId: string): Kid {
  const kid = config.kids.find((k) => k.id === kidId);
  if (!kid) throw new Error(`Unknown kid: ${kidId}`);
  return kid;
}

/** The activity as this kid experiences it (his own pay rates and strictness). */
export function activityFor(kid: Kid, a: Activity): Activity {
  return { ...a, ...(kid.economy.activityTuning?.[a.id] ?? {}) };
}

/** This kid's price for a reward. */
export function rewardCost(kid: Kid, r: Reward): number {
  return kid.economy.rewardCosts?.[r.id] ?? r.cost;
}

export function isAllowed(config: Config, actorId: string, kidId: string, perm: Permission): boolean {
  const actor = config.actors.find((a) => a.id === actorId);
  if (!actor || !actor.active) return false;
  if (actor.role === "parent") return true;
  if (actor.kidIds && !actor.kidIds.includes(kidId)) return false;
  return actor.can?.includes(perm) ?? false;
}

function isParent(config: Config, actorId: string): boolean {
  return config.actors.some((a) => a.id === actorId && a.active && a.role === "parent");
}

// ---------- engine ----------

type ReviewStatus = "approved" | "rejected" | "none";
type CountStatus = "ok" | "pending" | "rejected";

/** Asks are treated as one-off must-do activities. */
function askAsActivity(kid: Kid, ask: AskEvent): Activity {
  return {
    id: `ask:${ask.id}`,
    name: ask.title,
    kidIds: [kid.id],
    tier: "must",
    kind: "check",
    points: ask.points,
    requiresApproval: kid.economy.asksRequireApproval ?? true,
  };
}

function basePoints(a: Activity, ev: CompletionEvent): { pts: number; tooShort: boolean } {
  if (a.kind !== "timed") return { pts: a.points ?? 0, tooShort: false };
  const mins = timedMinutes(ev);
  if (a.minMinutes && mins < a.minMinutes) return { pts: 0, tooShort: true };
  const paid = a.maxMinutes ? Math.min(mins, a.maxMinutes) : mins;
  return { pts: Math.round(paid * (a.pointsPerMinute ?? 0)), tooShort: false };
}

interface MissedAsk {
  type: "__missed";
  id: string;
  at: string;
  ask: AskEvent;
}

export function computeKid(
  config: Config,
  ledger: LedgerEvent[],
  kidId: string,
  now: string,
): KidState {
  const tz = config.timezone;
  const kid = getKid(config, kidId);
  const eco = kid.economy;
  const actorName = (id: string) => config.actors.find((a: Actor) => a.id === id)?.name ?? id;
  const can = (actorId: string, perm: Permission) => isAllowed(config, actorId, kidId, perm);

  const all = ledger
    .filter((e) => e.kidId === kidId && Date.parse(e.at) <= Date.parse(now))
    .sort((a, b) => a.at.localeCompare(b.at));

  // 0) Parent voids remove events entirely (including other voids' targets).
  const voided = new Set(
    all.filter((e) => e.type === "void" && isParent(config, e.by)).map((e) => (e as { targetId: string }).targetId),
  );
  const events = all.filter((e) => e.type !== "void" && !voided.has(e.id));

  // 1) Reviews from adults allowed to approve. Latest wins.
  const reviews = new Map<string, ReviewStatus>();
  for (const e of events) {
    if ((e.type === "approval" || e.type === "rejection") && can(e.by, "approve")) {
      reviews.set(e.targetId, e.type === "approval" ? "approved" : "rejected");
    }
  }

  // 2) Asks from adults allowed to assign them.
  const asks = new Map<string, AskEvent>();
  for (const e of events) if (e.type === "ask" && can(e.by, "assignAsks")) asks.set(e.id, e);

  const activities = new Map(config.activities.map((a) => [a.id, activityFor(kid, a)]));
  const unitFor = (e: CompletionEvent): Activity | undefined => {
    if (e.askId) {
      const ask = asks.get(e.askId);
      return ask ? askAsActivity(kid, ask) : undefined;
    }
    const a = e.activityId ? activities.get(e.activityId) : undefined;
    return a && a.kidIds.includes(kidId) ? a : undefined;
  };
  const countStatus = (a: Activity, e: CompletionEvent): CountStatus => {
    const r = reviews.get(e.id) ?? "none";
    if (r === "rejected") return "rejected";
    if (a.requiresApproval && r !== "approved") return "pending";
    return "ok";
  };

  // 3) Gate bookkeeping: what got done (and counted) in each gate period.
  const gates = config.gates.filter((g) => g.kidId === kidId);
  const done = new Map<string, Set<string>>(); // `${gateId}|${periodKey}` -> unit ids
  const askDone = new Map<string, string>(); // askId -> at of first counted completion
  for (const e of events) {
    if (e.type !== "completion") continue;
    const a = unitFor(e);
    if (!a || countStatus(a, e) !== "ok") continue;
    if (e.askId && !askDone.has(e.askId)) askDone.set(e.askId, e.at);
    for (const g of gates) {
      const k = `${g.id}|${periodKey(e.at, tz, g.period)}`;
      if (!done.has(k)) done.set(k, new Set());
      done.get(k)!.add(a.id);
    }
  }
  const gateRemaining = (g: Gate, pk: string): string[] => {
    const s = done.get(`${g.id}|${pk}`);
    const out = g.requiredActivityIds
      .filter((id) => !s?.has(id))
      .map((id) => activities.get(id)?.name ?? id);
    if (g.includeAsks) {
      for (const ask of asks.values()) {
        if (periodKey(ask.at, tz, g.period) === pk && !s?.has(`ask:${ask.id}`)) out.push(ask.title);
      }
    }
    return out;
  };
  const gateMet = (g: Gate, pk: string) => gateRemaining(g, pk).length === 0;
  const isGateChore = (g: Gate, a: Activity) =>
    g.requiredActivityIds.includes(a.id) || (g.includeAsks === true && a.id.startsWith("ask:"));

  // 4) Missed asks: due time passed with nothing submitted before it.
  const missed: MissedAsk[] = [];
  for (const ask of asks.values()) {
    if (!ask.dueAt || Date.parse(ask.dueAt) > Date.parse(now)) continue;
    const submittedInTime = events.some(
      (e) =>
        e.type === "completion" &&
        e.askId === ask.id &&
        Date.parse(e.at) <= Date.parse(ask.dueAt!) &&
        reviews.get(e.id) !== "rejected",
    );
    if (!submittedInTime) missed.push({ type: "__missed", id: `missed:${ask.id}`, at: ask.dueAt, ask });
  }

  // 5) Walk everything in time order and bucket every coin.
  const state: KidState = {
    kidId,
    available: 0,
    held: 0,
    pending: 0,
    forfeited: 0,
    xp: 0,
    level: 1,
    nextLevelAt: null,
    gates: [],
    asks: [],
    shopLocked: false,
    lockReasons: [],
    history: [],
  };
  const allowNegative = eco.allowNegativeBalance ?? config.allowNegativeBalance;
  const credit = (n: number) => {
    state.available += n;
    state.xp += n;
  };
  const debit = (n: number): number => {
    const before = state.available;
    state.available -= n;
    if (!allowNegative) state.available = Math.max(0, state.available);
    return state.available - before;
  };
  const capCount = new Map<string, number>();
  const paidAsks = new Set<string>();
  const caregiverUsed = new Map<string, number>(); // `${actor}|${type}|${day}` -> coins

  const stream: (LedgerEvent | MissedAsk)[] = [...events, ...missed].sort((a, b) => a.at.localeCompare(b.at));
  for (const e of stream) {
    const push = (h: Omit<HistoryEntry, "eventId" | "at">) => state.history.push({ eventId: e.id, at: e.at, ...h });

    switch (e.type) {
      case "completion": {
        const a = unitFor(e);
        if (!a) break;
        const label = a.name;
        const status = countStatus(a, e);
        const { pts, tooShort } = basePoints(a, e);
        if (status === "rejected") { push({ label, delta: 0, status: "rejected" }); break; }
        if (tooShort) { push({ label, delta: 0, status: "too-short" }); break; }

        // Daily cap (activities) / pay-once (asks). Pending attempts hold a slot.
        if (e.askId) {
          if (paidAsks.has(e.askId)) { push({ label, delta: 0, status: "capped" }); break; }
          paidAsks.add(e.askId);
        } else if (a.dailyCap !== undefined) {
          const ck = `${a.id}|${localDate(e.at, tz)}`;
          const n = capCount.get(ck) ?? 0;
          capCount.set(ck, n + 1);
          if (n >= a.dailyCap) { push({ label, delta: 0, status: "capped" }); break; }
        }
        if (status === "pending") { state.pending += pts; push({ label, delta: pts, status: "pending" }); break; }

        // Gates: does an unmet must-do lock these coins?
        let s: EntryStatus = "available";
        let gateName: string | undefined;
        for (const g of gates) {
          if (!g.holdsTiers.includes(a.tier) || isGateChore(g, a)) continue; // a chore never locks itself
          const pk = periodKey(e.at, tz, g.period);
          if (gateMet(g, pk)) continue;
          if (pk === periodKey(now, tz, g.period)) {
            if (s === "available") { s = "held"; gateName = g.name; }
          } else if (g.onMiss === "forfeit") {
            s = "forfeited"; gateName = g.name;
            break;
          }
        }
        if (s === "available") credit(pts);
        else if (s === "held") state.held += pts;
        else state.forfeited += pts;
        push({ label, delta: pts, status: s, gate: gateName });
        break;
      }

      case "ask": {
        const ok = asks.has(e.id);
        push({ label: `Asked: ${e.title}`, delta: 0, status: ok ? "available" : "unauthorized", by: actorName(e.by) });
        break;
      }

      case "__missed": {
        const penalize = eco.missedAskPenalty ?? false;
        const delta = penalize ? debit(e.ask.points) : 0;
        push({ label: `Missed: ${e.ask.title}`, delta, status: "missed", by: actorName(e.ask.by) });
        break;
      }

      case "compliment": {
        const pts = eco.complimentPoints ?? config.compliment.points;
        const label = `Shout-out from ${e.from} (${e.relationship})`;
        const r = reviews.get(e.id) ?? "none";
        if (r === "rejected") { push({ label, delta: 0, status: "rejected" }); break; }
        if (e.loggedBy === "kid") {
          if (r === "approved") { credit(pts); push({ label, delta: pts, status: "available" }); }
          else { state.pending += pts; push({ label, delta: pts, status: "pending" }); }
          break;
        }
        if (!can(e.loggedBy, "logCompliment")) {
          push({ label, delta: 0, status: "unauthorized", by: actorName(e.loggedBy) });
          break;
        }
        // Character pays immediately — compliments are never gate-held.
        credit(pts);
        push({ label, delta: pts, status: "available", by: actorName(e.loggedBy) });
        break;
      }

      case "bonus":
      case "penalty": {
        const perm: Permission = e.type === "bonus" ? "bonus" : "penalize";
        const label = `${e.type === "bonus" ? "Bonus" : "Penalty"}: ${e.reason}`;
        const by = actorName(e.by);
        if (!can(e.by, perm)) { push({ label, delta: 0, status: "unauthorized", by }); break; }

        // Caregiver daily limits.
        let amount = e.points;
        let status: EntryStatus = "available";
        const actor = config.actors.find((a) => a.id === e.by)!;
        const limit = actor.role === "caregiver" ? actor.dailyLimits?.[e.type] : undefined;
        if (limit !== undefined) {
          const k = `${e.by}|${e.type}|${localDate(e.at, tz)}`;
          const used = caregiverUsed.get(k) ?? 0;
          amount = Math.max(0, Math.min(amount, limit - used));
          caregiverUsed.set(k, used + amount);
          if (amount < e.points) status = "over-limit";
        }
        if (e.type === "bonus") { credit(amount); push({ label, delta: amount, status, by }); }
        else push({ label, delta: debit(amount), status, by });
        break;
      }

      case "redemption": {
        const r = config.rewards.find((x) => x.id === e.rewardId);
        state.available -= e.cost;
        push({ label: `Redeemed: ${r?.name ?? e.rewardId}`, delta: -e.cost, status: "available" });
        break;
      }
    }
  }

  // 6) Current gates, asks, shop lock.
  for (const g of gates) {
    const pk = periodKey(now, tz, g.period);
    const remaining = gateRemaining(g, pk);
    const met = remaining.length === 0;
    state.gates.push({ gateId: g.id, name: g.name, period: g.period, periodKey: pk, met, remaining });
    if (!met && g.blocksRedemption) {
      state.shopLocked = true;
      state.lockReasons.push(`${g.name}: still need ${remaining.join(", ")}`);
    }
  }
  const missedIds = new Set(missed.map((m) => m.ask.id));
  for (const ask of asks.values()) {
    const submitted = events.some(
      (e) => e.type === "completion" && e.askId === ask.id && reviews.get(e.id) !== "rejected",
    );
    state.asks.push({
      askId: ask.id,
      title: ask.title,
      points: ask.points,
      by: actorName(ask.by),
      at: ask.at,
      dueAt: ask.dueAt,
      status: askDone.has(ask.id) ? "done" : missedIds.has(ask.id) ? "missed" : submitted ? "pending" : "open",
    });
  }

  // 7) Level from lifetime XP.
  const t = eco.levelThresholds ?? config.levelThresholds;
  state.level = Math.max(1, t.filter((x) => state.xp >= x).length);
  state.nextLevelAt = t[state.level] ?? null;

  return state;
}

export function canRedeem(
  config: Config,
  ledger: LedgerEvent[],
  kidId: string,
  rewardId: string,
  now: string,
): { ok: true; reward: Reward; cost: number } | { ok: false; reason: string } {
  const kid = getKid(config, kidId);
  const reward = config.rewards.find((r) => r.id === rewardId);
  if (!reward) return { ok: false, reason: "No such reward." };
  if (reward.kidIds && !reward.kidIds.includes(kidId)) {
    return { ok: false, reason: "This reward isn't available to you." };
  }
  const cost = rewardCost(kid, reward);
  const s = computeKid(config, ledger, kidId, now);
  if (s.shopLocked) return { ok: false, reason: `Shop is locked. ${s.lockReasons.join("; ")}` };
  if (s.available < cost) return { ok: false, reason: `Need ${cost - s.available} more coins.` };
  return { ok: true, reward, cost };
}

export type AdultAction =
  | { type: "approve" }
  | { type: "ask" }
  | { type: "compliment" }
  | { type: "void" }
  | { type: "penalty" | "bonus"; points: number };

/**
 * Server-side check before an adult's action is written to the ledger.
 * (The engine also ignores anything unauthorized, as a second line of defense.)
 */
export function checkAdultAction(
  config: Config,
  ledger: LedgerEvent[],
  actorId: string,
  kidId: string,
  action: AdultAction,
  now: string,
): { ok: true } | { ok: false; reason: string } {
  if (action.type === "void") {
    return isParent(config, actorId) ? { ok: true } : { ok: false, reason: "Only a parent can undo entries." };
  }
  const perm: Permission =
    action.type === "approve" ? "approve"
    : action.type === "ask" ? "assignAsks"
    : action.type === "compliment" ? "logCompliment"
    : action.type === "penalty" ? "penalize"
    : "bonus";
  if (!isAllowed(config, actorId, kidId, perm)) return { ok: false, reason: "You don't have permission for that." };

  if (action.type === "penalty" || action.type === "bonus") {
    const actor = config.actors.find((a) => a.id === actorId)!;
    const limit = actor.role === "caregiver" ? actor.dailyLimits?.[action.type] : undefined;
    if (limit !== undefined) {
      const today = localDate(now, config.timezone);
      const voided = new Set(
        ledger.filter((e) => e.type === "void" && isParent(config, e.by)).map((e) => (e as { targetId: string }).targetId),
      );
      const used = ledger
        .filter(
          (e) =>
            e.type === action.type && e.kidId === kidId && e.by === actorId &&
            !voided.has(e.id) && localDate(e.at, config.timezone) === today,
        )
        .reduce((sum, e) => sum + (e as { points: number }).points, 0);
      if (used + action.points > limit) {
        return { ok: false, reason: `Daily ${action.type} limit is ${limit} coins; ${Math.max(0, limit - used)} left today.` };
      }
    }
  }
  return { ok: true };
}
