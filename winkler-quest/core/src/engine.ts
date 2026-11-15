// Winkler Quest — rules engine.
// Pure functions: (config, ledger, now) -> what each kid has.
// Runs on the server; the apps only render the result.

import type {
  Activity,
  CompletionEvent,
  Config,
  Gate,
  LedgerEvent,
  Period,
  Reward,
} from "./types.ts";

export type EntryStatus =
  | "available" // spendable
  | "held" // earned, but locked behind an unmet must-do gate
  | "pending" // waiting on parent approval
  | "forfeited" // gate was missed for that period
  | "rejected" // parent rejected it
  | "capped" // over the daily limit for that activity
  | "too-short"; // timed session under the minimum

export interface HistoryEntry {
  eventId: string;
  at: string;
  label: string;
  delta: number;
  status: EntryStatus;
  /** For held/forfeited entries: which gate did it. */
  gate?: string;
}

export interface GateStatus {
  gateId: string;
  name: string;
  period: Period;
  periodKey: string;
  met: boolean;
  remaining: string[]; // activity names still to do
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

// ---------- engine ----------

type ReviewStatus = "approved" | "rejected" | "none";

function reviewMap(events: LedgerEvent[]): Map<string, ReviewStatus> {
  const m = new Map<string, ReviewStatus>();
  for (const e of events) {
    if (e.type === "approval") m.set(e.targetId, "approved");
    if (e.type === "rejection") m.set(e.targetId, "rejected");
  }
  return m;
}

/** Does this completion count toward balances and gates? */
function completionCounts(a: Activity, ev: CompletionEvent, reviews: Map<string, ReviewStatus>) {
  const r = reviews.get(ev.id) ?? "none";
  if (r === "rejected") return "rejected" as const;
  if (a.requiresApproval && r !== "approved") return "pending" as const;
  return "ok" as const;
}

function basePoints(a: Activity, ev: CompletionEvent): { pts: number; tooShort: boolean } {
  if (a.kind !== "timed") return { pts: a.points ?? 0, tooShort: false };
  const mins = timedMinutes(ev);
  if (a.minMinutes && mins < a.minMinutes) return { pts: 0, tooShort: true };
  const paid = a.maxMinutes ? Math.min(mins, a.maxMinutes) : mins;
  return { pts: Math.round(paid * (a.pointsPerMinute ?? 0)), tooShort: false };
}

export function computeKid(
  config: Config,
  ledger: LedgerEvent[],
  kidId: string,
  now: string,
): KidState {
  const tz = config.timezone;
  const events = ledger
    .filter((e) => e.kidId === kidId)
    .sort((a, b) => a.at.localeCompare(b.at));
  const reviews = reviewMap(events);
  const activities = new Map(config.activities.map((a) => [a.id, a]));
  const gates = config.gates.filter((g) => g.kidId === kidId);

  // 1) Which required activities were done (and counted) in each gate period?
  const done = new Map<string, Set<string>>(); // `${gateId}|${periodKey}` -> activityIds
  for (const e of events) {
    if (e.type !== "completion") continue;
    const a = activities.get(e.activityId);
    if (!a || completionCounts(a, e, reviews) !== "ok") continue;
    for (const g of gates) {
      if (!g.requiredActivityIds.includes(a.id)) continue;
      const k = `${g.id}|${periodKey(e.at, tz, g.period)}`;
      if (!done.has(k)) done.set(k, new Set());
      done.get(k)!.add(a.id);
    }
  }
  const gateMet = (g: Gate, pk: string) => {
    const s = done.get(`${g.id}|${pk}`);
    return g.requiredActivityIds.every((id) => s?.has(id));
  };

  // 2) Walk the ledger and bucket every coin.
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
    shopLocked: false,
    lockReasons: [],
    history: [],
  };
  const capCount = new Map<string, number>(); // `${activityId}|${day}` -> paid completions
  const credit = (n: number) => {
    state.available += n;
    state.xp += n;
  };

  for (const e of events) {
    switch (e.type) {
      case "completion": {
        const a = activities.get(e.activityId);
        if (!a) break;
        const label = a.name;
        const counts = completionCounts(a, e, reviews);
        const { pts, tooShort } = basePoints(a, e);

        if (counts === "rejected") {
          state.history.push({ eventId: e.id, at: e.at, label, delta: 0, status: "rejected" });
          break;
        }
        if (tooShort) {
          state.history.push({ eventId: e.id, at: e.at, label, delta: 0, status: "too-short" });
          break;
        }
        // Daily cap counts every non-rejected attempt, so pending ones hold a slot.
        if (a.dailyCap !== undefined) {
          const ck = `${a.id}|${localDate(e.at, tz)}`;
          const n = capCount.get(ck) ?? 0;
          capCount.set(ck, n + 1);
          if (n >= a.dailyCap) {
            state.history.push({ eventId: e.id, at: e.at, label, delta: 0, status: "capped" });
            break;
          }
        }
        if (counts === "pending") {
          state.pending += pts;
          state.history.push({ eventId: e.id, at: e.at, label, delta: pts, status: "pending" });
          break;
        }

        // Gates: does an unmet must-do lock these coins?
        let status: EntryStatus = "available";
        let gateName: string | undefined;
        for (const g of gates) {
          if (!g.holdsTiers.includes(a.tier)) continue;
          if (g.requiredActivityIds.includes(a.id)) continue; // the chore never locks itself
          const pk = periodKey(e.at, tz, g.period);
          if (gateMet(g, pk)) continue;
          const isCurrent = pk === periodKey(now, tz, g.period);
          if (isCurrent) {
            if (status === "available") {
              status = "held";
              gateName = g.name;
            }
          } else if (g.onMiss === "forfeit") {
            status = "forfeited";
            gateName = g.name;
            break;
          }
        }
        if (status === "available") credit(pts);
        else if (status === "held") state.held += pts;
        else state.forfeited += pts;
        state.history.push({ eventId: e.id, at: e.at, label, delta: pts, status, gate: gateName });
        break;
      }

      case "compliment": {
        const pts = config.compliment.points;
        const label = `Shout-out from ${e.from} (${e.relationship})`;
        const r = reviews.get(e.id) ?? "none";
        if (r === "rejected") {
          state.history.push({ eventId: e.id, at: e.at, label, delta: 0, status: "rejected" });
        } else if (e.loggedBy === "kid" && r !== "approved") {
          state.pending += pts;
          state.history.push({ eventId: e.id, at: e.at, label, delta: pts, status: "pending" });
        } else {
          // Character pays immediately — compliments are never gate-held.
          credit(pts);
          state.history.push({ eventId: e.id, at: e.at, label, delta: pts, status: "available" });
        }
        break;
      }

      case "bonus":
        credit(e.points);
        state.history.push({ eventId: e.id, at: e.at, label: `Bonus: ${e.reason}`, delta: e.points, status: "available" });
        break;

      case "penalty": {
        const before = state.available;
        state.available -= e.points;
        if (!config.allowNegativeBalance) state.available = Math.max(0, state.available);
        state.history.push({
          eventId: e.id,
          at: e.at,
          label: `Penalty: ${e.reason}`,
          delta: state.available - before,
          status: "available",
        });
        break;
      }

      case "redemption": {
        const r = config.rewards.find((x) => x.id === e.rewardId);
        const cost = r?.cost ?? 0;
        state.available -= cost;
        state.history.push({ eventId: e.id, at: e.at, label: `Redeemed: ${r?.name ?? e.rewardId}`, delta: -cost, status: "available" });
        break;
      }
    }
  }

  // 3) Current gate status + shop lock.
  for (const g of gates) {
    const pk = periodKey(now, tz, g.period);
    const s = done.get(`${g.id}|${pk}`);
    const remaining = g.requiredActivityIds
      .filter((id) => !s?.has(id))
      .map((id) => activities.get(id)?.name ?? id);
    const met = remaining.length === 0;
    state.gates.push({ gateId: g.id, name: g.name, period: g.period, periodKey: pk, met, remaining });
    if (!met && g.blocksRedemption) {
      state.shopLocked = true;
      state.lockReasons.push(`${g.name}: still need ${remaining.join(", ")}`);
    }
  }

  // 4) Level from lifetime XP.
  const t = config.levelThresholds;
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
): { ok: true; reward: Reward } | { ok: false; reason: string } {
  const reward = config.rewards.find((r) => r.id === rewardId);
  if (!reward) return { ok: false, reason: "No such reward." };
  if (reward.kidIds && !reward.kidIds.includes(kidId)) {
    return { ok: false, reason: "This reward isn't available to you." };
  }
  const s = computeKid(config, ledger, kidId, now);
  if (s.shopLocked) return { ok: false, reason: `Shop is locked. ${s.lockReasons.join("; ")}` };
  if (s.available < reward.cost) {
    return { ok: false, reason: `Need ${reward.cost - s.available} more coins.` };
  }
  return { ok: true, reward };
}
