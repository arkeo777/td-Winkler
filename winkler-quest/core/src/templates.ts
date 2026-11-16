// Templates + onboarding: turn a new family's choices into a household Config.
// Any family can pick kids, chores and rewards from the library (or add their own),
// and the engine runs exactly the same way it does for the first household.

import { suggestedPoints } from "./engine.ts";
import type { Activity, Actor, Config, Gate, Kid, Reward, Tier } from "./types.ts";

export type Frequency = "daily" | "weekly";

export interface ChoreTemplate {
  id: string;
  name: string;
  pack: string; // "Everyday", "Kitchen", "Yard", "Animals", "Pets", "Faith", ...
  frequency: Frequency;
  tier: Tier;
  difficulty: 1 | 2 | 3 | 4 | 5;
  typicalMinutes: number;
  minAge: number;
  kind?: "check" | "proof" | "timed";
  weekdays?: number[];
  activeMonths?: number[];
}

const SEASON = [4, 5, 6, 7, 8, 9, 10];

export const CHORE_LIBRARY: ChoreTemplate[] = [
  // Everyday
  { id: "make-bed", name: "Make bed", pack: "Everyday", frequency: "daily", tier: "must", difficulty: 1, typicalMinutes: 3, minAge: 4 },
  { id: "room-clean", name: "Room clean", pack: "Everyday", frequency: "daily", tier: "must", difficulty: 2, typicalMinutes: 15, minAge: 5 },
  { id: "homework", name: "Homework done", pack: "Everyday", frequency: "daily", tier: "must", difficulty: 3, typicalMinutes: 45, minAge: 6 },
  { id: "brush-teeth", name: "Brush teeth (AM / PM)", pack: "Everyday", frequency: "daily", tier: "growth", difficulty: 1, typicalMinutes: 3, minAge: 3, kind: "check" },
  { id: "skincare", name: "Skin care (AM / PM)", pack: "Everyday", frequency: "daily", tier: "growth", difficulty: 1, typicalMinutes: 5, minAge: 11, kind: "check" },
  { id: "laundry", name: "Wash your clothes", pack: "Everyday", frequency: "weekly", tier: "must", difficulty: 2, typicalMinutes: 30, minAge: 10 },
  { id: "bedding", name: "Wash your bedding", pack: "Everyday", frequency: "weekly", tier: "must", difficulty: 2, typicalMinutes: 25, minAge: 10 },
  { id: "bathroom", name: "Clean your bathroom", pack: "Everyday", frequency: "weekly", tier: "must", difficulty: 4, typicalMinutes: 40, minAge: 9 },
  { id: "trash", name: "Trash out", pack: "Everyday", frequency: "weekly", tier: "must", difficulty: 2, typicalMinutes: 10, minAge: 8 },
  // Kitchen
  { id: "kitchen", name: "Kitchen clean after dinner", pack: "Kitchen", frequency: "daily", tier: "must", difficulty: 3, typicalMinutes: 25, minAge: 9 },
  { id: "dishwasher", name: "Unload the dishwasher", pack: "Kitchen", frequency: "daily", tier: "must", difficulty: 2, typicalMinutes: 10, minAge: 7 },
  { id: "set-table", name: "Set the table", pack: "Kitchen", frequency: "daily", tier: "must", difficulty: 1, typicalMinutes: 5, minAge: 5 },
  { id: "vacuum-kitchen", name: "Vacuum + sweep kitchen", pack: "Kitchen", frequency: "weekly", tier: "must", difficulty: 2, typicalMinutes: 15, minAge: 8 },
  // Yard
  { id: "mow", name: "Mow the yard", pack: "Yard", frequency: "weekly", tier: "must", difficulty: 4, typicalMinutes: 90, minAge: 12, activeMonths: SEASON },
  { id: "weed-eat", name: "Weed eating", pack: "Yard", frequency: "weekly", tier: "must", difficulty: 4, typicalMinutes: 60, minAge: 12, activeMonths: SEASON },
  { id: "rake", name: "Rake leaves", pack: "Yard", frequency: "weekly", tier: "must", difficulty: 3, typicalMinutes: 60, minAge: 8, activeMonths: [10, 11, 12] },
  // Animals
  { id: "eggs", name: "Collect eggs", pack: "Animals", frequency: "daily", tier: "must", difficulty: 1, typicalMinutes: 5, minAge: 6 },
  { id: "feed-water", name: "Animal food + water full", pack: "Animals", frequency: "daily", tier: "must", difficulty: 2, typicalMinutes: 10, minAge: 6 },
  { id: "coop-clean", name: "Clean the chicken coop", pack: "Animals", frequency: "weekly", tier: "must", difficulty: 5, typicalMinutes: 45, minAge: 10 },
  // Pets
  { id: "feed-pet", name: "Feed the pets", pack: "Pets", frequency: "daily", tier: "must", difficulty: 1, typicalMinutes: 5, minAge: 5 },
  { id: "walk-dog", name: "Walk the dog", pack: "Pets", frequency: "daily", tier: "must", difficulty: 2, typicalMinutes: 20, minAge: 9 },
  { id: "wash-dog", name: "Wash the dog", pack: "Pets", frequency: "weekly", tier: "bonus", difficulty: 3, typicalMinutes: 30, minAge: 10 },
  // Growth
  { id: "reading", name: "Reading", pack: "Growth", frequency: "daily", tier: "growth", difficulty: 2, typicalMinutes: 30, minAge: 5, kind: "timed" },
  { id: "practice-instrument", name: "Practice instrument", pack: "Growth", frequency: "daily", tier: "growth", difficulty: 3, typicalMinutes: 30, minAge: 6, kind: "timed" },
  { id: "lifting", name: "Exercise / lift weights", pack: "Growth", frequency: "daily", tier: "growth", difficulty: 3, typicalMinutes: 30, minAge: 12, kind: "timed" },
  // Faith (optional pack)
  { id: "scripture", name: "Scripture memory", pack: "Faith", frequency: "weekly", tier: "growth", difficulty: 3, typicalMinutes: 30, minAge: 6, kind: "check" },
];

export const REWARD_LIBRARY: Reward[] = [
  { id: "tv-1h", name: "1 h TV / YouTube", cost: 60, kind: "digital", minutes: 60 },
  { id: "gaming-1h", name: "1 h gaming", cost: 80, kind: "digital", minutes: 60 },
  { id: "stay-up", name: "Stay up 30 min late", cost: 60, kind: "physical" },
  { id: "pick-dinner", name: "Pick dinner", cost: 100, kind: "physical" },
  { id: "friend-over", name: "Friend over", cost: 300, kind: "physical" },
  { id: "sleepover", name: "Sleepover", cost: 500, kind: "physical" },
  { id: "cash-5", name: "Cash out $5", cost: 50, kind: "cash", dollars: 5 },
  { id: "pizza", name: "Pizza party", cost: 1500, kind: "physical" },
];

// ---------- onboarding ----------

export interface OnboardingKid {
  id: string; // generated by the backend (uuid)
  name: string;
  age: number;
  /** "doer" = lighter gates; "needs-push" = stricter gates, must-dos pay more. */
  style: "doer" | "needs-push";
}

export interface ChoreChoice {
  /** A library template id, or omitted for a custom chore. */
  templateId?: string;
  /** Custom chores (or overrides of a template). */
  custom?: Partial<ChoreTemplate> & { name: string };
  kidIds: string[];
  /** Kids take turns (by day for daily chores, by week for weekly). */
  takeTurns?: boolean;
  /** Parent-set value; otherwise the suggested value. */
  points?: number;
}

export interface OnboardingAnswers {
  timezone: string;
  parents: { id: string; name: string }[];
  helpers?: Actor[];
  kids: OnboardingKid[];
  chores: ChoreChoice[];
  rewards: (Reward | { templateId: string; cost?: number })[];
}

export const DEFAULT_PAY_SCALE: NonNullable<Config["payScale"]> = {
  coinsPerMinute: 1,
  difficultyMultipliers: [0.5, 1, 1.25, 1.5, 2],
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Build a complete household Config from a new family's onboarding choices. */
export function buildHouseholdConfig(a: OnboardingAnswers): Config {
  const partial: Config = {
    timezone: a.timezone,
    kids: [],
    actors: [],
    activities: [],
    gates: [],
    rewards: [],
    compliment: { points: 200 },
    allowNegativeBalance: false,
    payScale: DEFAULT_PAY_SCALE,
    cashOutWeeklyMaxDollars: 20,
    levelThresholds: [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000],
  };

  // Chores
  const frequencyOf = new Map<string, Frequency>();
  const seen = new Set<string>();
  for (const c of a.chores) {
    const base = c.templateId ? CHORE_LIBRARY.find((t) => t.id === c.templateId) : undefined;
    if (c.templateId && !base) throw new Error(`Unknown chore template: ${c.templateId}`);
    const t = { pack: "Custom", frequency: "daily", tier: "must", difficulty: 2, typicalMinutes: 15, minAge: 0, ...base, ...c.custom } as ChoreTemplate;
    let id = base?.id ?? `custom-${slug(t.name)}`;
    while (seen.has(id)) id += "-2";
    seen.add(id);
    const period = t.frequency === "daily" ? "day" : "week";
    const act: Activity = {
      id,
      name: t.name,
      kidIds: c.kidIds,
      tier: t.tier,
      kind: t.kind ?? "proof",
      difficulty: t.difficulty,
      typicalMinutes: t.typicalMinutes,
      requiresApproval: false,
      ...(t.weekdays ? { weekdays: t.weekdays } : {}),
      ...(t.activeMonths ? { activeMonths: t.activeMonths } : {}),
      ...(c.takeTurns && c.kidIds.length > 1 ? { rotation: { kidIds: c.kidIds, period } } : {}),
    };
    if (act.kind === "timed") {
      Object.assign(act, { pointsPerMinute: partial.payScale!.coinsPerMinute * partial.payScale!.difficultyMultipliers[t.difficulty - 1], minMinutes: 10, maxMinutes: 60 });
    } else {
      act.points = c.points ?? suggestedPoints(partial, act) ?? 10;
      if (t.frequency === "daily") act.dailyCap = act.kind === "check" ? 2 : 1;
    }
    partial.activities.push(act);
    frequencyOf.set(id, t.frequency);
  }

  // Kids, with style-based economies and gates
  partial.kids = a.kids.map((k): Kid => {
    if (k.style === "doer") return { id: k.id, name: k.name, economy: { asksRequireApproval: false, missedAskPenalty: false } };
    // Needs a push: must-dos +40%, the big weekly ones need a tap to approve.
    const activityTuning: NonNullable<Kid["economy"]["activityTuning"]> = {};
    for (const act of partial.activities) {
      if (!act.kidIds.includes(k.id) || act.tier !== "must" || act.points === undefined) continue;
      activityTuning[act.id] = {
        points: Math.round((act.points * 1.4) / 5) * 5,
        ...(frequencyOf.get(act.id) === "weekly" ? { requiresApproval: true } : {}),
      };
    }
    return { id: k.id, name: k.name, economy: { activityTuning, asksRequireApproval: true, missedAskPenalty: true } };
  });

  for (const k of a.kids) {
    const mine = partial.activities.filter((x) => x.kidIds.includes(k.id) && x.tier === "must");
    const daily = mine.filter((x) => frequencyOf.get(x.id) === "daily").map((x) => x.id);
    const weekly = mine.filter((x) => frequencyOf.get(x.id) === "weekly").map((x) => x.id);
    const push = k.style === "needs-push";
    const gates: Gate[] = [
      {
        id: `${k.id}-daily`, name: "Daily must-dos", kidId: k.id, period: "day", requiredActivityIds: daily,
        includeAsks: push, holdsTiers: push ? ["growth", "easy", "bonus"] : ["easy"],
        blocksRedemption: true, onMiss: push ? "forfeit" : "release",
      },
      {
        id: `${k.id}-weekly`, name: "Weekly must-dos", kidId: k.id, period: "week", requiredActivityIds: weekly,
        holdsTiers: ["easy"], blocksRedemption: true, onMiss: "forfeit",
      },
    ];
    partial.gates.push(...gates.filter((g) => g.requiredActivityIds.length > 0));
  }

  // People
  partial.actors = [
    ...a.parents.map((p): Actor => ({ id: p.id, name: p.name, role: "parent", active: true })),
    ...(a.helpers ?? []),
  ];

  // Rewards
  partial.rewards = a.rewards.map((r) => {
    if ("templateId" in r) {
      const t = REWARD_LIBRARY.find((x) => x.id === r.templateId);
      if (!t) throw new Error(`Unknown reward template: ${r.templateId}`);
      return { ...t, ...(r.cost !== undefined ? { cost: r.cost } : {}) };
    }
    return r;
  });

  return partial;
}
