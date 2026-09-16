# Peptide Beach

A single-file peptide **reconstitution calculator** and **dosing tracker** for
laboratory / research reference. No build step, no server, no dependencies —
open `index.html` in any browser and it works offline. All data stays in your
browser (`localStorage`); nothing is sent anywhere.

> **Research use only.** This tool performs arithmetic on values you enter. It
> is not medical advice, and the reference figures are commonly cited research
> parameters, not prescriptions. Verify every calculation independently.

## Features

- **Reconstitution calculator** — enter vial mass (mg/mcg), bacteriostatic
  water volume, and desired dose; get the exact **units to draw** on a U‑100
  insulin syringe, concentration (mg/mL), mcg per unit, injection volume, and
  doses per vial. A live syringe diagram shows the fill and warns when a dose
  exceeds the selected syringe capacity (0.3 / 0.5 / 1 mL).
- **Vial inventory** — track each reconstituted vial with its date,
  concentration, default dose, remaining amount (with a fill meter), and an age
  badge that flags aging (>21d) and past‑35‑day vials.
- **Dosing schedule + reminders** — build **protocols** per peptide: daily,
  every other day, specific weekdays, or every N days; multiple times per day;
  optional cycle **weeks on / off**. A **Today & upcoming agenda** shows what's
  due, flags overdue doses, and lets you **mark a dose taken** in one tap (which
  logs it and draws down the vial). Get **browser notifications** when a dose is
  due while the tab is open, plus a per-protocol **Add to Google Calendar** link
  for real alarms when the app is closed. A badge on the Schedule tab counts
  overdue doses.
- **Dose log** — record each dose (date/time, peptide, dose, units, injection
  site, notes). Logging a dose can automatically draw down the linked vial's
  remaining amount.
- **Reference library** — commonly cited parameters for ~16 research peptides
  (BPC‑157, TB‑500, Ipamorelin, CJC‑1295, Semaglutide, Tirzepatide,
  Retatrutide, GHK‑Cu, and more). One tap loads a peptide into the calculator
  or inventory.
- **Backup & restore** — copy/paste JSON to back up or move your data. Includes
  light/dark themes.

## Usage

Open `index.html` in a browser, or host the file anywhere static.

## Tech

Plain HTML/CSS/JS in one file. IBM Plex Sans / Mono via Google Fonts. State
persisted to `localStorage` under the key `peptideBench.v1`.
