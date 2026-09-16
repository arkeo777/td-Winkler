# COREy HCM — Mitchell's Fish Market $100 Drawing

A QR-scannable entry form for a free drawing to win a **$100 gift card to
Mitchell's Fish Market**. Guests scan a QR code, fill out name / email / phone
on their phone, and each entry lands in a Google Sheet you can open and export
to Excel anytime. Works on any phone, on Wi-Fi or cell service — because it's
hosted on the public web, not on your local network.

_The artwork is original. "Mitchell's Fish Market" is named only to describe
the prize; this drawing is not affiliated with or endorsed by them._

---

## What's here

| File | What it is |
|------|-----------|
| `index.html` | The entry form guests see. Hosted free on GitHub Pages. |
| `apps-script.gs` | Google Apps Script that saves entries to your Google Sheet. |

## Setup (about 5 minutes, all free)

### 1. Make the spreadsheet + backend
1. Go to **sheets.new** to create a Google Sheet (name it whatever you like).
2. **Extensions ▸ Apps Script**, delete the starter code, paste in all of
   `apps-script.gs`, and **Save**.
3. **Deploy ▸ New deployment ▸ Web app**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   - **Deploy**, authorize when asked, then **copy the Web app URL**.

### 2. Wire the form to it
- Open `index.html`, find the `ENDPOINT` line near the bottom, and paste your
  Web app URL between the quotes. Save.

### 3. Put the form online (GitHub Pages — free)
- In this repo on GitHub: **Settings ▸ Pages**.
- Set **Source** to this branch, folder **/ (root)**, and Save.
- After a minute your form is live at:
  `https://arkeo777.github.io/td-Winkler/`

### 4. Make the QR code
- Point any free QR generator at your GitHub Pages URL, or ask me and I'll
  generate a printable QR PNG for you once the URL is confirmed.

## Where your entries go
Every submission appends a row to your Google Sheet:

> `Timestamp | Name | Email | Phone`

Open the sheet anytime to see entries live, or **File ▸ Download ▸ Microsoft
Excel (.xlsx)** to get an Excel file.
