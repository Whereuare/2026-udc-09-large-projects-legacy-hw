# Task E (bonus) — Path 2: mutation testing of the characterization tests

## Tool

Manual mutations, applied by a small throwaway script (not committed, nothing added to
`app/`): for each mutant it replaces one exact string in a source file, runs
`node --test` on the characterization tests, restores the file, and (if the mutant
survived) also runs the whole suite. I chose manual mutants over Stryker through `npx`
because there are only a few dozen lines that matter, and I wanted mutants aimed at the
consumers (the export, the mails, the page), not generated at random. The working tree
was clean before and after each run (`git status`).

## Mutants (23)

Grouped by where they sit. "Killed" means at least one characterization test failed.

| Where | Mutant | Result (first run) |
|---|---|---|
| `formatDate` | DD.MM instead of MM/DD | killed |
| `formatDate` | month not zero-padded | killed |
| `formatDate` | 2-digit year | killed |
| `formatDate` | local `getDate()` instead of `getUTCDate()` | **survived** |
| `toDate` | `Date` objects no longer accepted | killed |
| `formatDateUA` | separator `-` / MM.DD.YYYY / day not zero-padded / empty value returns `-` (4 mutants) | all killed |
| `formatMoney` | thousands separator `,` instead of space | killed (by the page and mail goldens) |
| `invoices/render.js` | issued date, or due date, back to `formatDate` (2 mutants) | both killed |
| `reminders.js` | overdue mail, or upcoming mail, back to `formatDate` (2 mutants) | both killed |
| `reminders.js` | upcoming fires on `<= 3` days instead of exactly 3 | killed |
| `accounting.js` | separator `,`; LF instead of CRLF (2 mutants) | both killed |
| `accounting.js` | date columns rendered with `formatDateUA` (the regression BILL-482 could cause) | killed |
| `accounting.js` | customer name blanked | killed |
| `accounting.js` | **drafts are exported** | **survived** |
| `accounting.js` | **unknown customer crashes** instead of empty cells | **survived** |
| `config/export-columns.json` | `PayUntil` as `Text`; `Amount` as `Money` (2 mutants) | both killed |

First run: **20 of 23 killed**.

## Which mutants survived, and what that says about my tests

1. **Drafts are exported** and 2. **unknown customer crashes.** The golden export is
   built from `data/invoices.json`, and that data has no draft invoices and no invoice
   without a customer (36 invoices, 37 lines in the CSV). Two branches of
   `buildAccountingFile` that decide what the accounting system receives had no test at
   all. The seeded suite did not cover them either (the mutants also survived the full
   `npm test`). This is a real gap in the tests I wrote in Task B: the golden file proves
   the format, not the filter.
3. **Local `getDate()` instead of UTC.** It survives on this machine because it runs in
   Europe/Kyiv (UTC+2/+3), where the local day of a UTC midnight is the same day. On a
   server in a negative-offset time zone, every date would shift one day back. The
   2021 "missing 31st" incident in `lib/reports/dates.js` is the same family. This is
   an environment-dependent mutant, not a logic hole in the data.

## What I added to kill them

`app/test/characterization/export-edges.test.js` (3 tests, green on the unchanged
`formatDate` and export):

- drafts are skipped, cancelled and paid invoices are kept (checked on in-memory rows);
- an invoice whose customer is missing exports empty ЄДРПОУ and name, row
  `INV-2026-00099;03/09/2026;03/23/2026;;;1000.00;200.00;1200.00`;
- `formatDate` and `formatDateUA` return the same text when `process.env.TZ` is
  `America/Los_Angeles`, `Pacific/Kiritimati` and `Europe/Kyiv`.

Second run with both test files: **23 of 23 mutants killed**. Whole suite:
`cd app && npm test` gives 115 tests, 115 pass (106 seeded + 9 characterization).

## Caveats

- Hand-picked mutants are not a measure of coverage. They cover what I thought could go
  wrong, so a surviving class I did not think of is invisible here.
- A mutant killed by a golden file is killed "loudly but vaguely": the test says the bytes
  differ, not which rule broke. The explicit regex lines in `dates.test.js` (first row of
  the CSV, dates on the page) are there to make the message readable.
- I did not mutate `bin/send-reminders.js` and `bin/nightly-export.js` (they write into
  `app/out/`), so a mistake in the file names, the output folder or the argument handling
  would not be caught by these tests.
