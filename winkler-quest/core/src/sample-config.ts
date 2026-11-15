// Starter config — placeholder names and values. Parents edit all of this in the app.
// son1 = older (driver's-license track), set up as the "doer".
// son2 = set up as the one who "needs a push". Swap if that's backwards.
import type { Config } from "./types.ts";

export const sampleConfig: Config = {
  timezone: "America/Chicago",

  kids: [
    {
      id: "son1",
      name: "Son 1",
      // The doer: standard pay, lighter gates.
      economy: {
        asksRequireApproval: false,
        missedAskPenalty: false,
      },
    },
    {
      id: "son2",
      name: "Son 2",
      // Needs a push: must-dos pay MORE, easy stuff pays less, everything gets
      // checked, Mom's asks gate the shop, missed asks cost coins.
      economy: {
        activityTuning: {
          eggs: { points: 15, requiresApproval: true },
          "feed-water": { points: 15, requiresApproval: true },
          "coop-clean": { points: 120 },
          bathroom: { points: 90 },
          "room-clean": { points: 25, requiresApproval: true },
          "make-bed": { points: 2 },
        },
        rewardCosts: { "gaming-1h": 100 },
        asksRequireApproval: true,
        missedAskPenalty: true,
      },
    },
  ],

  actors: [
    { id: "dad", name: "Dad", role: "parent", active: true },
    { id: "mom", name: "Mom", role: "parent", active: true },
    {
      id: "grandma", name: "Grandma", role: "caregiver", relationship: "Grandparent", active: true,
      can: ["approve", "assignAsks", "logCompliment", "bonus", "penalize"],
      dailyLimits: { bonus: 50, penalty: 30 },
    },
    {
      id: "big-sister", name: "Big sister", role: "caregiver", relationship: "Sibling", active: true,
      can: ["approve", "assignAsks", "penalize"],
      dailyLimits: { penalty: 15 },
    },
    {
      id: "sitter", name: "Sitter", role: "caregiver", relationship: "Guardian", active: false,
      can: ["approve", "assignAsks"],
    },
  ],

  activities: [
    // ---- Chickens (daily + weekly) ----
    { id: "eggs", name: "Collect the eggs", kidIds: ["son1", "son2"], tier: "must", kind: "proof", points: 10, dailyCap: 1, requiresApproval: false },
    { id: "feed-water", name: "Chicken food & water full", kidIds: ["son1", "son2"], tier: "must", kind: "proof", points: 10, dailyCap: 1, requiresApproval: false },
    { id: "coop-clean", name: "Clean the chicken coop", kidIds: ["son1", "son2"], tier: "must", kind: "proof", points: 80, requiresApproval: true },
    // ---- Yard (weekly) ----
    { id: "mow", name: "Mow the yard (~5 hrs)", kidIds: ["son1", "son2"], tier: "must", kind: "proof", points: 400, requiresApproval: true },
    { id: "weed-eat", name: "Weed eating", kidIds: ["son1", "son2"], tier: "must", kind: "proof", points: 150, requiresApproval: true },
    // ---- House ----
    { id: "bathroom", name: "Clean your bathroom", kidIds: ["son1", "son2"], tier: "must", kind: "proof", points: 60, requiresApproval: true },
    { id: "room-clean", name: "Room clean", kidIds: ["son1", "son2"], tier: "must", kind: "proof", points: 15, dailyCap: 1, requiresApproval: false },
    { id: "homework", name: "Homework done", kidIds: ["son1", "son2"], tier: "must", kind: "proof", points: 30, dailyCap: 1, requiresApproval: true },
    { id: "make-bed", name: "Make your bed", kidIds: ["son1", "son2"], tier: "easy", kind: "check", points: 5, dailyCap: 1, requiresApproval: false },
    // ---- Growth ----
    { id: "reading", name: "Reading", kidIds: ["son1", "son2"], tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 10, maxMinutes: 60, requiresApproval: false },
    { id: "memory", name: "Memory work", kidIds: ["son1", "son2"], tier: "growth", kind: "timed", pointsPerMinute: 1.5, minMinutes: 5, maxMinutes: 30, requiresApproval: false },
    { id: "lifting", name: "Lift weights", kidIds: ["son1", "son2"], tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 20, maxMinutes: 60, requiresApproval: false },
    { id: "skincare", name: "Skin care routine (AM/PM)", kidIds: ["son1", "son2"], tier: "growth", kind: "check", points: 5, dailyCap: 2, requiresApproval: false },
    { id: "driving", name: "Supervised driving practice", kidIds: ["son1"], tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 15, maxMinutes: 90, requiresApproval: true },
  ],

  gates: [
    // son1 (doer): daily gate only holds the easy stuff; weekly yard + bathroom lock the shop.
    {
      id: "son1-daily", name: "Daily must-dos", kidId: "son1", period: "day",
      requiredActivityIds: ["homework"],
      holdsTiers: ["easy"], blocksRedemption: true, onMiss: "release",
    },
    {
      id: "son1-weekly", name: "Weekly must-dos", kidId: "son1", period: "week",
      requiredActivityIds: ["mow", "weed-eat", "bathroom"],
      holdsTiers: ["easy"], blocksRedemption: true, onMiss: "forfeit",
    },
    // son2 (needs a push): chickens + homework + Mom's asks hold EVERYTHING else.
    {
      id: "son2-daily", name: "Daily must-dos", kidId: "son2", period: "day",
      requiredActivityIds: ["eggs", "feed-water", "homework"], includeAsks: true,
      holdsTiers: ["growth", "easy", "bonus"], blocksRedemption: true, onMiss: "forfeit",
    },
    {
      id: "son2-weekly", name: "Weekly must-dos", kidId: "son2", period: "week",
      requiredActivityIds: ["coop-clean", "bathroom"],
      holdsTiers: ["easy"], blocksRedemption: true, onMiss: "forfeit",
    },
  ],

  rewards: [
    { id: "tv-1h", name: "1 hour TV", cost: 60, kind: "digital", minutes: 60, unifiGroup: "tv" },
    { id: "gaming-1h", name: "1 hour gaming", cost: 80, kind: "digital", minutes: 60, unifiGroup: "consoles" },
    { id: "pizza", name: "Pizza party", cost: 1500, kind: "physical" },
    { id: "car-1h", name: "1 hour of car time", cost: 300, kind: "physical", kidIds: ["son1"] },
  ],

  compliment: { points: 150 },
  allowNegativeBalance: false,
  levelThresholds: [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000],
};
