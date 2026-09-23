/**
 * Alan Alda Center program board — shared backend
 *
 * Stores the board in a Google Sheet. Files uploaded through the board go to
 * a Drive folder beside that sheet. Tasks can also hold links to files that
 * live anywhere else.
 *
 * SETUP
 *  1. Create a Google Sheet. Name it whatever you like.
 *  2. Extensions > Apps Script. Delete the starter code, paste this in, save.
 *  3. Change TOKEN below to any random string. Use the same string for
 *     SHEET_TOKEN in index.html.
 *  4. Deploy > New deployment > type "Web app".
 *       Execute as:      Me
 *       Who has access:  Anyone
 *     Deploy, then authorize. It asks for Drive access because of uploads;
 *     that is expected.
 *  5. Copy the Web app URL, the one ending in /exec, into SHEET_URL in
 *     index.html.
 *
 * After editing this file, run Deploy > Manage deployments and publish a new
 * version, or the live URL keeps serving the old code.
 *
 * The sheet gets two tabs. "_data" holds the board and is hidden. "Tasks" is
 * a plain readable mirror rewritten on every save. Editing "Tasks" does
 * nothing; the board is the source of truth.
 *
 */

var TOKEN       = 'change-this-shared-token';
var DATA_SHEET  = '_data';
var VIEW_SHEET  = 'Tasks';
var FILE_FOLDER = 'Program board files';
var CHUNK       = 40000;   // a sheet cell holds 50k characters

/**
 * ATTACHMENT SHARING, applied to every uploaded file.
 *   'link'   anyone holding the file link can view it, no sign-in needed.
 *            Everyone on the board can open attachments. Default, because
 *            the board has no real accounts behind it.
 *   'domain' only people signed in to your Google Workspace domain can view.
 *            Safer, but anyone outside it hits an access request screen.
 *   'none'   no sharing applied. Only the script owner can open files.
 */
var ATTACHMENT_SHARING = 'link';

/* ------------------------------------------------------------------ */

function doGet() {
  return ContentService
    .createTextOutput('Program board endpoint is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) {}

  if (req.token !== TOKEN) return json({ ok: false, error: 'Bad token' });

  if (req.action === 'load')       return json(loadBoard());
  if (req.action === 'save')       return json(saveBoard(req.board, req.rev, req.force));
  if (req.action === 'upload')     return json(uploadFile(req.name, req.mime, req.data));
  if (req.action === 'deletefile') return json(deleteFile(req.id));

  return json({ ok: false, error: 'Unknown action' });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------- board storage ----------------------------- */

function dataSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DATA_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DATA_SHEET);
    if (ss.getSheets().length > 1) sh.hideSheet();
  }
  return sh;
}

function loadBoard() {
  var sh = dataSheet();
  var rows = sh.getDataRange().getValues();
  var rev = 0;
  var parts = [];

  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'rev')   rev = Number(rows[i][1]) || 0;
    // chunks are written with a leading # so the sheet never reads them as a
    // formula. Strip it back off here.
    if (rows[i][0] === 'chunk') parts.push(String(rows[i][1]).slice(1));
  }

  var raw = parts.join('');
  var board = null;
  if (raw) {
    try { board = JSON.parse(raw); } catch (err) { board = null; }
  }
  return { ok: true, rev: rev, board: board };
}

function saveBoard(board, rev, force) {
  if (!board || !board.tasks || !board.buckets) {
    return { ok: false, error: 'Board data was missing or malformed' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return { ok: false, error: 'The sheet was busy. Try again.' };
  }

  try {
    var cur = loadBoard();

    // Somebody saved between this client's last read and this write.
    if (!force && Number(rev) !== cur.rev) {
      return { ok: false, conflict: true, rev: cur.rev, board: cur.board };
    }

    var raw = JSON.stringify(board);
    var out = [
      ['rev', cur.rev + 1],
      ['saved', new Date().toISOString()]
    ];
    for (var i = 0; i < raw.length; i += CHUNK) {
      out.push(['chunk', '#' + raw.substr(i, CHUNK)]);
    }

    var sh = dataSheet();
    sh.clear();
    sh.getRange(1, 1, out.length, 2).setValues(out);

    writeReadableTab(board);

    return { ok: true, rev: cur.rev + 1 };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------- attachments ------------------------------- */

function attachmentFolder() {
  // Keep files beside the spreadsheet rather than loose in My Drive.
  var parent;
  try {
    var ssFile  = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
    var parents = ssFile.getParents();
    parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  } catch (err) {
    parent = DriveApp.getRootFolder();
  }
  var existing = parent.getFoldersByName(FILE_FOLDER);
  return existing.hasNext() ? existing.next() : parent.createFolder(FILE_FOLDER);
}

function uploadFile(name, mime, data) {
  if (!data) return { ok: false, error: 'No file data arrived' };
  try {
    var bytes = Utilities.base64Decode(data);
    var blob  = Utilities.newBlob(bytes, mime || 'application/octet-stream', name || 'attachment');
    var file  = attachmentFolder().createFile(blob);

    if (ATTACHMENT_SHARING === 'link') {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } else if (ATTACHMENT_SHARING === 'domain') {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    }

    return { ok: true, id: file.getId(), name: file.getName(), size: file.getSize(),
             mime: file.getMimeType(), url: file.getUrl() };
  } catch (err) {
    return { ok: false, error: 'Upload failed: ' + err.message };
  }
}

function deleteFile(id) {
  if (!id) return { ok: false, error: 'No file id' };
  try {
    DriveApp.getFileById(id).setTrashed(true);
    return { ok: true };
  } catch (err) {
    // Already gone, or not ours to remove. The board drops the reference
    // either way, so this is not worth failing over.
    return { ok: true, note: err.message };
  }
}

/* ---------------------- readable mirror --------------------------- */

function writeReadableTab(board) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(VIEW_SHEET);
  if (!sh) sh = ss.insertSheet(VIEW_SHEET);
  sh.clear();

  var bucket = {}, person = {}, tag = {};
  (board.buckets || []).forEach(function (b) { bucket[b.id] = b.name; });
  (board.members || []).forEach(function (m) { person[m.id] = m.name; });
  (board.labels  || []).forEach(function (l) { tag[l.id]    = l.name; });

  var progressName = {
    notstarted: 'Not started',
    inprogress: 'In progress',
    completed:  'Completed'
  };

  var head = ['Bucket', 'Task', 'Progress', 'Priority', 'Due', 'Assigned to',
              'Labels', 'Checklist', 'Links', 'Files', 'Notes'];

  var rows = (board.tasks || []).map(function (t) {
    return [
      bucket[t.bucket] || '',
      t.title || '',
      progressName[t.progress] || '',
      t.priority || '',
      t.due || '',
      (t.assignees || []).map(function (a) { return person[a] || ''; }).filter(String).join(', '),
      (t.labels || []).map(function (l) { return tag[l] || ''; }).filter(String).join(', '),
      (t.checklist || []).length
        ? t.checklist.filter(function (c) { return c.done; }).length + '/' + t.checklist.length
        : '',
      (t.links || []).map(function (l) { return l.url; }).join('\n'),
      (t.files || []).map(function (f) { return f.name; }).join('\n'),
      t.notes || ''
    ];
  });

  var width = head.length;
  sh.getRange(1, 1, 1, width).setValues([head]).setFontWeight('bold');

  if (rows.length) {
    var range = sh.getRange(2, 1, rows.length, width);
    range.setNumberFormat('@');      // keep a task starting with = as text
    range.setValues(rows);
    range.setVerticalAlignment('top');
  }

  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 150);   // Bucket
  sh.setColumnWidth(2, 330);   // Task
  sh.setColumnWidth(6, 170);   // Assigned to
  sh.setColumnWidth(7, 150);   // Labels
  sh.setColumnWidth(9, 220);   // Links
  sh.setColumnWidth(10, 200);  // Files
  sh.setColumnWidth(11, 320);  // Notes
}

/**
 * Optional. Run once from the editor to confirm the script can reach the
 * sheet and Drive. Check the execution log for the result.
 */
function testConnection() {
  var res    = loadBoard();
  var folder = attachmentFolder();
  Logger.log('Sheet OK. Revision: ' + res.rev +
             '. Board present: ' + (res.board ? 'yes' : 'no, sheet is empty') +
             '. Upload folder: ' + folder.getName());
}
