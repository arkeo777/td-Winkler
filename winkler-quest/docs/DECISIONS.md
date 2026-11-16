# Winkler Quest — Decisions to settle before building the apps

Each item has a suggested default. ✅ = decided.

## Decided
- ✅ Older son: doer, Pinwheel (Android), mows, driver's-license track, 15 on Dec 11
- ✅ Younger son: needs a push, iPhone 15 (Pro) Max, weed eats, 14 on Nov 18
- ✅ Chickens: daily chores alternate by day; coop cleaned weekly by both
- ✅ Separate economies; must-dos gate everything else; outside shout-outs pay big
- ✅ Parents + caregivers with granted permissions and daily caps; Mom's asks
- ✅ Network: UniFi Cloud Gateway Fiber at 192.168.1.1
- ✅ Bridge host: Mac mini M4 at home

## A. Infrastructure
1. **Backend:** Supabase cloud (default) vs. self-hosting on the Mac mini.
   Default: Supabase. Phones work anywhere without exposing your home network;
   the Mac mini only runs the bridge.
2. **Mac mini bridge:** runs as a background service (launchd), starts on boot,
   Mac set to never sleep and auto-restart after power loss.
3. **Repo:** new private repo `winkler-quest` (you create it; I move the code).

## B. Screen-time limits (even when earned)
4. **Daily max** on digital rewards. Default: 2 h school nights, 4 h weekends.
5. **Quiet hours** the bridge enforces no matter what. Default: devices locked
   10 pm–7 am, and 8 am–3:30 pm on school days.
6. **Banking cap** (stops hoarding 40 h for summer). Default: max 600 coins banked
   for digital rewards; real-world goals (pizza, car time) save separately.

## C. Coin values & prices (current placeholders)
7. Chores: eggs 10 / food+water 10 / coop 80 / mow 400 / weed eat 150
   (younger 200) / bathroom 60 / room 15 / bed 5 / homework 30 /
   reading 1/min / memory 1.5/min / lifting 1/min / skin care 5.
8. Rewards: TV 1 h 60 · gaming 1 h 80 (younger 100) · pizza party 1500 ·
   car time 1 h 300. Add others? (stay up late, friend over, choose dinner, cash out)
9. Penalty buttons. Default: −10 min, −30 min, −1 h (priced at that son's gaming rate), custom.
10. Shout-out value. Default: 150.

## D. Game layer
11. **Map theme.** Default: a quest map; the older son's path ends at "The Open Road"
    (license + car time), younger's at a goal you pick.
12. **Goals and prizes.** Defaults:
    - Hourly: 30-min focus block (reading/memory) → +10
    - Daily: all must-dos → +20 "perfect day"
    - Weekly: 5 of 7 perfect days + weekly chores → +100
    - Monthly: 3 of 4 perfect weeks → real prize (pick one)
    - Yearly: 10 of 12 perfect months → big prize
13. **Brothers.** Default: private scores (no head-to-head, since one's a doer), plus
    a **team goal**: both hit their week → family pizza night.

## E. Driver's-license track
14. **Which state?** (sets permit age, required practice hours, night hours.)
15. Default stages: permit → logged practice hours (parent-approved drives) →
    clean month → test passed → car time unlocked.

## F. Proof, approvals, notifications
16. Photo proof required: coop, mow, weed eat, bathroom; plus room and chickens for
    the younger son. Default: yes.
17. Approvals never auto-approve; unreviewed items nag parents after 12 h.
18. Kid reminders: "your chicken day" at 7 am, must-dos left at 6 pm.

## G. Devices & loopholes
19. **Which devices** go in which group (TVs, consoles, PCs, tablets)? Shared or per son?
20. **The boys' own phones are not router-blocked** (it would kill the app too).
    Phone apps/games are limited by Pinwheel (older) and Screen Time (younger).
21. **Hotspot loophole:** a console tethered to a phone's hotspot skips the router.
    Default: hotspot off on both kids' phones, locked (Pinwheel / Screen Time
    "Cellular Data Changes: Don't Allow").
22. **Private Wi-Fi address** off on all controlled devices so UniFi can recognize them.

## H. People
23. Caregivers and what each may do (examples: Grandma, big sister, sitter).
24. Does Mom get the same full parent access? Default: yes.

## I. Accounts (only you can create)
25. Supabase (free) · Apple Developer ($99/yr) · Google Play ($25; personal vs.
    organization: organization skips the 14-day/12-tester closed test).
26. Ask Pinwheel support: can the Caregiver Portal approve an app from a Google Play
    closed-testing track?
