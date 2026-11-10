# Conventions: landing pages, QR codes, and the website tab

The portal's **Conventions** tab sets up each trade show. For each one you get:

1. A **landing page** (`convention.html?c=<show>`) where attendees enter their
   name and choose **free samples**, the **newsletter**, or both.
2. A **QR code** that links to that page. You can print it as a booth sign, or
   download it as SVG to 3D-print or send to a sign shop.
3. Optionally, a **Conventions tab on the marketing website**. It shows up by
   itself around the show dates and disappears afterward.

## Workflow for each show (the "task")

Each show has a 6-step prep checklist in the portal (click the **Prep** meter):

| # | Step | Where |
|---|------|-------|
| 1 | Dates, venue & booth confirmed with Pat | Conventions → Edit |
| 2 | `conventions.json` published (landing page live) | Conventions → Export conventions.json, then upload |
| 3 | QR code printed or 3D-printed sign made | Conventions → QR |
| 4 | Scanned the QR on a phone and sent a test sign-up | your phone |
| 5 | Website tab checked (shows on the dates, or left hidden) | marketing site |
| 6 | After the show: leads exported, samples & welcome email sent | sign-up sheet / kiosk CSV |

### When Pat sends the 2027 list

Go to **Conventions → Paste Pat's list**. You can paste rows from a spreadsheet,
a CSV, or one show per line. A header row such as `Name, City, Start, End, Booth, Rep`
helps, but you don't need one. These date formats all work: `2027-03-04`,
`3/4/2027`, `Mar 4, 2027`, `March 4–6, 2027`, `3/4-3/6/2027`. Pasting the same
show again updates it instead of adding a duplicate.

## One-time setup

### 1. Host the files

Upload `convention.html`, `conventions.json`, `convention-tab.js`, and `icons/`
to any static host. GitHub Pages works, and so does a folder on the marketing
site. In the portal, set **Landing page URL** to the full address of
`convention.html`, for example `https://example.com/conventions/convention.html`.

> The QR code contains only `…/convention.html?c=<show-slug>`. The slug is fixed
> when the show is created and stays the same after edits, so a printed or
> 3D-printed sign keeps working. If you move the hosting, the signs break, so
> choose the URL before printing.

Each time you add or change shows, click **Export conventions.json** and upload
the new file to replace the old one.

### 2. Choose where sign-ups go

Attendees use their own phones, so their sign-ups have to be posted somewhere.
Paste an endpoint into **Sign-up destination**. Until you do, the landing page
asks people to stop by the booth.

The landing page sends a standard form POST with these fields:
`firstName, lastName, email, phone, company, samples, newsletter, code,
convention, conventionName, rep, booth, source, submittedAt, id`.

**Google Sheet (free, recommended):**

1. Create a Google Sheet. Open **Extensions → Apps Script** and paste in:

   ```js
   const FIELDS = ["submittedAt","conventionName","firstName","lastName","email","phone",
     "company","samples","newsletter","code","rep","booth","source","convention","id"];
   function doPost(e) {
     const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
     if (sheet.getLastRow() === 0) sheet.appendRow(FIELDS);
     sheet.appendRow(FIELDS.map(k => (e.parameter[k] || "")));
     return ContentService.createTextOutput("ok");
   }
   ```

2. Click **Deploy → New deployment → Web app**. Set **Execute as: Me** and
   **Who has access: Anyone**.
3. Paste the `…/exec` URL into **Sign-up destination**, then export and upload
   `conventions.json` again.

Formspree, Zapier/Make "catch hook" webhooks, and similar form backends also
work: paste their POST URL.

### 3. Booth kiosk (optional)

On the QR dialog, copy the **Booth kiosk link** and open it on the booth tablet.
Every sign-up is also saved on that tablet, so nothing is lost if the venue
Wi-Fi drops. The form resets 45 seconds after each sign-up. When the show ends,
open the portal on the **same tablet and browser**, go to Conventions →
**Kiosk sign-ups on this device**, then click **Download CSV** and **Clear**.

### 4. Add the Conventions tab to the marketing website

Paste this line into the site template just before `</body>`:

```html
<script src="https://YOUR-HOST/convention-tab.js" data-nav="#main-menu" defer></script>
```

- `data-nav` is a CSS selector for the site's menu. If it's a `<ul>`, the tab is
  added as a new `<li>`. If you leave it out, a small floating "Meet us at …"
  button appears instead.
- `data-label` changes the tab text. The default is `Conventions`.
- `data-feed` points to a `conventions.json` somewhere else. The default is the
  file next to the script.

The tab appears only while a show set to **Show on website** is between
*start − lead days* and *end + tail days* (default 7 days before through 3 days
after). The rest of the time the script adds nothing, so the tab is hidden.
Shows set to **Hidden — QR code only** never appear on the site.
If one show is live, the tab links straight to its landing page. If several are,
it links to `convention.html`, which lists every upcoming show.

Style the tab with `.pb-conv-tab` and the floating button with `.pb-conv-pill`.

## Privacy notes

- Conventions and kiosk sign-ups are stored in the portal's browser storage
  separately from dosing data, and the password lock does **not** encrypt them.
  Export and clear kiosk sign-ups after each show.
- The landing page has `noindex` and a spam honeypot field. The consent line
  under the form tells people they'll only be contacted about what they checked.
