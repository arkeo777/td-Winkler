# Winkler Quest — Product Spec (draft v0.3)

A family quest app: the boys earn coins for chores, school, reading, memory work,
skin care, lifting and more, then spend them on TV, gaming, car time and real-world
prizes. Parents see everything, approve work, and can add or take away coins.
Digital rewards switch devices on/off automatically through the UniFi router.

## 1. Pieces

| Piece | What it does | Tech |
|---|---|---|
| Kid app | Quests, timers, photo proof, coin balance, map, reward shop | Expo / React Native (iPhone + Android/Pinwheel) |
| Parent app | Same app, parent login: approvals, dashboard, penalties, config | Same codebase |
| Backend | Single source of truth: ledger, rules engine, auth, photos | Supabase (Postgres + RLS + Edge Functions) |
| Home bridge | Turns UniFi device access on/off when time is redeemed / expires | Small Node service on a Pi or Docker; outbound-only connection |

The rules engine (`core/`) is pure TypeScript and runs server-side. Phones display
results; they never decide balances.

## 2. Core rules

### Coins, XP, levels
- **Coins** are the spendable currency. **XP** is lifetime coins earned — it never goes
  down from spending or penalties and drives the game map/levels.
- Activities pay a fixed amount (check / photo-proof) or per minute (timed), with
  optional min/max minutes and a daily cap.

### Household chores (starter list)
- **Chickens, daily:** collect eggs; food and water full (photo proof).
- **Chickens, weekly:** clean the coop.
- **Yard, weekly:** mow (about 5 hours in one sitting, pays the most), weed eating.
- **House:** clean own bathroom (weekly), room clean (daily), make bed (daily), homework.
- **Growth:** reading, memory work, lifting, skin care, supervised driving (older son).
- **Mom's asks:** whatever comes up during the day (see below).

### Tiers
`must` (mowing, coop, homework) · `growth` (reading, memory, lifting, skin care,
driving practice) · `easy` (make bed) · `bonus`. **Must-dos pay the most.**

### Gates — "you have to do this to unlock the rest"
The answer to "they do the fun stuff and skip the mowing":
- Each kid has gates (daily and/or weekly), each listing required must-dos.
- Until a gate is met for the current period:
  - coins from the tiers it holds are **HELD** — the kid sees them but can't spend them;
  - if `blocksRedemption`, the **reward shop is locked**, with the reason shown
    ("Weekly must-dos: still need Mow the lawn").
- When the must-dos get done (and approved, if required), held coins release.
- If the period ends with the gate unmet, held coins are **forfeited** (or released,
  per gate setting).
- A must-do always pays for itself — doing the dishes is never held because
  homework isn't done yet.
- Pending (unapproved) must-dos don't unlock anything — a parent has to approve.

### Outside shout-outs (unsolicited compliments)
- When an adult **outside the family** (teacher, coach, neighbor, employer, another
  parent) compliments a boy without being asked, he earns a big payout (default 150 coins,
  worth more than most chores).
- A parent can log it directly (counts right away), or the kid can submit it
  (who, relationship, what they said), and a parent verifies it before it pays.
- Shout-outs are **never held by gates** — character pays immediately.
- It must be unsolicited. Fishing for compliments doesn't count; the parent decides.
- Later idea: a "shout-out" QR card the kid can't fill in, so a coach can send a
  note straight to the parent app.

### Separate reward system per son
One son is a doer, one needs a push, so each son has his own economy:
- his own pay rate per activity (e.g. the coop pays son2 120, son1 80),
- his own reward prices (e.g. gaming costs son2 100, son1 80),
- his own gates and strictness (which chores need a photo check, whether missed
  asks cost coins, whether reading is held until chores are done),
- his own compliment value and level curve.

Suggested starting point (all editable):

| | Doer | Needs a push |
|---|---|---|
| Must-dos pay | standard | ~50% more |
| Easy stuff pays | standard | less |
| Daily gate holds | easy only | everything (reading, lifting, easy) |
| Mom's asks | trusted, no penalty | photo/confirm, part of the daily gate, missed = lose its value |
| Missed day | held coins released | held coins forfeited |

### Parents and caregivers
- **Parents** (Mom, Dad): can do everything, including undoing any entry.
- **Caregivers** (older sibling, grandparent, guardian, sitter): a parent adds them and
  picks exactly what they can do: approve chores, hand out asks, log compliments,
  give bonuses, take away coins. Optionally limited to certain kids, with daily caps
  (e.g. big sister can take away at most 15 coins a day).
- Every action shows who did it. Parents can undo a caregiver's penalty or bonus.
- Caregivers can be switched off (e.g. a sitter only on weekends) without deleting history.
- Anything attempted without permission is ignored and shown to parents.

### Mom's asks (chores handed out during the day)
- Any adult with permission can send a son a one-off ask from their phone:
  "Unload the dishwasher before dinner — 20 coins".
- The son marks it done; the adult confirms (per son's settings).
- Asks can be part of the daily gate (the shop stays locked until they're done)
  and, for the son who needs a push, missing the due time costs the ask's value.

### Approvals, penalties, bonuses
- Any activity can require parent approval (photo proof is recommended for big chores).
- Parent can take away coins (−10 min, −1 hr worth, custom) with a reason, or give
  bonuses. Both show up in the kid's history with a timestamp.
- Balance floor at 0 by default (configurable).

### Rewards
- **Digital** (TV, gaming): redeeming starts a countdown; the home bridge unblocks the
  device group in UniFi and re-blocks it when time runs out.
- **Physical** (pizza party, cash, outing): parent fulfils it and marks it as delivered.
- **Car time**: older son only; unlocked through the driver's-license track.

## 3. Game layer (Phase 3)
- Board map: the kid advances along a path by XP; milestones every level.
- Goals at every scale: hourly (30 min focus block), daily (all must-dos),
  weekly (5/7 perfect days + weekly chores), monthly, yearly.
- Streaks pay automatic bonus coins plus parent-defined prizes (pizza party, etc.).
- **Driver's-license track** for the older son: permit → logged practice hours
  (supervised driving activity, parent-approved) → clean-record month → test passed →
  car time unlocked as a reward.
- Separate profiles and maps per son; optional shared leaderboard.

## 4. Anti-cheat
- All balances/timers computed server-side from an append-only ledger; nothing editable
  from a kid device. Server stamps every time — the phone clock is ignored.
- Kid accounts can't reach parent screens; parent actions need PIN or Face ID.
- Photo proof + parent approval for anything worth real time.
- Full audit log visible to parents, with who did what.
- Redemptions record the price paid, so price changes never rewrite history.
  Config changes are versioned the same way in the backend.
- Device level: Pinwheel Caregiver Portal / iOS Screen Time to prevent uninstalling.
  UniFi: device matching with private-MAC turned off on the boys' devices.

## 5. Platform constraints
- **Pinwheel** only installs parent-approved apps from Google Play, so the Android build
  ships to Play (Google dev account $25 one time). iPhone via App Store/TestFlight
  (Apple dev account $99/yr).
- **UniFi** controls network access per device / device group (consoles, TV) and
  app-category traffic rules. It can't unlock a single app on a phone — that's Pinwheel /
  Screen Time territory (later phase).

## 6. Phases
1. **Core loop** — rules engine ✅ (started), Supabase schema + auth, kid/parent apps:
   quests, timers, approvals, coins, gates, shout-outs, penalties, shop.
2. **UniFi bridge** — redeem → unblock → countdown → re-block.
3. **Game layer** — map, levels, streaks, multi-scale goals, prizes.
4. **Driver's-license track** + optional phone-level app limits.

## 7. Open questions
1. Ages, and which son has which phone (iPhone / Pinwheel)?
2. Real activity list and values for each son.
3. Reward list and prices; which are digital vs. physical.
4. Approve everything, or auto-count small habits?
5. UniFi gateway model; is there a Pi/home server that can stay on?
6. OK with Apple/Google developer accounts?
7. Who does the chickens, mowing and weed eating, and is it the same every week or rotated?
8. Which son is the doer and which needs a push?
9. Which caregivers, and what each may do (and their daily limits)?
10. Shout-out value (default 150) and whether held coins should be forfeited or just
   delayed when must-dos are missed.
