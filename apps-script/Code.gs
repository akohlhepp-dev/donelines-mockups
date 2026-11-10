/**
 * DONELines mockup feedback — Google Sheets backend (free).
 *
 * Setup (about 5 minutes; full steps in README.md):
 *  1. Create a Google Sheet, then Extensions > Apps Script.
 *  2. Replace the editor contents with this file and save.
 *  3. Set TOKEN below to the same random string as "token" in feedback.config.json.
 *  4. Deploy > New deployment > Web app.
 *     Execute as: Me.  Who has access: Anyone.
 *  5. Copy the web app URL into "endpoint" in feedback.config.json and rebuild.
 *
 * Comments land in a "Comments" tab. You can resolve rows by setting the
 * "resolved" column to TRUE; the pins pick that up on the next refresh.
 */

// Must match feedback.config.json "token". Set it in the Apps Script editor only;
// this copy lives in the public repo, so leave it as CHANGE-ME here.
const TOKEN = 'CHANGE-ME';
const NOTIFY_EMAIL = '';            // optional: an address to email on each new comment
const SHEET_NAME = 'Comments';
const COLUMNS = ['id', 'created', 'page', 'author', 'sentiment', 'text', 'label',
                 'resolved', 'selector', 'rx', 'ry', 'docXf', 'docY', 'viewportW'];
const MAX_TEXT = 5000;

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.token !== TOKEN) return json_({ ok: false, error: 'Not allowed' });
  if (p.action !== 'list') return json_({ ok: false, error: 'Unknown action' });
  const rows = readAll_().filter(function (c) { return !p.page || c.page === p.page; });
  return json_({ ok: true, comments: rows });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad JSON' }); }
  if (!body || body.token !== TOKEN) return json_({ ok: false, error: 'Not allowed' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_();
    if (body.action === 'add') {
      const c = body.comment || {};
      if (!c.id || !c.text) return json_({ ok: false, error: 'Missing fields' });
      c.text = String(c.text).slice(0, MAX_TEXT);
      c.resolved = false;
      // Prefix "'" so Sheets never treats user text as a formula.
      sheet.appendRow(COLUMNS.map(function (k) {
        const v = c[k] === undefined ? '' : c[k];
        return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
      }));
      if (NOTIFY_EMAIL) {
        MailApp.sendEmail(NOTIFY_EMAIL, 'New mockup comment on ' + c.page,
          c.author + ' (' + c.sentiment + ') on "' + c.label + '":\n\n' + c.text);
      }
      return json_({ ok: true });
    }
    if (body.action === 'resolve') {
      const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
      const col = COLUMNS.indexOf('resolved') + 1;
      for (let i = 0; i < ids.length; i++) {
        if (ids[i][0] === body.id) {
          sheet.getRange(i + 2, col).setValue(!!body.resolved);
          return json_({ ok: true });
        }
      }
      return json_({ ok: false, error: 'Not found' });
    }
    return json_({ ok: false, error: 'Unknown action' });
  } finally {
    lock.releaseLock();
  }
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(COLUMNS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
  }
  return sh;
}

function readAll_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, COLUMNS.length).getValues();
  return values.filter(function (r) { return r[0]; }).map(function (r) {
    const o = {};
    COLUMNS.forEach(function (k, i) { o[k] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
    o.resolved = o.resolved === true || String(o.resolved).toUpperCase() === 'TRUE';
    return o;
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
