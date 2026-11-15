// Winkler Quest — core domain types.
// Everything the apps show is computed from a Config (set by parents) and an
// append-only Ledger of events (stamped by the server). Phones never hold the
// "truth" — they only display what the engine computes.

export type Tier =
  | "must" // the unpleasant, non-negotiable stuff (mowing, homework). Pays the most.
  | "growth" // reading, lifting, memory work, skin care
  | "easy" // the stuff they'd happily do anyway
  | "bonus"; // one-offs the parent adds

export type ActivityKind = "check" | "timed" | "proof";

export interface Kid {
  id: string;
  name: string;
}

export interface Activity {
  id: string;
  name: string;
  kidIds: string[];
  tier: Tier;
  kind: ActivityKind;
  /** Coins per completion (check / proof). */
  points?: number;
  /** Coins per minute (timed). */
  pointsPerMinute?: number;
  /** Timed: sessions shorter than this earn nothing. */
  minMinutes?: number;
  /** Timed: minutes beyond this are not paid. */
  maxMinutes?: number;
  /** Completions per day that pay; extras are logged but earn 0. */
  dailyCap?: number;
  /** If true, coins only count once a parent approves. */
  requiresApproval: boolean;
}

export type Period = "day" | "week";

/**
 * A Gate ties the "have to" chores to the "want to" rewards.
 * Until every required activity is done in the current period:
 *  - coins earned from `holdsTiers` activities are HELD (visible, not spendable)
 *  - if `blocksRedemption`, the reward shop is locked
 * When the period ends with the gate still unmet, held coins are forfeited
 * (onMiss: "forfeit") or released anyway (onMiss: "release").
 */
export interface Gate {
  id: string;
  name: string;
  kidId: string;
  period: Period;
  requiredActivityIds: string[];
  holdsTiers: Tier[];
  blocksRedemption: boolean;
  onMiss: "forfeit" | "release";
}

export interface Reward {
  id: string;
  name: string;
  cost: number;
  kind: "digital" | "physical";
  /** Digital: minutes of access granted on redeem. */
  minutes?: number;
  /** Digital: which UniFi device group the home bridge unlocks. */
  unifiGroup?: string;
  /** Restrict a reward to certain kids (e.g. car time). */
  kidIds?: string[];
}

export interface Config {
  timezone: string; // IANA, e.g. "America/Chicago"
  kids: Kid[];
  activities: Activity[];
  gates: Gate[];
  rewards: Reward[];
  /** Unsolicited compliment from an adult outside the family. */
  compliment: { points: number };
  allowNegativeBalance: boolean;
  /** Lifetime XP needed per level (index = level - 1). */
  levelThresholds: number[];
}

// ---------- Ledger events (append-only, server-timestamped) ----------

interface Base {
  id: string;
  kidId: string;
  /** ISO timestamp set by the server, never by the phone. */
  at: string;
}

export interface CompletionEvent extends Base {
  type: "completion";
  activityId: string;
  /** Timed activities: server-stamped start/stop. */
  startedAt?: string;
  endedAt?: string;
  proofUrl?: string;
}

export interface ReviewEvent extends Base {
  type: "approval" | "rejection";
  /** The completion or compliment being reviewed. */
  targetId: string;
  by: string;
  note?: string;
}

export interface ComplimentEvent extends Base {
  type: "compliment";
  from: string; // "Coach Ramirez", "Mrs. Lee (neighbor)"
  relationship: string; // teacher, coach, neighbor, employer...
  note: string;
  /** Logged by a parent = counts immediately. Submitted by the kid = needs approval. */
  loggedBy: "parent" | "kid";
}

export interface AdjustEvent extends Base {
  type: "penalty" | "bonus";
  points: number; // positive number; sign comes from the type
  reason: string;
  by: string;
}

export interface RedemptionEvent extends Base {
  type: "redemption";
  rewardId: string;
}

export type LedgerEvent =
  | CompletionEvent
  | ReviewEvent
  | ComplimentEvent
  | AdjustEvent
  | RedemptionEvent;
