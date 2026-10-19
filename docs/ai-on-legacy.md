# Where the agent went wrong on legacy code

> Task D, part 1. In my main run the agent (Claude Code, Sonnet 5.5) did not make a
> mistake that changed the outcome, so I did **not** invent three cases. I did the
> control run instead (below), and I list what I checked and the small slips I did find.

## What I checked in the main run, and why I think it was the risky part

- **The stale docs.** `app/docs/ARCHITECTURE.md` is wrong on Express, MongoDB, Handlebars,
  PDF, SMTP and the port (Task A, rows 1, 3-7, 9, 11). The agent built the map from the
  code and opened that doc last, so it never believed it.
- **The hidden consumer.** The only consumer of `formatDate` that a search by name does
  not find is the accounting export (`format['format' + col.type]` in
  `lib/export/accounting.js:30`). The agent found it by reading the file (Task A), and
  Task B pinned its bytes in `test/characterization/golden/oblik-export.csv`. I also
  proved the test bites: a naive in-place change to `formatDate` turned 6 tests red,
  the export test among them.
- **The result of Task C**: the export file is byte-identical before and after
  (`git diff` on its golden file is empty).

Small slips that were caught, none of which changed the outcome:

- In `docs/codebase-map.md` four line references were off by 1-3 lines (for example
  `reminders.js:57` instead of `:56`). I rechecked them with `grep -n` after writing and fixed them.
- In `docs/impact.md` I first cited the wrong lines for `formatDate` (`:32` instead of `:29`)
  and for the legacy `dmy()` helper. Same recheck, same fix.

## Control run (instead of three cases)

- **Clean clone:** yes. A local clone of this repo at commit `7ada5a0` (before my Task B and
  C work). Removed the root `README.md`, `AGENTS.md`, `CLAUDE.md`, `.coderabbit.yaml`,
  `.github/`, `docs/` and also `materials/` (the ticket was passed in the prompt instead).
  Kept `app/README.md` and `app/docs/`. Baseline: 106 tests, all green.
- **Tool and model:** Claude Code `Agent` tool, model **Haiku** (the cheapest and fastest
  one offered). Run in the background; it was told to stay inside the clone's `app/` folder.
- **Prompt:** only the ticket, verbatim: the full text of BILL-482 ("Дата в рахунках у
  неправильному форматі ... Здається, це одна функція форматування. Дрібна правка. ...
  Тільки обережно — це старий білінг, тестів там небагато."), preceded by one sentence
  saying it is a Node.js billing app and `npm test` runs its tests.
- **What it changed** (`git diff --stat`, 6 files, 39 insertions, 6 deletions):
  - `lib/format.js`: a new `formatDateUa()` with a doc comment; `formatDate()` untouched.
  - `lib/invoices/render.js` and `lib/notifications/reminders.js`: switched to `formatDateUa`.
  - tests: `test/invoices.test.js` updated to `09.03.2026` / `23.03.2026`; new tests in
    `test/format.test.js` and one line in `test/reminders.test.js`.
- **What it said:** "I did not change `formatDate` itself, because the accounting export
  depends on it ... Changing the shared function would have broken the accounting import
  without any test failing." It got to the trap by reading `app/docs/integrations/oblik-plus.md`,
  which is part of the system and was not removed. It used 12 tool calls and about 48k
  tokens in 42 seconds.
- **Did the output another system reads change?** No. I checked it myself, not from its report:
  - `node bin/nightly-export.js 2026-03-31` before and after, `cmp` on the two CSV files: identical.
  - I generated the four golden outputs (two invoice pages, the reminder mails, the export CSV)
    from its code and compared them with the goldens from my own solution: all four are
    byte-identical to mine.
  - My characterization tests from commit `919e437`, run against its code, were green on the export test and red on the three
    human-facing ones (expected), plus one that calls `formatDateUA` (it named the function
    `formatDateUa`).
- **Tests:** 108 run, 108 green (106 seeded + 2 it added).
- **Where it was less reliable than its answer sounded:**
  - It wrote "Accounting export row still reads `INV-2026-00007;03/09/2026;03/23/2026`".
    The real row is `INV-2026-00007;03/07/2026;03/21/2026` (`data/invoices.json`); the 09/23 dates
    are the fixture inside `test/invoices.test.js`. The conclusion (export unchanged) is right, the quoted evidence is not.
  - It said "the ticket also asked for a note to the team lead". The ticket does not ask for that.
  - It wrote no test that pins the export's current output; it relied on `docs/integrations/oblik-plus.md` and one manual run.
    The safety rests on the doc being found and obeyed.
- **Conclusion:** the cheapest model reached the same outputs as my main run and avoided the
  trap, so the course files were not what made the difference here. The one thing it needed
  was the system's own `app/docs/integrations/oblik-plus.md`, and it found that without help.
  What it did not leave behind is the protection: nothing in its change stops the next person from
  editing `formatDate` in place and breaking the export. That is why `app/AGENTS.md` names the
  dynamic `format['format' + col.type]` call and why `test/characterization/` exists.
  Also, its final report mixed correct conclusions with two wrong details, so its summary has to be
  verified by diff and by running the export, not read at face value.
