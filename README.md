# Social Media Dashboard

A single-file **social media analytics dashboard**. No build step, no server,
no dependencies, no API keys — open `index.html` in any browser and it works
offline. All data stays in your browser (`localStorage`); nothing is uploaded
anywhere.

Track your presence across platforms in one place: total followers and growth,
engagement and reach, per-platform breakdowns, and post-by-post performance.
The app ships with realistic sample data so you can explore it immediately —
reset or edit it to make it your own.

## Features

- **Overview** — headline KPIs (total followers with period-over-period change,
  average engagement rate, total engagement and reach, posts published) plus an
  interactive **follower-growth chart** with a hover/touch crosshair and
  tooltip.
- **By platform** — per-platform cards (Instagram, X, TikTok, YouTube,
  LinkedIn, Facebook) showing follower count, period growth, a sparkline, and
  progress toward an optional goal, alongside an audience-share donut.
- **Content** — a sortable table of published posts with reach, likes,
  comments, shares, and a color-coded **engagement rate**. Filter by platform,
  and log, edit, or delete posts. Summary tiles roll up reach and average
  engagement for the current view.
- **Scheduled posts** — flag posts as scheduled to see upcoming content in a
  strip on the Overview (excluded from published analytics).
- **Accounts** — manage connected platforms and follower counts; editing a
  follower count records a snapshot that feeds the growth chart.
- **Time ranges** — switch the whole dashboard between 7 / 30 / 90 days and all
  time.
- **Private & offline** — installable as a PWA (add to home screen), fully
  offline via a service worker, with **light / dark / auto** themes and
  **JSON export / import** for backup and restore.

## Usage

Open `index.html` in a browser, or host the folder anywhere static. Install it
from your browser's menu ("Add to Home Screen" / "Install") for a full-screen,
offline app.

Everything is editable: use the **Log post** button to add performance data,
the **Accounts** tab to add platforms and update follower counts, and
**Settings** to rename the profile, switch themes, or export/import your data.

## Tech

Plain HTML/CSS/JS in one file — no frameworks, no external chart library
(charts are hand-drawn inline SVG). State is persisted to `localStorage` under
the key `smdash.v1`. Icons are generated PNGs under `icons/`.
