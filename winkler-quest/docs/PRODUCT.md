# Winkler Quest as a product (App Store / Google Play)

Goal: build it once so our family is simply the first household, and any family
can sign up, add their kids, and pick or create their own chores and rewards.

## What changes vs. a family-only app
| Area | Family-only | Sellable |
|---|---|---|
| Data | one household | many households, each walled off (Supabase row-level security on every table) |
| Setup | config written by us | **onboarding** in the app: kids, chores, rewards, people |
| Chores | our list | **library** of templates by age and pack + custom chores |
| Router control | our UniFi | **optional add-on**; works fine without any router |
| Faith | built in | **optional Faith pack** (scripture memory) the family turns on |
| Business | none | company, privacy policy, support, subscriptions |

The rules engine already works per household. `core/src/templates.ts` turns a new
family's onboarding choices into their household setup.

## Onboarding (parent, ~3 minutes)
1. **Create account**: Sign in with Apple / Google / email. (Apple requires Sign in
   with Apple if other social logins are offered.)
2. **Name your household**, timezone.
3. **Add kids**: first name, age, avatar, and "doer" or "needs a push".
4. **Pick chores**: suggested by age from packs (Everyday, Kitchen, Yard, Animals, Pets,
   Growth, Faith); assign to kids; "take turns" toggle; add custom chores. Values are
   suggested from hardness × time and editable on the Settings page.
5. **Pick rewards**: screen time, privileges, cash, big goals; set prices.
6. **Invite people**: co-parent (full access) and helpers (grandparents, older siblings)
   with the permissions you choose, via an invite link.
7. **Pair kids' phones**: the kid app shows a code / QR; parent scans to link it.
   Kids never create accounts or passwords.
8. Optional: **Screen-time control** add-on (UniFi now; more routers later).

## Child privacy and store rules (must-haves)
- **COPPA (US):** kids under 13 → verifiable parental consent before collecting their
  data; collect the minimum (first name, age, avatar; no email/phone for kids); no ads,
  no third-party tracking. Kid photos (chore proof) auto-delete after 30 days by default.
- **Apple:** in-app account deletion; privacy "nutrition label"; if listed in the Kids
  category, stricter rules (parental gate, no third-party analytics/ads). Plan: list the
  app under Lifestyle as a parent app with a paired kid mode.
- **Google Play Families policy** for the kid side; Data safety form.
- **Privacy policy + terms** published on a website; support email.
- **Data export / delete** for parents.

## Router add-on for other families
- Our home bridge becomes a downloadable **"Home Hub"** (Mac / Windows / Docker / Raspberry Pi)
  that pairs with the household using a code.
- Starts with UniFi; later candidates: other router brands with APIs.
- Without the add-on, screen time works on the honor system (timer + parent confirm).

## Making money
- **Free:** 1 parent, up to 2 kids, core chores and rewards.
- **Family plan (subscription):** unlimited kids and helpers, photo proof, Heart track,
  Faith pack, router add-on, change dashboard. Roughly $4.99/month or $39.99/year
  (to test). App-store subscriptions must go through Apple / Google in-app purchase
  (e.g. via RevenueCat).

## Business setup
- Form an **LLC**. It owns the app, and it gets a free **D-U-N-S number**, which lets
  the Google Play account be an *organization* (skips the 14-day / 12-tester rule) and
  the Apple account be in the company's name.
- **Name:** "Winkler Quest" is our family's name; the store name may be different
  (check trademarks and App Store availability before branding).
- Website + support email + privacy policy.

## Build order (unchanged, with product in mind from day one)
1. Core loop for our family, built multi-household from the start
   (household id on everything, row-level security, onboarding screens).
2. Router add-on (our UniFi first).
3. Game layer, Heart track, Faith pack.
4. Store readiness: privacy, account deletion, subscriptions, listing, website.
5. Beta with a few friend families → public launch.
