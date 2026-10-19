# app/AGENTS.md

Read this before changing anything in `app/`. It lists what the code does not say
out loud. Verified against the code on 2026-10-19; each item points to a file.

## Contracts with other systems

- **The accounting CSV is read by a machine and breaks silently.** `bin/nightly-export.js`
  writes `out/export/oblik-YYYY-MM-DD.csv` for «Облік-Плюс» (06:00 pickup). Dates must
  stay `MM/DD/YYYY`, amounts `1234.50`, separator `;`, line end CRLF
  (`docs/integrations/oblik-plus.md`, `lib/export/accounting.js`). A row with another
  date format is skipped without any error on either side (40 invoices were lost in
  Feb 2021). Changing this needs a week's notice to accounting.
- **`lib/format.js` `formatDate()` reaches the export through a name built at run time**:
  `format['format' + col.type]` in `lib/export/accounting.js:30`, with
  `"type": "Date"` in `config/export-columns.json`. A search for `formatDate` does
  not find that caller. Do not change `formatDate()` in place. For text people read,
  use `formatDateUA()` (`DD.MM.YYYY`, added in BILL-482); for the machine, `formatDate()`.
- **`test/characterization/` guards this.** `accounting export ... byte-for-byte`
  compares with `golden/oblik-export.csv`. If it goes red, fix the code. Do not
  regenerate the golden file.
- Reminder mails are files in `out/mail/` (`bin/send-reminders.js`); the old SMTP relay
  sends them. There is no SMTP code in this repo.

## Traps

- **`formatDate()` says "ISO format" in its doc comment and returns `MM/DD/YYYY`**
  (`lib/format.js:26-33`). Trust the code.
- **Stored dates are `YYYY-MM-DD` strings, money is integer kopecks** (`lib/store.js`).
  There are several local date helpers (`lib/reports/dates.js`, `lib/orders`,
  `lib/audit`, ...) on purpose; reports have their own `fmtAmount` (`lib/reports/table.js`).
  Do not "unify" them.
- **`store.insert/update` only change memory.** Nothing is persisted until the caller
  runs `store.save(name)`. Whole file rewrite, no locking.
- **Overdue reminders are never marked as sent.** `reminderKind` checks
  `overdue_reminded`, but nothing in `lib/` or `bin/` sets it, so the 09:00 cron would
  mail every overdue customer every day (`lib/notifications/reminders.js:20`).
  Found by reading the code, not run end to end.
- **`POST /api/orders/:id/invoice` sets the order to `invoiced` itself**, not through
  `lib/orders/status.js` (`lib/invoices/routes.js:47`).
- **`server.js` ignores `MODULE_NOT_FOUND` when registering routes** (`server.js:23-27`).
  A typo in a path in `MODULES` silently removes those routes.
- `GET /invoices/:number` (HTML) needs no `x-staff-id`; only paths starting `/api/` do
  (`lib/http/router.js:100-101`).

## Stale or dead

- **`app/docs/ARCHITECTURE.md` is wrong** (2019). It says Express, MongoDB, Handlebars
  templates, PDF via `pdf-render`, SMTP, port 3000, `lib/export/csv.js`, `lib/mail`.
  Real: plain `http`, JSON files in `data/`, string-built HTML, port 8080,
  `lib/export/accounting.js`, `lib/notifications/`. `app/docs/integrations/oblik-plus.md`
  is correct; `app/README.md` is mostly fine.
- **Dead code that looks alive:** `lib/legacy/*` (PDF client, templates, Mongo migration),
  `lib/discounts/` (nothing calls it; invoicing applies no discount whatever
  `config/features.json` says; `newAgingBuckets` is read by nobody),
  `lib/audit/` write side (nothing calls `audit.record()`, so `GET /api/audit` reads a
  log the app never writes).
- `bin/fix-2022-duplicate-customers.js` was applied on prod in 2022. Do not run it.
- Cron times appear only in comments; there is no crontab in the repo.

## How to check a change

`cd app && npm test` (115 tests). Before touching anything that prints a date or an
amount, run `node bin/nightly-export.js 2026-03-31` before and after and diff
`out/export/oblik-2026-03-31.csv` (delete `out/` afterwards, never commit it).
