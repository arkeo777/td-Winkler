/**
 * COREy HCM — Mitchell's Fish Market $100 Drawing
 * Google Apps Script backend: receives form entries and appends them
 * to the bound Google Sheet (your live online spreadsheet).
 *
 * SETUP (one time, ~3 minutes):
 *   1. Create a new Google Sheet (sheets.new). Name it e.g. "Clam Bake Drawing".
 *   2. Extensions ▸ Apps Script. Delete any starter code.
 *   3. Paste this entire file in and click Save.
 *   4. Deploy ▸ New deployment ▸ type "Web app".
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      Click Deploy, authorize when prompted, and COPY the Web app URL.
 *   5. Paste that URL into index.html (the ENDPOINT constant) and re-publish/push.
 *
 * Entries land as rows: Timestamp | Name | Email | Phone
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(20000); // avoid two simultaneous entries clobbering a row
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // Add a header row the first time.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Name', 'Email', 'Phone']);
    }

    var p = (e && e.parameter) ? e.parameter : {};
    sheet.appendRow([
      p.ts || new Date().toISOString(),
      p.name || '',
      p.email || '',
      p.phone || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// Lets you open the Web app URL in a browser to confirm it's live.
function doGet() {
  return ContentService.createTextOutput('COREy HCM drawing endpoint is live.');
}
