// Household starter config, mirroring docs/CATALOG.md. Parents edit all of this in the app.
// Real names live only in the private database; this public file uses roles.
//   older   = the doer, Pinwheel phone, mows (seasonal), driver's-license track
//   younger = needs a push, iPhone, weed eats (seasonal)
// Daily rotation: on "day A" older does chickens while younger does the kitchen; day B swaps.
import type { Activity, Config } from "./types.ts";

const both = ["older", "younger"];
const dayAB = { kidIds: ["older", "younger"], period: "day" as const }; // chickens
const dayBA = { kidIds: ["younger", "older"], period: "day" as const }; // kitchen (opposite)
const SEASON = [4, 5, 6, 7, 8, 9, 10];

const activities: Activity[] = [
  // ---- Every day, each son ----
  { id: "make-bed", difficulty: 1, typicalMinutes: 3, name: "Make bed", kidIds: both, tier: "must", kind: "proof", points: 5, dailyCap: 1, requiresApproval: false },
  { id: "room-clean", difficulty: 2, typicalMinutes: 15, name: "Room clean", kidIds: both, tier: "must", kind: "proof", points: 15, dailyCap: 1, requiresApproval: false },
  { id: "homework", difficulty: 3, typicalMinutes: 45, name: "Homework done", kidIds: both, tier: "must", kind: "proof", points: 30, dailyCap: 1, requiresApproval: false },
  { id: "skincare", difficulty: 1, typicalMinutes: 5, name: "Skin care (AM / PM)", kidIds: both, tier: "growth", kind: "check", points: 5, dailyCap: 2, requiresApproval: false },
  // ---- Every day, taking turns ----
  { id: "eggs", difficulty: 1, typicalMinutes: 5, name: "Collect eggs", kidIds: both, rotation: dayAB, tier: "must", kind: "proof", points: 10, dailyCap: 1, requiresApproval: false },
  { id: "feed-water", difficulty: 2, typicalMinutes: 10, name: "Chicken food + water full", kidIds: both, rotation: dayAB, tier: "must", kind: "proof", points: 10, dailyCap: 1, requiresApproval: false },
  { id: "kitchen", difficulty: 3, typicalMinutes: 25, name: "Kitchen clean after dinner", kidIds: both, rotation: dayBA, tier: "must", kind: "proof", points: 25, dailyCap: 1, requiresApproval: false },
  { id: "dishwashers", difficulty: 2, typicalMinutes: 10, name: "Unload the dishwashers", kidIds: both, rotation: dayBA, tier: "must", kind: "proof", points: 15, dailyCap: 1, requiresApproval: false },
  // ---- A few times a week ----
  { id: "vacuum-kitchen", difficulty: 2, typicalMinutes: 15, name: "Vacuum + sweep kitchen", kidIds: both, weekdays: [2, 5], rotation: dayAB, tier: "must", kind: "proof", points: 20, dailyCap: 1, requiresApproval: false },
  // ---- Weekly ----
  { id: "trash", difficulty: 2, typicalMinutes: 10, name: "Trash can down to the road (Monday night)", kidIds: both, weekdays: [1], tier: "must", kind: "proof", points: 20, dailyCap: 1, requiresApproval: false },
  { id: "laundry", difficulty: 2, typicalMinutes: 30, name: "Wash your clothes", kidIds: both, tier: "must", kind: "proof", points: 40, requiresApproval: false },
  { id: "bedding", difficulty: 2, typicalMinutes: 25, name: "Wash your bedding", kidIds: both, tier: "must", kind: "proof", points: 30, requiresApproval: false },
  { id: "bathroom", difficulty: 4, typicalMinutes: 40, name: "Clean your bathroom", kidIds: both, tier: "must", kind: "proof", points: 60, requiresApproval: false },
  { id: "coop-clean", difficulty: 5, typicalMinutes: 45, name: "Clean the chicken coop", kidIds: both, tier: "must", kind: "proof", points: 80, requiresApproval: false },
  // ---- Seasonal ----
  { id: "mow", difficulty: 4, typicalMinutes: 300, name: "Mow the yard (~5 h)", kidIds: ["older"], activeMonths: SEASON, tier: "must", kind: "proof", points: 400, requiresApproval: false },
  { id: "weed-eat", difficulty: 4, typicalMinutes: 90, name: "Weed eating", kidIds: ["younger"], activeMonths: SEASON, tier: "must", kind: "proof", points: 150, requiresApproval: false },
  // ---- Growth ----
  { id: "reading", name: "Reading", kidIds: both, tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 10, maxMinutes: 60, requiresApproval: false },
  { id: "lifting", name: "Lift weights", kidIds: both, tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 20, maxMinutes: 60, requiresApproval: false },
  { id: "driving", name: "Supervised driving (log)", kidIds: ["older"], tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 15, maxMinutes: 120, requiresApproval: true },
];

export const sampleConfig: Config = {
  timezone: "America/Chicago",

  kids: [
    {
      id: "older",
      name: "Older son",
      // The doer: photo in = done, lighter gates.
      economy: { asksRequireApproval: false, missedAskPenalty: false },
    },
    {
      id: "younger",
      name: "Younger son",
      // Needs a push: must-dos pay more, easy stuff less, big chores need one tap.
      economy: {
        activityTuning: {
          "make-bed": { points: 3 },
          "room-clean": { points: 25 },
          eggs: { points: 15 },
          "feed-water": { points: 15 },
          kitchen: { points: 35 },
          dishwashers: { points: 20 },
          "vacuum-kitchen": { points: 30 },
          bathroom: { points: 90, requiresApproval: true },
          "coop-clean": { points: 120, requiresApproval: true },
          "weed-eat": { points: 200, requiresApproval: true },
        },
        rewardCosts: { "xbox-switch-desktop-1h": 100 },
        asksRequireApproval: true,
        missedAskPenalty: true,
      },
    },
  ],

  actors: [
    { id: "dad", name: "Dad", role: "parent", active: true },
    { id: "mom", name: "Mom", role: "parent", active: true },
    // Helpers: can take coins away (talking back, chore not done) or add them
    // (exceptional work, very helpful). Parents can undo anything they do.
    ...["brother", "sister-1", "sister-2", "sister-in-law"].map((id) => ({
      id,
      name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
      role: "caregiver" as const,
      relationship: "Family helper",
      active: true,
      can: ["penalize" as const, "bonus" as const],
      dailyLimits: { penalty: 50, bonus: 50 },
    })),
  ],

  activities,

  gates: [
    {
      id: "older-daily", name: "Daily must-dos", kidId: "older", period: "day",
      requiredActivityIds: ["make-bed", "room-clean", "homework", "eggs", "feed-water", "kitchen", "dishwashers", "vacuum-kitchen", "trash"],
      holdsTiers: ["easy"], blocksRedemption: true, onMiss: "release",
    },
    {
      id: "older-weekly", name: "Weekly must-dos", kidId: "older", period: "week",
      requiredActivityIds: ["laundry", "bedding", "bathroom", "coop-clean", "mow"],
      holdsTiers: ["easy"], blocksRedemption: true, onMiss: "forfeit",
    },
    {
      id: "younger-daily", name: "Daily must-dos", kidId: "younger", period: "day",
      requiredActivityIds: ["make-bed", "room-clean", "homework", "eggs", "feed-water", "kitchen", "dishwashers", "vacuum-kitchen", "trash"],
      includeAsks: true,
      holdsTiers: ["growth", "easy", "bonus"], blocksRedemption: true, onMiss: "forfeit",
    },
    {
      id: "younger-weekly", name: "Weekly must-dos", kidId: "younger", period: "week",
      requiredActivityIds: ["laundry", "bedding", "bathroom", "coop-clean", "weed-eat"],
      holdsTiers: ["easy"], blocksRedemption: true, onMiss: "forfeit",
    },
  ],

  rewards: [
    // Screen time: the router unlocks the device he picks.
    { id: "youtube-1h", name: "1 h YouTube on the Samsung TV", cost: 60, kind: "digital", minutes: 60, unifiGroups: ["tv-youtube"] },
    { id: "xbox-switch-desktop-1h", name: "1 h gaming (Xbox, Switch or desktop)", cost: 80, kind: "digital", minutes: 60, unifiGroups: ["xbox", "switch", "desktop"] },
    // Privileges
    { id: "stay-up", name: "Stay up 30 min late (weekend)", cost: 60, kind: "physical" },
    { id: "pick-dinner", name: "Pick dinner", cost: 100, kind: "physical" },
    { id: "friend-over", name: "Friend over", cost: 300, kind: "physical" },
    { id: "sleepover", name: "Sleepover", cost: 500, kind: "physical" },
    // Cooking (older)
    { id: "chef-night", name: "Chef night: plan + cook family dinner", cost: 150, kind: "physical", kidIds: ["older"] },
    { id: "cook-budget", name: "$20 ingredient / cookware budget", cost: 200, kind: "physical", kidIds: ["older"] },
    { id: "cooking-class", name: "Cooking class", cost: 2000, kind: "physical", kidIds: ["older"] },
    // Money (10 coins = $1)
    { id: "cash-5", name: "Cash out $5", cost: 50, kind: "cash", dollars: 5 },
    { id: "cash-10", name: "Cash out $10", cost: 100, kind: "cash", dollars: 10 },
    // Big goals
    { id: "pizza", name: "Pizza party", cost: 1500, kind: "physical" },
    { id: "car-1h", name: "1 h of car time", cost: 300, kind: "physical", kidIds: ["older"] },
  ],

  compliment: { points: 200 },
  allowNegativeBalance: false,
  // 1 coin per minute of normal work; harder work pays more per minute.
  payScale: { coinsPerMinute: 1, difficultyMultipliers: [0.5, 1, 1.25, 1.5, 2] },
  cashOutWeeklyMaxDollars: 20,
  levelThresholds: [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000],
};
