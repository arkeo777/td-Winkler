// Starter config — placeholder names and values. Parents edit all of this in the app.
import type { Config } from "./types.ts";

export const sampleConfig: Config = {
  timezone: "America/Chicago",
  kids: [
    { id: "older", name: "Older son" },
    { id: "younger", name: "Younger son" },
  ],
  activities: [
    // Must-dos: pay the most, and unlock everything else.
    { id: "mow", name: "Mow the lawn", kidIds: ["older"], tier: "must", kind: "proof", points: 120, requiresApproval: true },
    { id: "homework", name: "Homework done", kidIds: ["older", "younger"], tier: "must", kind: "proof", points: 30, requiresApproval: true, dailyCap: 1 },
    { id: "dishes", name: "Dishes / kitchen", kidIds: ["older", "younger"], tier: "must", kind: "check", points: 25, requiresApproval: false, dailyCap: 1 },
    // Growth
    { id: "reading", name: "Reading", kidIds: ["older", "younger"], tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 10, maxMinutes: 60, requiresApproval: false },
    { id: "memory", name: "Memory work", kidIds: ["older", "younger"], tier: "growth", kind: "timed", pointsPerMinute: 1.5, minMinutes: 5, maxMinutes: 30, requiresApproval: false },
    { id: "lifting", name: "Lift weights", kidIds: ["older", "younger"], tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 20, maxMinutes: 60, requiresApproval: false },
    { id: "skincare", name: "Skin care routine (AM/PM)", kidIds: ["older", "younger"], tier: "growth", kind: "check", points: 5, requiresApproval: false, dailyCap: 2 },
    { id: "driving-practice", name: "Supervised driving practice", kidIds: ["older"], tier: "growth", kind: "timed", pointsPerMinute: 1, minMinutes: 15, maxMinutes: 90, requiresApproval: true },
    // Easy
    { id: "make-bed", name: "Make bed", kidIds: ["older", "younger"], tier: "easy", kind: "check", points: 5, requiresApproval: false, dailyCap: 1 },
  ],
  gates: [
    {
      id: "older-daily", name: "Daily must-dos", kidId: "older", period: "day",
      requiredActivityIds: ["homework", "dishes"],
      holdsTiers: ["growth", "easy", "bonus"], blocksRedemption: true, onMiss: "forfeit",
    },
    {
      id: "older-weekly", name: "Weekly must-dos", kidId: "older", period: "week",
      requiredActivityIds: ["mow"],
      holdsTiers: ["easy"], blocksRedemption: true, onMiss: "forfeit",
    },
    {
      id: "younger-daily", name: "Daily must-dos", kidId: "younger", period: "day",
      requiredActivityIds: ["homework", "dishes"],
      holdsTiers: ["growth", "easy", "bonus"], blocksRedemption: true, onMiss: "forfeit",
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
