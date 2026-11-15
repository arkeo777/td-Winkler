// Winkler Quest — core domain types.
// Everything the apps show is computed from a Config (set by parents) and an
// append-only Ledger of events (stamped by the server). Phones never hold the
// "truth" — they only display what the engine computes.

export type Tier =
  | "must" // the non-negotiable stuff (mowing, coop, homework). Pays the most.
  | "growth" // reading, lifting, memory work, skin care
  | "easy" // the stuff they'd happily do anyway
  | "bonus"; // one-offs

export type ActivityKind = "check" | "timed" | "proof";

/** Fields a kid's economy can override per activity. */
export type ActivityTuning = Partial<
  Pick<Activity, "points" | "pointsPerMinute" | "minMinutes" | "maxMinutes" | "dailyCap" | "requiresApproval" | "tier">
>;

/**
 * Each kid has his own reward system. A doer and a kid who needs a push
 * get different prices, pay rates and strictness.
 */
export interface KidEconomy {
  /** Per-activity pay/strictness for this kid (by activity id). */
  activityTuning?: Record<string, ActivityTuning>;
  /** Per-reward price for this kid (by reward id). */
  rewardCosts?: Record<string, number>;
  /** Coins for an unsolicited outside compliment (falls back to config default). */
  complimentPoints?: number;
  allowNegativeBalance?: boolean;
  /** Mom's asks need an adult to confirm before they pay. Default true. */
  asksRequireApproval?: boolean;
  /** An ask not done by its due time costs its value. Default false. */
  missedAskPenalty?: boolean;
  /** XP needed per level for this kid (index = level - 1). */
  levelThresholds?: number[];
}

export interface Kid {
  id: string;
  name: string;
  /** "MM-DD". Real values live only in the private database, never in this repo. */
  birthday?: string;
  economy: KidEconomy;
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
  /** If true, coins only count once an adult approves. */
  requiresApproval: boolean;
}

export type Period = "day" | "week";

/**
 * A Gate ties the "have to" chores to the "want to" rewards.
 * Until every required activity (and, optionally, every ask from Mom) is done
 * in the current period:
 *  - coins earned from `holdsTiers` activities are HELD (visible, not spendable)
 *  - if `blocksRedemption`, the reward shop is locked
 * When the period ends with the gate unmet, held coins are forfeited
 * (onMiss: "forfeit") or released anyway (onMiss: "release").
 */
export interface Gate {
  id: string;
  name: string;
  kidId: string;
  period: Period;
  requiredActivityIds: string[];
  /** Asks assigned during the period must also be done. */
  includeAsks?: boolean;
  holdsTiers: Tier[];
  blocksRedemption: boolean;
  onMiss: "forfeit" | "release";
}

export interface Reward {
  id: string;
  name: string;
  /** Default price; a kid's economy can override it. */
  cost: number;
  kind: "digital" | "physical";
  /** Digital: minutes of access granted on redeem. */
  minutes?: number;
  /** Digital: which UniFi device group the home bridge unlocks. */
  unifiGroup?: string;
  /** Restrict a reward to certain kids (e.g. car time). */
  kidIds?: string[];
}

export type Permission = "approve" | "penalize" | "bonus" | "assignAsks" | "logCompliment";

/**
 * Adults who can play a role in the game. Parents can do everything.
 * Caregivers (older sibling, grandparent, guardian, sitter) get only the
 * permissions a parent grants, optionally limited to certain kids and a daily cap.
 */
export interface Actor {
  id: string;
  name: string;
  role: "parent" | "caregiver";
  relationship?: string; // "Mom", "Grandma", "Big sister", "Guardian"
  active: boolean;
  /** Caregivers only. Parents implicitly have everything. */
  can?: Permission[];
  /** Caregivers only: limit to these kids (omit = all kids). */
  kidIds?: string[];
  /** Caregivers only: max coins they can take away / give per kid per day. */
  dailyLimits?: { penalty?: number; bonus?: number };
}

export interface Config {
  timezone: string; // IANA, e.g. "America/Chicago"
  kids: Kid[];
  actors: Actor[];
  activities: Activity[];
  gates: Gate[];
  rewards: Reward[];
  /** Default coins for an unsolicited compliment from an adult outside the family. */
  compliment: { points: number };
  allowNegativeBalance: boolean;
  /** Default lifetime XP needed per level (index = level - 1). */
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
  /** A standing activity... */
  activityId?: string;
  /** ...or a one-off ask from Mom / a caregiver. */
  askId?: string;
  /** Timed activities: server-stamped start/stop. */
  startedAt?: string;
  endedAt?: string;
  proofUrl?: string;
}

/** A one-off chore handed out during the day ("take the trash out before dinner"). */
export interface AskEvent extends Base {
  type: "ask";
  title: string;
  points: number;
  dueAt?: string;
  by: string; // actor id
}

export interface ReviewEvent extends Base {
  type: "approval" | "rejection";
  /** The completion or compliment being reviewed. */
  targetId: string;
  by: string; // actor id
  note?: string;
}

export interface ComplimentEvent extends Base {
  type: "compliment";
  from: string; // "Coach Ramirez", "Mrs. Lee"
  relationship: string; // teacher, coach, neighbor, employer...
  note: string;
  /** "kid" = self-reported (needs approval); otherwise the actor id who logged it. */
  loggedBy: string;
}

export interface AdjustEvent extends Base {
  type: "penalty" | "bonus";
  points: number; // positive number; sign comes from the type
  reason: string;
  by: string; // actor id
}

export interface RedemptionEvent extends Base {
  type: "redemption";
  rewardId: string;
  /** Price at the moment of purchase (so later price changes don't rewrite history). */
  cost: number;
}

/** Parent-only: cancel any event (e.g. undo a caregiver's penalty). */
export interface VoidEvent extends Base {
  type: "void";
  targetId: string;
  by: string;
  reason: string;
}

export type LedgerEvent =
  | CompletionEvent
  | AskEvent
  | ReviewEvent
  | ComplimentEvent
  | AdjustEvent
  | RedemptionEvent
  | VoidEvent;
