# Implementation Plan: ProvisionLens

Status: draft 0.1 (2026-11-23). Implements [provisionlens-requirements.md](provisionlens-requirements.md) draft 0.4.
Requirement IDs in brackets, e.g. [FR-BUD-6], refer to that document. IDs it doesn't define (FR-SS-2, FR-UI-13,
FR-OUT-3 and so on) are ssmodel's, from [requirements.md](requirements.md). Decisions are cited as in the
requirements, e.g. (D: OQ-STO-7).

Each task is sized for about one working session. Every task lists **Covers** (requirement IDs), **Files** (main
modules touched), and **Done when** (the acceptance check, usually tests). Tasks within a milestone are listed in
dependency order. Tasks marked ∥ can run in parallel with the task before them.

The order follows the rebrand assessment's suggested order: spike first, then reach parity with Checquery so the
household can stop running its server, then generalize ssmodel's engine and join the two, then build the new
planning features, then prepare the first release. Everything ships before the first friend uses it
[FR-PRD-8], but the household uses each milestone as it lands.

---

## Conventions

- **Task IDs** are `P<milestone>.<n>`, to keep them apart from ssmodel's `T` tasks in the same history. Commit per
  task: `P1.3: Store worker protocol`.
- **Layout** (target; ssmodel's existing modules stay where they are):

  ```
  src/
    engine/            pure TypeScript, no React/DOM (ssmodel's, generalized)
      budget/          pattern expansion, actuals matching, forecast, cash flow
      building/        wages, contributions and limits, waterfall, loans, self-employment
      goals/           goal model, kinds, funding, flexible-date search
      money/           the one cents ⇄ dollars boundary [NFR-ARCH-12]
    ledger/            domain from Checquery (@checquery/shared/domain), Zod schemas, roles catalog
    store/             storage, no React/DOM
      driver/          DbDriver interface; bunSqlite.ts (tests), wasmSqlite.ts (app) [NFR-ARCH-9]
      actionLog/       change log, encryption, migrations (from Checquery)
      materialized/    in-memory materialized store and its services (from Checquery)
      file/            OPFS working copy, autosave, locks, backups, file handles
      plan/            planning document table, Zod, migrations
    schema/            ssmodel's planning schemas, YAML import/export [FR-STO-9]
    worker/            engine pool (ssmodel) + store.worker.ts and its protocol [NFR-ARCH-8]
    state/             Zustand stores (ssmodel's plus ledger, budget, routing state)
    app/
      shell/           toolbar, section tabs and menus, status bar, router
      pages/           home, past, thisYear, nextYear, goals, building, retiring, setup, help
      components/      grid (shared, incl. register), charts, report template, levers, KPI tiles
    help/              help pages (Markdown), glossary
  data/rules/          federal, SSA, CMS, SC (later NC, GA, FL, NY, VA, PA)
  scripts/samples/     sample household generator [FR-HLP-1]
  test/
    fixtures/          synthetic .plens, .checquery and YAML fixtures; golden outputs
    samples/           generated sample households (e2e and golden summaries) [NFR-TEST-12]
    reference/         ssmodel's reference engine, extended [NFR-TEST-13]
    e2e/               Playwright specs; fsaMock.ts extended for OPFS and locks
  private/             git-ignored real files (the .checquery file, its converted .plens)
  ```

- **Money:** ledger and budget code handles integer cents only; planning code handles float64 dollars only. Values
  cross in `src/engine/money/` and nowhere else [NFR-ARCH-12].
- **Store access:** React code never touches SQLite. It sends typed requests to the store worker and receives
  results and change notifications [NFR-ARCH-8].
- **Engines read roles, not names** [FR-ROLE-7]: no engine or budget code may look at an account's name or category.
- **Definition of done for every task:** `bun run check:all` passes (type-check, Biome, `bun test`, Playwright).
  New rules have unit tests citing their source [NFR-TEST-11]. Tasks that touch the engine keep the current
  household's golden results unchanged, or explain the difference in the commit [NFR-TEST-8]. New pages have a help
  page and tooltips [FR-HLP-11, FR-UI-37]. Only synthetic data in tests and fixtures.

---

## P0 — Spike (decision gate)

Goal: a measured answer to "can a browser open, decrypt, replay and save the real `.checquery` file fast enough?",
before any porting. Throwaway code under `spike/`, except the driver interface.

**P0.1 SQLite WASM in a worker**
- Covers: NFR-ARCH-8, FR-STO-2 (spike).
- Files: `spike/sqliteWorker.ts`, `spike/index.html`.
- Steps:
  - Load the official SQLite WASM build in a dedicated worker; open a database in OPFS (the `opfs` VFS or
    `opfs-sahpool`, whichever performs better).
  - Import a file's bytes into OPFS, open it, run a query, export the bytes again.
  - Hand the exported bytes to a `FileSystemFileHandle` writable.
- Done when: a 1.2 MB SQLite file round-trips byte-identical (apart from SQLite headers) through OPFS and back to a
  user file, with timings recorded.

**P0.2 Browser crypto** ∥
- Covers: FR-STO-5 (spike).
- Files: `spike/crypto.ts`.
- Steps:
  - scrypt from `@noble/hashes` with the parameters stored in Checquery's file meta; AES-GCM through Web Crypto.
  - Decrypt a payload written by Checquery's `node:crypto` code (a synthetic encrypted fixture made with Checquery).
- Done when: payloads decrypt identically to Checquery's server; key derivation time is recorded (target ≤ 2 s on
  the development machine; if slower, note scrypt in WASM as the fallback).

**P0.3 Replay and parity**
- Covers: NFR-TEST-9 (spike), NFR-ARCH-10.
- Files: `spike/replay.ts`.
- Steps: replay a copy of the real file's change log (from `private/`) into an in-memory database in the worker;
  compute Balance Sheet and Income Statement totals for a few dates with Checquery's queries.
- Done when: totals match the Checquery server's for the same dates; open time (decrypt + replay) is recorded.

**P0.4 Gate and decision record**
- Files: `docs/benchmarks.md` (new ProvisionLens section).
- Gate:
  - open ≤ 3 s and save ≤ 1 s for the real file: continue as planned;
  - open 3–10 s: plan snapshotting the materialized store into the file, so opens skip the full replay;
  - decryption impossible or open > 10 s after snapshotting: stop and revisit D2 before P1.
- Done when: the measurements and the decision are written down.

**P0 exit:** the gate decision recorded; the spike code deleted or kept under `spike/` and excluded from the build.

---

## P1 — Storage

Goal: the `.plens` file works end to end in the browser, with Checquery's domain and storage ported and tested,
before any page is rewritten.

**P1.1 Bring in Checquery's domain**
- Covers: NFR-ARCH-11, NFR-TEST-19, D: OQ-DEL-1.
- Files: `src/ledger/**` (from `checquery/packages/shared/src/domain`, `util`).
- Steps: copy the domain (accounts, categories, vendors, transactions, balance assertions, origins, actions, core);
  convert to this repo's Biome style and TypeScript settings; port its domain tests to `bun test`.
- Done when: the domain tests pass here; no SolidJS or server imports remain.

**P1.2 Database driver interface**
- Covers: NFR-ARCH-9.
- Files: `src/store/driver/{DbDriver.ts,bunSqlite.ts,wasmSqlite.ts}`.
- Steps: the small interface Checquery's storage uses (prepare, run, all, get, transaction, export bytes);
  `bun:sqlite` for tests, SQLite WASM for the worker.
- Done when: one shared contract test suite passes against both drivers (the WASM one under Playwright).

**P1.3 Change log and migrations**
- Covers: NFR-ARCH-10, NFR-TEST-19, FR-LED-4.
- Files: `src/store/actionLog/**`.
- Steps: port `ActionLog`, meta, encryption (Web Crypto + noble scrypt, from P0.2) and the migration runner onto the
  driver; port their tests. Origins become a device/user name from the app's settings instead of user plus IP.
- Done when: Checquery's change-log tests pass under `bun test`; an encrypted fixture written by Checquery opens.

**P1.4 Integer cents**
- Covers: D: OQ-LED-2, NFR-ARCH-12.
- Files: `src/store/actionLog/migrations/0004_cents.ts`, `src/ledger/core/money.ts`, `src/engine/money/`.
- Steps: a log migration that rewrites `$#,###.##` amounts to integer cents in every action; domain types use cents;
  the boundary module converts to and from engine dollars.
- Done when: a fixture log migrates with every amount equal to the cent; the boundary has round-trip tests.

**P1.5 Materialized store**
- Covers: NFR-ARCH-10, FR-LED-1, FR-LED-2.
- Files: `src/store/materialized/**`.
- Steps: port `MaterializedStore`, its schema and the CRUD services onto the driver; replay on open.
- Done when: Checquery's materialized-store tests pass; the P0.3 parity check passes in a unit test against a
  synthetic `.checquery` fixture.

**P1.6 Store worker and protocol**
- Covers: NFR-ARCH-8.
- Files: `src/worker/store.worker.ts`, `src/worker/storeProtocol.ts`, `src/state/storeClient.ts`.
- Steps: typed requests (queries, commands), results, errors and change notifications; one in-flight write at a
  time; a client hook for React.
- Done when: an e2e test creates an account through the protocol and sees the change notification.

**P1.7 The `.plens` file: create, open, autosave**
- Covers: FR-STO-1, FR-STO-2, FR-STO-3, FR-STO-7, FR-STO-10, D: OQ-STO-1.
- Files: `src/store/file/{opfs.ts,autosave.ts,handles.ts}`, `src/app/files/*`.
- Steps:
  - New / Open… / Close / Save a copy… and recent files (handles in IndexedDB, permission requested again on
    reopen); "Chromium required" screen.
  - Working copy in OPFS; whole-database write-back after a 5 s pause, on close and when hidden.
  - Crash recovery: offer the working copy when it's newer than the file.
  - Schema version in the file; refuse newer versions; migrations only after confirmation.
  - Manifest file handler for `.plens` (the T6.1 PWA, extended).
- Done when: NFR-TEST-14's autosave-and-reopen and crash-recovery e2e tests pass with the extended FSA mock.

**P1.8 One writer, live second window**
- Covers: FR-STO-4, D: OQ-UI-8, D: OQ-STO-5.
- Files: `src/store/file/lock.ts`, `src/store/file/broadcast.ts`.
- Steps: a Web Lock per file; a second tab or window opens read-only and follows changes through a BroadcastChannel;
  the device heartbeat in the file warns when another device has it open.
- Done when: e2e: a second tab is read-only and shows an edit made in the first within a second.

**P1.9 Encryption settings, recovery key, backups**
- Covers: FR-STO-5, FR-STO-6, D: OQ-STO-2, D: OQ-STO-3, D: OQ-STO-4.
- Files: `src/store/actionLog/encryption/*`, `src/store/file/backup.ts`, `src/app/pages/setup/file/*`.
- Steps: encryption on by default, off with a warning; change password; a recovery key shown once as words, wrapping
  the file key; rolling OPFS backups (last 10) and a backup folder (daily, 30 days plus monthly).
- Done when: NFR-TEST-14's wrong-password, recovery-key and backup-folder e2e tests pass.

**P1 exit:** a `.plens` file can be created, encrypted, edited through the store worker, autosaved, recovered,
backed up and reopened, all in Chromium with no server.

---

## P2 — App shell and ledger parity

Goal: everything Checquery does today, in the new shell, so the household stops running the Checquery server.

**P2.1 Router and app shell**
- Covers: FR-UI-19, FR-UI-20, FR-UI-21, FR-UI-22, FR-UI-23, D: OQ-UI-5, D: OQ-UI-6, D: OQ-UI-14.
- Files: `src/app/shell/*`, `src/app/routes.ts`.
- Steps: TanStack Router with hash history; toolbar; section tabs with page menus; status bar with autosave, lock and
  encryption state; drill-down breadcrumbs; ssmodel's existing views mounted under Retiring Years unchanged.
- Done when: e2e navigates every section by tab and menu, and back/forward and reload keep the page.

**P2.2 Visual system and formatting**
- Covers: FR-UI-28, FR-UI-29, FR-UI-30, FR-UI-27.
- Files: `src/app/theme/*`, `src/lib/format.ts`, `src/app/components/templates/*`.
- Steps: semantic color tokens (actual/projected, variance, goal status, phases); one formatting module for cents,
  dollars, percentages and dates; skeletons for the six page templates.
- Done when: unit tests for formatting; a template gallery page renders in both themes.

**P2.3 Accounts, categories and vendors**
- Covers: FR-LED-1, FR-LED-3, FR-UI-24, D: OQ-UI-12.
- Files: `src/app/pages/setup/accounts/*`, `src/app/pages/setup/vendors/*`.
- Steps: tree pages for the four account types (categories and accounts, inline add/edit, primary flag); vendor list
  with default accounts.
- Done when: e2e creates, renames, moves and deletes categories, accounts and vendors.

**P2.4 Register on the shared grid**
- Covers: FR-LED-3, FR-UI-31, D: OQ-UI-13, D: OQ-LED-7.
- Files: `src/app/components/grid/*`, `src/app/pages/past/register/*`.
- Steps: extend ssmodel's grid with the register's needs: split entries, running balance, posted and cleared dates,
  needs-review flag, vendor autocomplete filling the default account, date shortcuts, the inline calculator.
- Done when: e2e enters, edits, splits and deletes transactions by keyboard only.

**P2.5 Income and Expense Logs, balance assertions** ∥
- Covers: FR-LED-1, FR-LED-3.
- Files: `src/app/pages/past/{incomeLog,expenseLog,assertions}/*`.
- Done when: e2e shows a log per account and a balance assertion that passes and one that fails.

**P2.6 Balance Sheet and Income Statement**
- Covers: FR-LED-2, FR-LED-3, RPT-LED-1, RPT-LED-2 (base versions).
- Files: `src/app/pages/past/{balanceSheet,incomeStatement}/*`.
- Steps: by year, quarter and month; summary and details; net worth as assets minus liabilities.
- Done when: totals match hand-computed values on a fixture [NFR-TEST-16].

**P2.7 Undo, redo and the plain view**
- Covers: FR-LED-11, FR-HLP-6, D: OQ-HLP-6.
- Files: `src/state/ledgerUndo.ts`, `src/app/pages/past/register/*`.
- Steps: compensating actions for ledger edits within a session; a setting for the plain view (default) or the
  accounting view.
- Done when: unit tests for compensating actions; e2e undoes a split edit.

**P2.8 Search in the command palette** ∥
- Covers: FR-UI-26, FR-UI-12.
- Files: `src/app/shell/palette/*`, store worker search query.
- Done when: e2e finds an account, a vendor and a transaction by amount.

**P2.9 Convert the `.checquery` file**
- Covers: FR-MIG-1, NFR-TEST-9, D: OQ-STO-7.
- Files: `src/app/files/convertChecquery.ts`.
- Steps: a one-time import: password, decrypt, replay, write a new `.plens`. Accounts get generic roles for now;
  real roles come in P3.
- Done when: the synthetic `.checquery` fixture converts with matching statements (CI), and the real file converts
  locally with matching statements (recorded, not committed).
- Fallback: if this gets complicated, skip it and move data with P3.9 (accounts and vendors) plus P3.6 (transaction
  import) instead (D: OQ-STO-7).

**P2 exit (switch-over):** the household opens its converted file in the new app and stops using the Checquery
server.

---

## P3 — Accounts, roles and getting data in

Goal: every account has a role, and transactions arrive by import instead of only by hand.

**P3.1 Role catalog**
- Covers: FR-ROLE-1, FR-ROLE-2, FR-ROLE-3, FR-ROLE-4, FR-LED-7, D: OQ-ROLE-1, D: OQ-ROLE-9.
- Files: `src/ledger/roles/catalog.ts`, `src/ledger/roles/validate.ts`.
- Steps: the catalog as typed data (type, cardinality, attributes schema, planning group, indexing, tax meaning,
  budget behavior, engine behavior), including self-employment and property-tax roles; validation of cardinality
  and required roles per household.
- Done when: NFR-TEST-15's validation tests pass.

**P3.2 Roles and attributes on accounts**
- Covers: FR-ROLE-5, FR-ROLE-6, FR-ROLE-9, FR-ROLE-12, D: OQ-ROLE-7.
- Files: `src/ledger/accounts/*`, `src/store/actionLog/migrations/0005_roles.ts`, account editor.
- Steps: role and fact attributes (owner, loan terms, basis, links) on the account entity in the change log;
  default roles on categories; changing a role lists dependents and flags incompatible items.
- Done when: unit tests for role changes; e2e sets roles and attributes in the account editor.

**P3.3 Role map**
- Covers: FR-ROLE-10.
- Files: `src/app/pages/setup/roleMap/*`.
- Steps: roles with their accounts, missing and duplicate roles, generic roles whose names suggest a specific one,
  missing attributes; suggestions the user confirms (also the follow-up to P2.9's generic roles).
- Done when: e2e fixes a missing required role and accepts a suggested one.

**P3.4 Default charts of accounts**
- Covers: FR-LED-8.
- Files: `src/ledger/charts/*.ts`.
- Steps: a few variants (single, family, retired, self-employed) with roles on every account and category.
- Done when: each chart validates with no role-map warnings for its household shape.

**P3.5 Paycheck templates and revaluations**
- Covers: FR-LED-9, FR-LED-10, D: OQ-LED-6, D: OQ-ROLE-6.
- Files: `src/ledger/paychecks/*`, `src/app/pages/setup/paychecks/*`.
- Steps: gross-pay templates with withholding, contributions, employer contributions and net pay; one-click entry;
  revaluation entries for investment accounts against Net Worth.
- Done when: e2e enters a paycheck from a template; savings-rate inputs (gross, contributions) come out right in a
  unit test.

**P3.6 CSV import**
- Covers: FR-IMP-1, FR-IMP-2, FR-IMP-4, FR-IMP-5, D: OQ-IMP-1, D: OQ-IMP-4.
- Files: `src/ledger/import/csv/*`, `src/app/pages/past/import/*`.
- Steps: saved column mappings per institution; date and amount parsing; duplicate detection; all-or-nothing with
  line-numbered errors; deposits matching a paycheck template's net pay offered as that paycheck.
- Done when: unit tests for mappings and duplicates; e2e imports a synthetic bank CSV.

**P3.7 Categorization**
- Covers: FR-IMP-3, D: OQ-IMP-2.
- Files: `src/ledger/import/categorize.ts`, rules editor.
- Steps: user rules, vendor default, history-based suggestion; everything guessed gets needs-review.
- Done when: unit tests for rule order and suggestions.

**P3.8 OFX/QFX import** ∥
- Covers: FR-IMP-1, FR-IMP-2.
- Files: `src/ledger/import/ofx/*`.
- Done when: a synthetic OFX file imports, and re-importing it finds every transaction as a duplicate by FITID.

**P3.9 Accounts and vendors export/import** ∥
- Covers: FR-MIG-3.
- Files: `src/ledger/exchange/*`.
- Done when: a chart exported from one file imports into another, all or nothing, with line-numbered errors.

**P3 exit:** the household's file has roles on every account, no role-map warnings, and this month's transactions
came in by import.

---

## P4 — Ledger reports ∥ (can run alongside P5)

Goal: the ledger reports in the catalog, on one report template.

**P4.1 Report template and framework**
- Covers: FR-RPT-1, FR-RPT-2, FR-RPT-3, FR-RPT-5, FR-RPT-6, FR-RPT-7, FR-ROLE-8, D: OQ-RPT-3, D: OQ-RPT-7,
  D: OQ-RPT-9, D: OQ-RPT-10, FR-UI-22.
- Files: `src/app/components/report/*`, `src/store/materialized/reports/*`.
- Steps: filters bar; periods and comparisons; grouping by tree, role, planning group or vendor; drill-down to a
  filtered register; CSV export; print stylesheet; table equivalent for charts; saved views in the file.
- Done when: e2e drills from a report total to the transactions behind it and exports CSV.

**P4.2 Statements, extended**
- Covers: RPT-LED-1, RPT-LED-2, RPT-LED-8, RPT-LED-9.
- Done when: multi-period and year-over-year columns match hand-computed values [NFR-TEST-16].

**P4.3 Net worth, balances, spending charts**
- Covers: RPT-LED-3, RPT-LED-4, RPT-LED-5, RPT-LED-6, RPT-LED-7, D: OQ-RPT-4.
- Done when: each chart has a table equivalent and correct totals on the fixture.

**P4.4 Vendors, search, giving, review queue**
- Covers: RPT-LED-10, RPT-LED-11, RPT-LED-12, RPT-LED-18.
- Done when: e2e saves a transaction search as a view and reopens it; the giving statement splits deductible and
  non-deductible giving.

**P4.5 Tax, cash flow, savings rate, debt**
- Covers: RPT-LED-13, RPT-LED-14, RPT-LED-15, RPT-LED-16, D: OQ-RPT-6.
- Done when: totals by tax role and the savings rate match hand-computed values.

**P4.6 Investment change and money flow**
- Covers: RPT-LED-17, RPT-LED-19, D: OQ-RPT-5, D: OQ-RPT-8.
- Steps: contributions, withdrawals and market change per account; Sankey of top-level flows (custom SVG if Recharts
  falls short).
- Done when: flows into and out of the Sankey sum to the income statement totals.

**P4.7 Report speed**
- Covers: NFR-RPT-1, NFR-TEST-17.
- Files: `scripts/samples/bigLedger.ts`, `test/e2e/reportSpeed.e2e.ts`.
- Done when: every ledger report renders in under 500 ms on a generated 10-year, 30,000-transaction household.

---

## P5 — Generic household (ssmodel's engine)

Goal: ssmodel's engine works for any supported household shape, with the current household's golden results
unchanged at every step [NFR-TEST-8].

**P5.1 Person 1 and Person 2**
- Covers: FR-RET-1, FR-HH-1, FR-HH-3.
- Files: `src/schema/model.ts`, `src/schema/migrations.ts`, engine and UI wording.
- Steps: schema migration from Primary/Spouse; either adult may be claiming or not yet claiming; names in the UI.
- Done when: the current fixture migrates and its golden results are unchanged.

**P5.2 Filing statuses and survivors**
- Covers: FR-HH-2, FR-HH-5, FR-TAX-8, D: OQ-HH-1, D: OQ-HH-5.
- Files: `src/engine/tax/*`, `data/rules/irs/*`.
- Steps: single and head-of-household brackets, deductions, LTCG, Social Security taxation and IRMAA tiers; the
  status derived per year.
- Done when: rule tests cite IRS sources; a single-adult fixture's taxes match a worked example.

**P5.3 Dependents and child tax items**
- Covers: FR-HH-4, FR-TAX-10 (child tax credit), D: OQ-HH-3, D: OQ-TAX-1.
- Files: `src/engine/household/dependents.ts`, `src/engine/tax/credits.ts`.
- Done when: rule tests for the child tax credit, including its phase-out.

**P5.4 State tax interface**
- Covers: FR-HH-6, FR-TAX-9, FR-TAX-11, D: OQ-TAX-2, D: OQ-TAX-4.
- Files: `src/engine/tax/state/{index.ts,parameterized.ts,sc.ts}`, `data/rules/states/sc.json`.
- Steps: the parameterized state model with code hooks; SC moved behind it; dated residence, switching on
  January 1 after a move; unsupported states explained, not computed.
- Done when: SC results unchanged; a state with no income tax returns zero.

**P5.5 Working-years federal items**
- Covers: FR-TAX-10, FR-BLD-9 (tax part), NFR-TEST-11.
- Files: `src/engine/tax/payroll.ts`, `src/engine/tax/deductions.ts`, `data/rules/irs/*`.
- Steps: payroll taxes (wage base, Medicare, Additional Medicare); pre-tax deductions; student loan interest
  deduction; SC 529 deduction; self-employment tax with the shared wage base and half-SE-tax deduction; simple QBI
  deduction (D: OQ-BLD-34); self-employed health insurance deduction.
- Done when: rule tests cite IRS and SC DOR sources.

**P5.6 Property taxes** ∥
- Covers: FR-TAX-13, D: OQ-TAX-5, D: OQ-TAX-6.
- Files: `src/engine/tax/property.ts`, `data/rules/states/*` (levies-personal-property flag).
- Steps: real and personal property taxes as indexed amounts from the bill; both feed SALT when itemizing.
- Done when: unit tests for indexing and the SALT cap interaction.

**P5.7 Joint claiming search**
- Covers: FR-RET-2, FR-RET-3, NFR-SIM-4, D: OQ-RET-1, D: OQ-RET-2.
- Files: `src/engine/recommend/*`, `src/worker/*`.
- Steps: pairs of claiming quarters; spousal benefits both ways; deterministic prefilter then Monte Carlo on the top
  20; one-person search for a single adult; claiming as an assumption more than 10 years before 62.
- Done when: the search finds the known best pair on a synthetic two-earner fixture, within the NFR-SIM-4 budget.

**P5.8 Trust fund, inheritances, pensions, health before 65**
- Covers: FR-RET-4, FR-RET-5, FR-RET-6, FR-RET-7, D: OQ-RET-3, D: OQ-RET-4, D: OQ-RET-6.
- Files: `src/engine/ss/haircut.ts`, `src/engine/sim/inheritance.ts`, `src/engine/cashflow/*`.
- Steps: Trustees Report cut by default for users under 55; several benefactors; DB pensions as annuities with
  survivor percentage; ACA premium tax credit from rule data.
- Done when: rule tests for the premium tax credit; current golden results unchanged.

**P5.9 Long horizons**
- Covers: NFR-SIM-3.
- Files: `bench/longHorizon.bench.ts`, `docs/benchmarks.md`.
- Done when: a 25-year-old's 70-year plan meets the NFR-SIM-3 targets, or the shortfall and its mitigation are
  recorded.

**P5 exit:** every engine test passes for single, married, head-of-household and widowed shapes; the current
household's golden results are unchanged.

---

## P6 — The plan in the file

Goal: the household's ssmodel plan lives in the `.plens` file and starts from ledger balances.

**P6.1 Planning document storage**
- Covers: FR-STO-8, D: OQ-STO-6.
- Files: `src/store/plan/*`.
- Steps: one versioned JSON document table, validated by Zod, with ssmodel's schema migrations; scenario
  assumptions separate from account facts (D: OQ-ROLE-7).
- Done when: unit tests round-trip the document and run its migrations.

**P6.2 YAML import and export**
- Covers: FR-STO-9, FR-MIG-2, FR-GOAL-40.
- Files: `src/schema/yamlio.ts`, `src/app/files/importYaml.ts`.
- Steps: import a household YAML: people, the plan's accounts matched to ledger accounts or created with roles,
  expenses to planning-group accounts; export for fixtures.
- Done when: the current household YAML imports and its golden results are unchanged.

**P6.3 Plan accounts from roles**
- Covers: FR-LED-5, FR-LED-6, FR-ROLE-7, FR-ROLE-11, FR-HH-7, NFR-ARCH-12.
- Files: `src/engine/model/fromLedger.ts`.
- Steps: build the engine's accounts from roles and attributes; starting balances from ledger balances as of the
  base date, with per-scenario overrides; planned accounts; the base date rule.
- Done when: renaming or moving any account leaves results unchanged [NFR-TEST-15].

**P6.4 Retiring Years in the shell**
- Covers: FR-UI-25, FR-RET-9, FR-UI-35, RPT-RET-1, D: OQ-UI-3.
- Files: `src/app/pages/retiring/*`.
- Steps: ssmodel's Console, Setup, Results and Compare as pages of the Retiring Years menu, reading the file's plan;
  scenario tabs only on scenario pages; life-stage collapsing.
- Done when: ssmodel's existing e2e suite passes against the new shell.

**P6 exit:** the household's retirement plan opens from the `.plens` file with the same recommendation as ssmodel.

---

## P7 — Budget

Goal: this year tracked against a budget, and next year (and the year after) planned month by month.

**P7.1 Budget entities**
- Covers: FR-BUD-1, FR-BUD-2, FR-BUD-3, FR-BUD-4, FR-BUD-5, D: OQ-BUD-2, D: OQ-BUD-3, D: OQ-BUD-4, D: OQ-BUD-18.
- Files: `src/ledger/budget/*`, `src/store/actionLog/migrations/0006_budget.ts`.
- Steps: budgets with status; lines on accounts or categories, optional vendor; rollups from the category tree; up to
  three open budgets.
- Done when: unit tests for rollups and the category-line rule.

**P7.2 Pattern engine and calendar expansion**
- Covers: FR-BUD-6, FR-BUD-7, FR-BUD-8, FR-BUD-9, FR-BUD-10, FR-BUD-11, NFR-TEST-10, NFR-SIM-5, D: OQ-BUD-6,
  D: OQ-BUD-7, D: OQ-BUD-8.
- Files: `src/engine/budget/{patterns.ts,expand.ts,profiles.ts}`.
- Steps: recurring, seasonal, one-time, irregular, percentage and loan-payment patterns; every frequency and
  duration; steps; weekend shifting; seasonal profiles summing to the cent.
- Done when: NFR-TEST-10's calendar tests pass; a 300-line budget expands in under 50 ms.

**P7.3 Loan payments and percentage lines**
- Covers: FR-BUD-6 (loan payment, percentage), FR-BUD-22, D: OQ-BUD-11, D: OQ-BUD-16.
- Files: `src/engine/budget/loanPayment.ts`, `src/engine/building/loans.ts` (shared amortization).
- Done when: a mortgage payment splits into interest and principal matching an amortization table; giving at 10% of
  gross follows budgeted and actual income.

**P7.4 Budget editor**
- Covers: FR-BUD-13, FR-BUD-14, D: OQ-BUD-1.
- Files: `src/app/pages/nextYear/editor/*`.
- Steps: grid of lines by category against months; pattern inspector; paste; live surplus or shortfall checks.
- Done when: e2e builds a small budget by keyboard and paste.

**P7.5 Starting a budget**
- Covers: FR-BUD-12, FR-BUD-1 (draft chaining), D: OQ-BUD-13, D: OQ-BUD-14, D: OQ-BUD-19, RPT-LED-9.
- Steps: from last year's budget rolled forward, from actuals (averages or same month), from a template, or blank;
  next year from this year's forecast, the year after from next year's draft.
- Done when: unit tests for each starting point.

**P7.6 Actuals, budget vs. actual, forecast**
- Covers: FR-BUD-15, FR-BUD-16, FR-BUD-17, FR-BUD-18, D: OQ-BUD-5, D: OQ-LED-7, RPT-BUD-1, RPT-BUD-2,
  RPT-BUD-5.
- Files: `src/engine/budget/{actuals.ts,forecast.ts}`, `src/app/pages/thisYear/*`.
- Done when: variance and forecast totals match hand-computed values; unbudgeted accounts appear.

**P7.7 Cash flow, sinking funds, rollover**
- Covers: FR-BUD-19, FR-BUD-20, FR-BUD-21, D: OQ-BUD-9, D: OQ-BUD-10, RPT-BUD-3, RPT-BUD-8.
- Done when: unit tests for earmark balances and rollover; the cash-flow chart flags a month below the floor.

**P7.8 Budget reports**
- Covers: RPT-BUD-4, RPT-BUD-6, RPT-BUD-7, RPT-BUD-9, RPT-BUD-10, FR-BUD-22.
- Done when: each report has a table equivalent and correct totals.

**P7.9 Estimated tax and the plan link**
- Covers: FR-BUD-23, FR-BUD-24, FR-BUD-25, FR-TAX-12, D: OQ-BUD-12, D: OQ-BUD-17.
- Files: `src/engine/budget/toPlan.ts`.
- Steps: next year's budget as plan year 1 (the year after's as year 2), by planning group with indexing after;
  goal-linked lines as contributions; the engine's estimated tax beside withholding.
- Done when: a fixture's plan year 1 totals equal its budget's annual totals.

**P7 exit:** the household runs this year's budget against actuals and has next year's draft feeding the plan.

---

## P8 — Building Years engine

Goal: one simulation from the base date through retirement, with wages, saving and the allocation waterfall.

**P8.1 Wages and contributions**
- Covers: FR-BLD-1, FR-BLD-2, D: OQ-BLD-10, D: OQ-BLD-11, D: OQ-BLD-12, D: OQ-BLD-19.
- Files: `src/engine/building/{wages.ts,contributions.ts}`, `data/rules/irs/limits.json`.
- Steps: wages with growth and dated changes, extending earnings records; contributions with two-tier match;
  deferral, catch-up and age 60–63 limits; Roth catch-up rule; IRA and HSA limits; phase-outs.
- Done when: rule tests cite IRS sources for every limit.

**P8.2 Loans**
- Covers: FR-GOAL-5, FR-GOAL-6, FR-GOAL-7, D: OQ-BLD-7, D: OQ-BLD-9.
- Files: `src/engine/building/loans.ts`.
- Steps: monthly amortization inside each year; avalanche, snowball and targeted extra payments; refinance as a
  dated change; forgiveness date and amount.
- Done when: payoff dates and total interest match amortization tables for each strategy.

**P8.3 One timeline**
- Covers: FR-BLD-3, D: OQ-BLD-1, D: OQ-BLD-20.
- Files: `src/engine/sim/path.ts`, `src/engine/sim/yearStep.ts`.
- Steps: the working years before each retirement date, then ssmodel's retirement logic, sharing balances, taxes and
  random draws; budget years from the budget engine.
- Done when: a near-retiree's results are unchanged; a 30-year-old's path runs to the end of life.

**P8.4 Allocation waterfall**
- Covers: FR-BLD-4, D: OQ-BLD-2, D: OQ-BLD-27.
- Files: `src/engine/building/waterfall.ts`.
- Steps: surplus by the user-ordered priority list (default order); shortfall draws in a user-set order and flags.
- Done when: unit tests for each step of the default order and for a shortfall year.

**P8.5 Self-employment**
- Covers: FR-BLD-8, FR-BLD-10, FR-BLD-11, D: OQ-BLD-13, D: OQ-BLD-35, D: OQ-BLD-36, D: OQ-BLD-37.
- Files: `src/engine/building/selfEmployment.ts`.
- Steps: projected net profit; earnings record; SEP IRA and solo 401(k) limits sharing the deferral limit; estimated
  payments with safe-harbor suggestions.
- Done when: rule tests cite IRS sources; a self-employed fixture's taxes match a worked example.

**P8.6 Outputs, levers, uncertainty, Console**
- Covers: FR-BLD-5, FR-BLD-6, FR-BLD-7, FR-UI-21 (shared Console), D: OQ-UI-4, D: OQ-BLD-3, D: OQ-BLD-21.
- Files: `src/app/pages/building/*`, Console components.
- Steps: one Console with a phase selector; levers for targets, savings rates, retirement dates and wage growth;
  baseline ghost across both phases; household outputs (net worth bands, savings rate, debt-free date).
- Done when: e2e moves a savings-rate lever and sees the effect in both phases.

**P8.7 Reference engine and speed**
- Covers: NFR-TEST-13, NFR-SIM-3.
- Files: `test/reference/*`, `bench/*`.
- Done when: the differential tests cover wages, contributions, the waterfall and loans; NFR-SIM-3 is re-measured.

**P8 exit:** the household's plan runs from next year's budget through both retirements in one simulation.

---

## P9 — Goals

Goal: every goal kind, funded in either phase, on one Goals page.

**P9.1 Goal model and funding**
- Covers: FR-GOAL-1, FR-GOAL-10, FR-GOAL-36, FR-GOAL-37, FR-GOAL-38, FR-GOAL-39, FR-RET-9, D: OQ-BLD-28,
  D: OQ-BLD-31.
- Files: `src/engine/goals/{model.ts,fund.ts}`, `src/store/plan/*`.
- Steps: kind, target, index, priority, importance, funding accounts, contribution plan; waterfall funding while
  working, withdrawals in retirement; must-haves counting toward success; the optional nice-to-have skip.
- Done when: unit tests for funding in each phase and for must-have failure counting.

**P9.2 Goals page and goal detail**
- Covers: FR-UI-19 (Goals), RPT-BLD-1, RPT-BLD-2, RPT-BLD-7, FR-UI-24.
- Files: `src/app/pages/goals/*`.
- Done when: e2e adds a goal, sees it on the timeline and opens its detail.

**P9.3 Flexible dates**
- Covers: FR-GOAL-11, D: OQ-BLD-22.
- Files: `src/engine/goals/earliestDate.ts`.
- Done when: the earliest affordable date matches a brute-force Monte Carlo check on a fixture.

**P9.4 Emergency fund, college, K–12**
- Covers: FR-GOAL-2, FR-GOAL-3, FR-GOAL-12, D: OQ-BLD-4, D: OQ-BLD-5, D: OQ-BLD-6, D: OQ-BLD-17, D: OQ-BLD-23,
  RPT-BLD-6.
- Files: `src/engine/goals/kinds/{emergency,college,k12}.ts`, `data/rules/college/*`, `data/rules/states/sc.json`.
- Done when: rule tests cite sources for college presets and 529 rules.

**P9.5 House purchase, second home, rent vs. buy**
- Covers: FR-GOAL-4, FR-GOAL-19, FR-GOAL-41, D: OQ-BLD-8, D: OQ-BLD-38, RPT-BLD-10.
- Files: `src/engine/goals/kinds/{house,secondHome}.ts`, `src/engine/goals/rentVsBuy.ts`.
- Steps: purchase events creating planned home and mortgage accounts; PMI; carrying costs; rent vs. buy as a pair of
  generated scenarios.
- Done when: the break-even year matches a hand-built spreadsheet for a fixed-return case.

**P9.6 Debts and mortgage paydown goals**
- Covers: FR-GOAL-5, FR-GOAL-6, FR-GOAL-7, FR-GOAL-22, RPT-BLD-4, RPT-BLD-5.
- Done when: the debt-free date and the extra payment needed match P8.2's loan engine.

**P9.7 Vehicles, children, family kinds**
- Covers: FR-GOAL-8, FR-GOAL-9, FR-GOAL-13, FR-GOAL-14, FR-GOAL-15, FR-GOAL-16, D: OQ-BLD-16, D: OQ-BLD-24.
- Done when: a new-child goal adds a dependent, childcare and the child tax credit in its year.

**P9.8 Home projects and repair reserve**
- Covers: FR-GOAL-17, FR-GOAL-18, FR-GOAL-31, D: OQ-BLD-25.
- Done when: a repair reserve spends on each component's due years through retirement.

**P9.9 Independence and the shape of retirement**
- Covers: FR-GOAL-20, FR-GOAL-21, FR-GOAL-30, FR-GOAL-32, FR-GOAL-33, FR-GOAL-34, FR-GOAL-35, FR-RET-8,
  D: OQ-BLD-26, D: OQ-BLD-33, RPT-BLD-9, RPT-RET-3.
- Done when: the financial independence target comes from the plan's spending, with the bridge check; the earliest
  retirement date search works for both adults.

**P9.10 Giving and legacy**
- Covers: FR-GOAL-23, FR-GOAL-24, FR-GOAL-25, FR-GOAL-26, D: OQ-BLD-27, D: OQ-BLD-29, RPT-LIFE-6.
- Done when: gift bunching compares itemizing every N years with giving yearly, using FR-TAX-6.

**P9.11 Education, trips, children's accounts**
- Covers: FR-GOAL-27, FR-GOAL-28, FR-GOAL-29, D: OQ-BLD-30.
- Done when: child-owned accounts show in net worth but not in money available for goals.

**P9.12 Convert ssmodel's one-time expenses**
- Covers: FR-GOAL-40, D: OQ-BLD-32, NFR-TEST-8.
- Done when: the current household's one-time expenses and sale plan become goals, with golden results unchanged.

**P9.13 Whole-life reports**
- Covers: RPT-LIFE-1, RPT-LIFE-2, RPT-LIFE-3, RPT-LIFE-4, RPT-LIFE-5, RPT-BLD-3, RPT-BLD-8, RPT-BLD-11, FR-RPT-4,
  FR-RPT-8.
- Steps: the past-and-future net worth chart (ledger net worth joined to the projected fan at "today"), income
  sources, taxes and spending over life, Compare extended to goals.
- Done when: the net worth chart's past matches RPT-LED-3 and its future matches the Console's fan.

**P9 exit:** every goal kind is available; the household's goals are on one timeline with probabilities.

---

## P10 — Help, samples and onboarding

Goal: someone who has never seen the app can try it, set up a file and find help on every page.

**P10.1 Sample generator**
- Covers: FR-HLP-1, FR-PRD-5, NFR-TEST-12, D: OQ-HLP-3, D: OQ-HLP-4, D: OQ-HLP-7.
- Files: `scripts/samples/*`, `test/samples/*`.
- Steps: seeded generator for the eight households (years of ledger history, budgets, goals, plan), dates shifted
  so "this year" is current, hand-tuned overrides per sample.
- Done when: each sample regenerates identically from its seed, opens with no warnings, and has a golden summary and
  e2e coverage of its main pages.

**P10.2 Try a sample** ∥
- Covers: FR-HLP-2.
- Done when: e2e opens a sample with no password, edits it, and "Save a copy…" makes a real file.

**P10.3 Onboarding wizard**
- Covers: FR-HLP-3, FR-LED-8, FR-PRD-4.
- Files: `src/app/pages/onboarding/*`.
- Done when: e2e completes the wizard for a single adult and a family, each step skippable.

**P10.4 Home dashboard and checklist**
- Covers: FR-UI-34, FR-HLP-4, FR-HLP-5, D: OQ-UI-2, D: OQ-HLP-1.
- Files: `src/app/pages/home/*`.
- Done when: the checklist tracks setup tasks and hides when done; every page has an empty state.

**P10.5 Help system**
- Covers: FR-HLP-7, FR-HLP-8, FR-HLP-9, FR-HLP-10, FR-HLP-11, D: OQ-HLP-2, D: OQ-HLP-5.
- Files: `src/help/**`, `src/app/components/help/*`.
- Steps: Markdown pages built into the app; side panel and F1; search; glossary terms; the optional Stewardship
  section; FR-UI-36 explain-a-number extended to budget totals and goal projections.
- Done when: NFR-TEST-18's help-link check passes on every page.

**P10.6 Diagnostics and release notes** ∥
- Covers: FR-HLP-12, FR-PRD-2, FR-PRD-6.
- Done when: "copy diagnostics" contains no household data (unit test over its output).

---

## P11 — First release

Goal: the first release to family and friends [FR-PRD-8].

**P11.1 Rebrand**
- Covers: FR-UI-32, FR-UI-33, D: OQ-UI-11.
- Files: `vite.config.ts` (manifest), `public/icons/*`, `index.html`, copy across pages.
- Steps: ProvisionLens name, wordmark and icon (made in-house); tagline; `.plens` as the only file handler; a pass
  over wording for voice.
- Done when: the PWA e2e test checks the new manifest and icons.

**P11.2 Accessibility pass**
- Covers: NFR-UI-3, NFR-TEST-18, D: OQ-UI-10.
- Done when: axe checks pass on every page in both themes; every action is reachable by keyboard.

**P11.3 Hosting and releases**
- Covers: FR-PRD-1, FR-PRD-2, FR-PRD-3, FR-PRD-7, D: OQ-PRD-2, D: OQ-PRD-3.
- Steps: static hosting at an unlisted URL (private repo); versioned releases with in-app notes; the yearly
  rule-update checklist in `docs/rule-data.md`; the disclaimer on first run.
- Done when: a release deploys from CI and an installed app picks up the update through the reload prompt.

**P11.4 Repository rename and docs**
- Covers: D: OQ-DEL-1, D: OQ-DEL-2.
- Steps: rename the GitHub repo and package (with the owner's go-ahead); update `CLAUDE.md`, README and doc links;
  archive Checquery's repo.
- Done when: CI is green under the new name.

**P11.5 Release check**
- Covers: FR-PRD-8, NFR-TEST-8, NFR-TEST-12.
- Steps: the whole requirements document walked through against the app, gaps fixed or recorded; every sample
  household reviewed; the household's own file checked.
- Done when: the gap list is empty or each remaining item is agreed as a known issue.

**P11 exit:** the first friend installs the app.

---

## After the first release

- **States**, one task each with rule data, tests and a worked example: NC, GA, FL, NY, VA, PA, then others as users
  need them (D: OQ-TAX-3).
- **Later reports:** RPT-LED-20 recurring charges, RPT-LED-21 unusual transactions, RPT-BUD-11 budget history,
  RPT-RET-2 joint claiming map.
- **Deferred decisions:** the American Opportunity credit next (D: OQ-TAX-1); the 529-to-Roth rollover
  (D: OQ-BLD-6); budget pattern detection (D: OQ-BUD-13); a read-only SQL page (D: OQ-RPT-2); money-weighted
  returns (D: OQ-RPT-8); optional stewardship content (D: OQ-PRD-4).

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| SQLite WASM, OPFS or browser scrypt too slow for the real file | P0 gate before any porting; snapshotting the materialized store; scrypt in WASM |
| Data loss from autosave, crashes or a second device | OPFS working copy and crash recovery; rolling and daily backups; the single-writer lock and device warning; storage e2e tests [NFR-TEST-14] |
| Converting the `.checquery` file is harder than expected | Generic roles at conversion, real roles later in the role map; fallback to export plus import (D: OQ-STO-7) |
| Generalizing ssmodel's engine breaks the current household | Golden continuity at every P5 task [NFR-TEST-8]; the reference engine |
| Monte Carlo too slow over 70-year horizons and joint claiming | P5.9 and P8.7 measurements; deterministic prefilters [NFR-SIM-4]; 500-path previews; Rust/WASM as the last resort [NFR-ARCH-6] |
| Wrong tax rules (self-employment, credits, limits, new states) | Rule data with sources and cited tests [NFR-TEST-11]; worked examples per area |
| Everything-in-one-release scope for one developer | Household uses each milestone as it lands; parallel milestones (P4 ∥ P5); "after the first release" list for anything that can wait |
| Chromium file APIs change | Desktop Chromium only (D5); the FSA mock in e2e catches regressions |
| Real data leaking into git | `private/` git-ignored; samples and fixtures generated from seeds; diagnostics never include household data |
