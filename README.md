# Alan Alda Center program board

A Planner-style task board. One self-contained HTML file for the interface,
plus an optional Google Sheet behind it so a team shares one board.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole board. Logo, styles and code are embedded. |
| `Code.gs` | Apps Script that turns a Google Sheet into the shared backend. |

## Run it

Open `index.html` in a browser, or publish the repo with GitHub Pages
(Settings > Pages > Deploy from a branch > `main` > `/ (root)`).

Default password: `alda2026`. Change it with the Password button in the
toolbar, which hands you the replacement line to paste into `index.html`.

Without the sheet connected, every visitor gets their own private copy
stored in their own browser. Connect the sheet to make it shared.

## Connect the shared sheet

1. Create a Google Sheet.
2. Extensions > Apps Script. Replace the starter code with `Code.gs`. Save.
3. In `Code.gs`, set `TOKEN` to any random string.
4. Deploy > New deployment > Web app.
   Execute as **Me**, Who has access **Anyone**. Deploy and authorize. It asks
   for Sheets and Drive access; Drive is for uploads.
5. Copy the web app URL, the one ending in `/exec`.
6. In `index.html`, set `SHEET_URL` to that URL and `SHEET_TOKEN` to the same
   string you used for `TOKEN`.

The first person to open the board seeds the sheet. After that everyone
loads from it, saves back to it, and picks up other people's changes within
about ten seconds.

If two people save at once, the second one is asked whether to keep their
version or take the other. If the sheet is unreachable the board keeps
working and saves locally, but those changes are not shared.

Editing `Code.gs` later means running Deploy > Manage deployments and
publishing a new version, otherwise the live URL keeps serving old code.

## Links and files

Open any task to find a Links section and a Files section.

Links are plain text stored with the task and work with or without the sheet
connected. Only `http` and `https` addresses are accepted.

Files can come in two ways:

- **Upload.** Click Upload files or drop files on the box. They go to a Drive
  folder called `Program board files`, created next to the spreadsheet. The
  board stores only a reference, so the sheet stays small. Needs the sheet
  connected. Cap is 8 MB per file; put larger things in Drive yourself and
  paste the link.
- **Paste a link.** Any file host works: Drive, OneDrive, SharePoint,
  Dropbox. OneDrive and SharePoint links name themselves from the URL; for
  anything else, type a name. Works without the sheet.

Removing an uploaded file moves it to the Drive trash, recoverable for 30
days. Removing a pasted link only takes it off the task; the file itself is
untouched.

Uploaded files are owned by whoever deployed the script and count against
that person's Drive storage. By default they are shared as "anyone with the
link can view", because the board has no real accounts behind it. Change
`ATTACHMENT_SHARING` in `Code.gs` to `'domain'` to limit them to your
Workspace.

## The sheet

Two tabs appear automatically. `_data` holds the board and is hidden; leave
it alone. `Tasks` is a plain readable copy rewritten on every save, useful
for reporting or printing. Edits made in `Tasks` do not flow back.

## Editing the sample content

Everything is editable in the interface, including the board title and
bucket names. To replace the filler wholesale, edit the `seed()` function
near the top of the `<script>` block in `index.html`. Buckets, members,
labels and tasks are plain arrays there.

Export downloads the board as JSON. Import loads one back.

## What this is not

The password lives in the file, so anyone who can read the source can get
past it. A GitHub Pages site is public even when the repo is private. The
Apps Script endpoint is open to anyone holding the URL and token, both of
which are also in the source. That means a determined visitor could read or
overwrite the board, open its attachments, and upload files into your Drive.

Treat this as a working prototype for non-sensitive program planning. Keep
personnel matters, budgets and anything confidential out of it. If it needs
real access control, it needs real accounts and a real server.
