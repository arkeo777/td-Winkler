// Starter config — placeholder names and values. Parents edit all of this in the app.
// older = 14, turning 15 (driver's-license track). Set up as the "doer" for now.
// younger = 13, turning 14. Set up as the one who "needs a push" for now. Swap if backwards.
import type { Config } from "./types.ts";

export const sampleConfig: Config = {
  timezone: "America/Chicago",

  kids: [
    {
      id: "older",
      name: "Older son",
      // The doer: standard pay, lighter gates.
      economy: {
        asksRequireApproval: false,
        missedAskPenalty: false,
      },
    },
    {
      id: "younger",
      name: "Younger son",
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
    { id: "eggs", name: "Collect the eggs", kidIds: ["older", "younger"], tier: "must", kind: "proof", points: 10, dailyCap: 1, requiresApproval: false },
    { id: "feed-water", name: "Chicken food & water full", kidIds: ["older", "younger"], tier: "must", kind: "proof", points: 10, dailyCap: 1, requiresApproval: false },
    { id: "coop-clean", name: "Clean the chicken coop", kidIds: ["older", "younger"], tier: "must", kind: "proof", points: 80, requiresApproval: true },
    // ---- Yard (weekly) ----
    { id: "mow", name: "Mow the yard (~5 hrs)", kidIds: ["older", "younger"], tier: "must", kind: "proof", points: 400, requiresApproval: true },
    { id: "weed-eat", name: "Weed eating", kidIds: ["older", "younger"], tier: "must", kind: "proof", points: 150, requiresApproval: true },
    // ---- House ----
    { id: "bathroom", name: "Clean your bathroom", kidIds: ["older", "younger"], tier: "must", kind: "proof", points: 60, requiresApproval: true },
    { id: "room-clean", name: "Room clean", kidIds: ["older", "younger"], tier: "must", kind: "proof", points: 15, dailyCap: 1, requiresApproval: false },
    { id: "homework", name: "Homework done", kidIds: ["older", "younger"], tier: "must", kind: "proof", points: 30, dailyCap: 1, requiresApproval: true },
    { id: "make-bed", name: "Make your bed", kidIds: ["older", "younger"], tier: "easy", kind: "check", points: 5, dailyCap: 1, requiresApproval: false },
    // ---- Growth ----
    { id: "reading", name: "Reading", kidIds: ["older", "younger"], tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 10, maxMinutes: 60, requiresApproval: false },
    { id: "memory", name: "Memory work", kidIds: ["older", "younger"], tier: "growth", kind: "timed", pointsPerMinute: 1.5, minMinutes: 5, maxMinutes: 30, requiresApproval: false },
    { id: "lifting", name: "Lift weights", kidIds: ["older", "younger"], tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 20, maxMinutes: 60, requiresApproval: false },
    { id: "skincare", name: "Skin care routine (AM/PM)", kidIds: ["older", "younger"], tier: "growth", kind: "check", points: 5, dailyCap: 2, requiresApproval: false },
    { id: "driving", name: "Supervised driving practice", kidIds: ["older"], tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 15, maxMinutes: 90, requiresApproval: true },
  ],

  gates: [
    // older (doer): daily gate only holds the easy stuff; weekly yard + bathroom lock the shop.
    {
      id: "older-daily", name: "Daily must-dos", kidId: "older", period: "day",
      requiredActivityIds: ["homework"],
      holdsTiers: ["easy"], blocksRedemption: true, onMiss: "release",
    },
    {
      id: "older-weekly", name: "Weekly must-dos", kidId: "older", period: "week",
      requiredActivityIds: ["mow", "weed-eat", "bathroom"],
      holdsTiers: ["easy"], blocksRedemption: true, onMiss: "forfeit",
    },
    // younger (needs a push): chickens + homework + Mom's asks hold EVERYTHING else.
    {
      id: "younger-daily", name: "Daily must-dos", kidId: "younger", period: "day",
      requiredActivityIds: ["eggs", "feed-water", "homework"], includeAsks: true,
      holdsTiers: ["growth", "easy", "bonus"], blocksRedemption: true, onMiss: "forfeit",
    },
    {
      id: "younger-weekly", name: "Weekly must-dos", kidId: "younger", period: "week",
      requiredActivityIds: ["coop-clean", "bathroom"],
      holdsTiers: ["easy"], blocksRedemption: true, onMiss: "forfeit",
    },
  ],

  rewards: [
    { id: "tv-1h", name: "1 hour TV", cost: 60, kind: "digital", minutes: 60, unifiGroup: "tv" },
    { id: "gaming-1h", name: "1 hour gaming", cost: 80, kind: "digital", minutes: 60, unifiGroup: "consoles" },
    { id: "pizza", name: "Pizza party", cost: 1500, kind: "physical" },
    { id: "car-1h", name: "1 hour of car time", cost: 300, kind: "physical", kidIds: ["older"] },
  ],

  compliment: { points: 150 },
  allowNegativeBalance: false,
  levelThresholds: [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000],
};
