# Impact analysis — BILL-482

> Task B. Written before any change to the code. Paths are relative to `app/`.

## 1. What changes

The ticket asks for dates that people read (invoice HTML, payment reminder mails) to
print as `DD.MM.YYYY` instead of `MM/DD/YYYY`. The ticket calls it "one formatting
function", `formatDate` in `lib/format.js:29`. That function is shared with a file
that another system reads, and that file must **not** change.

## 2. Who depends on it

| # | Consumer (file) | How it reaches the date formatting | Who reads the output: person or other system | What should happen after the ticket |
|---|---|---|---|---|
| 1 | `lib/invoices/render.js:38-39` (`renderInvoiceHtml`), served by `GET /invoices/:number` (`lib/invoices/routes.js:63`) | Direct call `format.formatDate(invoice.issued_at / due_at)`. | **Person**: the customer, and staff who open the page. The ticket's example. | **Change** to `DD.MM.YYYY`. |
| 2 | `bin/render-invoice.js` (CLI, prints the same HTML to stdout) | Indirect: calls `renderInvoiceHtml` (row 1), so it changes with it. | **Person** (staff, `> invoice.html`). | **Change**, same as row 1. |
| 3 | `lib/notifications/reminders.js:40` and `:46` (`body()` for the overdue and the upcoming mail), written to `out/mail/*.txt` by `bin/send-reminders.js` | Direct call `format.formatDate(invoice.due_at)`. | **Person**: the customer, in the mail body. The old SMTP relay only forwards the files. | **Change** to `DD.MM.YYYY`. |
| 4 | `lib/export/accounting.js:30` (`buildAccountingFile`), written to `out/export/oblik-*.csv` by `bin/nightly-export.js` | **Indirect, invisible to a search for the function name.** `render = format['format' + col.type]` builds the name at run time. `config/export-columns.json` has two columns with `"type": "Date"` (`DocDate`, `PayUntil`), so `formatDate` is called for both. | **Other system**: «Облік-Плюс» reads the file at 06:00. It expects `MM/DD/YYYY` and **silently skips** a row with another date format (`app/docs/integrations/oblik-plus.md`; the February 2021 incident lost 40 invoices). Nobody gets an error. | **Must stay byte-for-byte identical.** If `formatDate` is changed in place, this file changes too. |

Checked and **not** affected:

- `lib/legacy/templates.js:180-187` has its own `dmy()` helper (`DD.MM.YYYY`) registered as the `date` template helper. It is a separate copy, does not call `format.js`, and the module is dead (nothing requires it). It does not move when `formatDate` moves.
- `lib/reports/*`, `lib/payments/statement.js`, `lib/orders`, `lib/customers`, `lib/audit` and `lib/discounts` have their own ISO date helpers and do not use `format.formatDate`.
- The JSON API (`/api/invoices` and the rest) returns stored `YYYY-MM-DD` strings and does not format dates.
- `formatMoney`, `formatDecimal`, `formatText`, `formatPercent` are not touched by the ticket.

What this means for Task C: `formatDate` has two kinds of callers (rows 1-3 are people, row 4 is a machine) that
need different output. The change therefore has to leave `formatDate` as it is for the
`Date` column type and give the human-facing callers the new format, rather than editing
the shared output in place.

## 3. How I looked for them

- `grep -rn "formatDate" lib bin server.js config test` found rows 1 and 3 (and the
  definition). It did **not** find row 4.
- `grep -rn "format\[\|require('.*format')" lib bin` found `lib/export/accounting.js:30`,
  the dynamic call. I already knew that file from the Task A map (`docs/codebase-map.md`,
  where the nightly export was one of the places I checked byte by byte).
- To confirm which columns reach it: `config/export-columns.json` has `"type": "Date"` on
  `issued_at` and `due_at`; `format['format' + 'Date']` is `formatDate`.
- `grep -rn "dmy\|registerHelper" lib` found the legacy `date` helper, which turned out to be a separate dead copy.
- `grep -rn "formatDate\|MM/DD\|/20" test` shows that no seeded test pinned `formatDate` directly or the export dates; the only
  seeded check on invoice dates is in `test/invoices.test.js` (render test).
- A sanity check by mutation (below): changing `formatDate` in place made **6 tests fail**, including the export one.

## 4. Characterization tests

All five are in `test/characterization/dates.test.js`, golden files in
`test/characterization/golden/` were generated from the unchanged code, not edited by hand.

| Test | What it pins | Green on unchanged code? |
|---|---|---|
| `formatDate today: MM/DD/YYYY` | Direct outputs of the shared function (string, `Date`, empty, null, invalid). | yes |
| `invoice HTML over HTTP` | The whole page `GET /invoices/INV-2026-00007` against `invoice-INV-2026-00007.html` (row 1). | yes |
| `invoice HTML via bin/render-invoice.js path` | `renderInvoiceHtml` for `INV-2026-00031` (a February invoice) against a golden page (rows 1-2). | yes |
| `reminder mails (upcoming + overdue)` | `buildReminders` on 2026-03-16 over the seeded invoices (both kinds) against `reminders-2026-03-16.json` (row 3). | yes |
| `accounting export ... byte-for-byte` | `buildAccountingFile` over all 36 seeded invoices against `oblik-export.csv`, compared as bytes, CRLF included (row 4). | yes |

`cd app && npm test` at the Task B commit: 111 tests, 111 pass (the 106 seeded ones plus these 5).

Sanity check that they bite: I temporarily switched `formatDate` to `DD.MM.YYYY` in
place. Six tests failed: the five above, including the export one, and the seeded
`rendered invoice shows number, customer, dates and totals`; then I reverted it
(`git checkout app/lib/format.js`), and the suite is green again.

Not covered: the CLI wrappers `bin/send-reminders.js` and `bin/nightly-export.js` themselves
(they write into `app/out/`); the tests call the functions they call.

Commit with the tests (before the change): `919e437`

## 5. After the change (Task C)

The change: a new `formatDateUA()` in `lib/format.js` (`DD.MM.YYYY`), used by
`lib/invoices/render.js` and `lib/notifications/reminders.js` (2 lines each).
`formatDate()` is **not touched**, so the accounting export, which reaches it through
`config/export-columns.json`, is unchanged. Diff of the code: 3 files, +17 -4.

Running the suite right after the code change, before touching any test: 4 failures
out of 111, exactly the four human-facing outputs.

| Test | Went red? | Expected or regression? | What I did |
|---|---|---|---|
| `formatDate today: MM/DD/YYYY` | no | The machine-facing function must not change. | Nothing. |
| `invoice HTML over HTTP` | yes | **Expected.** A person reads this page and the ticket asks for `DD.MM.YYYY`. | Updated golden `invoice-INV-2026-00007.html` (only the two dates differ: `03/07/2026` to `07.03.2026`, `03/21/2026` to `21.03.2026`) and the regex in the test. |
| `invoice HTML via bin/render-invoice.js path` | yes | **Expected.** Same renderer, same reader. | Updated golden `invoice-INV-2026-00031.html` (dates only). |
| `reminder mails (upcoming + overdue)` | yes | **Expected.** The customer reads the mail and the ticket names it. | Updated golden `reminders-2026-03-16.json` (only the `... до DD.MM.YYYY` date in each mail text) and the regex. |
| `accounting export ... byte-for-byte` | **no** | Would have been a **regression**: Облік-Плюс skips rows with another date format. | Nothing. The golden file `oblik-export.csv` is not modified (`git diff` on it is empty). |
| seeded `rendered invoice shows number, customer, dates and totals` (`test/invoices.test.js:41-42`) | yes | **Expected.** It asserted the invoice dates in the old format. | Changed the two regexes to `09.03.2026` and `23.03.2026`. Nothing else in that test changed. |

New test added: `formatDateUA: DD.MM.YYYY for people` in `test/characterization/dates.test.js`.

Result: `cd app && npm test` gives 112 tests, 112 pass (106 seeded + 6 characterization).
No expectation was changed for an output that another system reads.
