# Implementation Plan

Status: v1.0 (2026-11-04). Implements [requirements.md](requirements.md) (the v1.0 baseline). Requirement IDs in
brackets, e.g. [FR-SS-2], refer to that document.

Each task is sized for about one working session. Every task lists **Covers** (requirement IDs), **Files** (main
modules touched), and **Done when** (the acceptance check, usually tests). Tasks within a milestone are listed in
dependency order. Tasks marked ∥ can run in parallel with the task before them.

---

## Conventions

- **Layout**

  ```
  src/
    engine/            pure TypeScript, no React/DOM [NFR-ARCH-3]
      core/            dates & SSA ages, money rounding, interpolation
      rules/           typed accessors over data/rules (lookup by year, forward projection [FR-DATA-2])
      ss/              pia, ownBenefit, earningsTest, spouse, survivor, haircut
      tax/             federal, ssTaxation, payroll, sc, irmaa
      accounts/        rmd, inheritedIra, taxable, hsa, home, realEstate
      cashflow/        earnings, income, annuities, expenses, healthcare
      withdraw/        solver, strategies, rothConversion
      sim/             rng, inflation, returns, mortality, inheritance, yearStep, path, deterministic, monteCarlo
      recommend/       metrics, recommend, explain (text), sensitivity
    schema/            Zod schemas (single source of truth for types), YAML I/O, migrations
    worker/            engine.worker.ts, pool.ts, protocol.ts
    state/             store (scenarios, what-if overrides, undo/redo), selectors
    app/               shell, views/{setup,console,results,compare}, components/{grid,lever,kpi,charts}
  data/
    rules/             versioned rule tables (JSON), each with effectiveYear + sourceUrl [NFR-ARCH-4]
    history/           Damodaran + CPI-U CSV [FR-MC-3]
  test/
    fixtures/          synthetic households (YAML) + expected outputs
    reference/         simple reference engine [NFR-TEST-7]
    e2e/               Playwright specs
  private/             git-ignored real household file(s)
  docs/                requirements, plan, worked-examples, rule-data, benchmarks
  ```

- **State management:** Zustand with Immer patches. The patches give undo/redo [FR-UI-13] and what-if overrides
  [FR-UI-8] almost for free.
- **Engine API:** `runDeterministic(input, candidate) → PathResult` and `runMonteCarlo(input, settings, onProgress,
  signal) → CandidateResults[]`. Inputs and results are plain serializable objects so they can cross the worker
  boundary. Every computed value is produced by a small named function, so the v1.1 explain trace can wrap them
  later [FR-UI-14].
- **Definition of done for every task:** `bunx tsc --noEmit`, `bunx biome check`, and `bun test` all pass. New rules
  have unit tests with cited sources [NFR-TEST-1].

---

## M0 — Skeleton and spike

Goal: an empty app that opens and saves a YAML file, plus a measured answer to "is TypeScript fast enough?".

**T0.1 Repository and scaffold**
- Covers: §2, Q-IMP-7, §15 private data.
- Steps:
  - `git init` and a private GitHub remote.
  - Scaffold with `bun create vite` (React + TS), run via `bunx --bun vite`.
  - Tailwind v4 and shadcn/ui init.
  - Biome config.
  - `.gitignore` covering `private/`, `dist/`, `node_modules/`.
  - `CLAUDE.md` with these conventions; `mise.toml` already pins Bun 1.4.4; CI uses the same version.
- Done when: `bun run dev` serves a placeholder page, `bun test` runs one trivial test, and the first commit is
  pushed.

**T0.2 CI** ∥
- Covers: Q-IMP-7, NFR-TEST-4.
- Files: `.github/workflows/ci.yml`.
- Steps: `oven-sh/setup-bun` with `bun-version: 1.4.4` (matching `mise.toml`), then type-check, Biome, `bun test`, then Playwright (Chromium) against `vite preview`.
- Done when: CI is green on main.

**T0.3 Schema v1 and YAML I/O**
- Covers: FR-FILE-2, FR-FILE-3, FR-FILE-4, FR-FILE-8, §9.
- Files: `src/schema/*`, `test/fixtures/minimal.yaml`, `test/fixtures/full.yaml`.
- Steps:
  - Zod schema for the full §9 structure. Fields not yet implemented are optional.
  - Parse and serialize with the `yaml` package, keeping comments.
  - Errors carry the YAML path and line.
  - `schemaVersion` handling and a migration registry, empty for now.
- Done when: both fixtures round-trip byte-stable (or comment-stable); invalid files produce located errors (unit
  tests).

**T0.4 File commands and app shell**
- Covers: FR-FILE-1, 5, 6, 7, §8.2 shell.
- Files: `src/app/shell/*`, `src/app/files/*`.
- Steps:
  - New/Open/Save/Save As/Close using `showOpenFilePicker`/`showSaveFilePicker`, with keyboard shortcuts.
  - Dirty marker and `beforeunload` warning.
  - Recent files: handles stored in IndexedDB.
  - "Chromium required" screen when the API is missing.
  - View switcher and status bar placeholders.
- Done when: a Playwright test (with a mocked FS Access API) opens a fixture, edits a field, saves, and reopens it.

**T0.5 Worker pool and RNG**
- Covers: NFR-ARCH-2, NFR-ARCH-5.
- Files: `src/worker/*`, `src/engine/sim/rng.ts`.
- Steps:
  - Pool sized to `navigator.hardwareConcurrency − 1`.
  - Typed message protocol with progress and cancellation (AbortSignal).
  - xoshiro128\*\* with split streams per (path, variable), so draws don't depend on how work is split across
    workers.
- Done when: the same seed gives identical sequences regardless of worker count (unit test).

**T0.6 Performance spike (decision gate)**
- Covers: NFR-ARCH-6, NFR-SIM-1.
- Files: `bench/yearLoop.bench.ts`, `docs/benchmarks.md`.
- Steps: build a throwaway but realistic yearly loop: 6 accounts, federal brackets, SS taxation, the fixed-point
  withdrawal solve, an IRMAA lookup. Run 33 candidates × 5,000 paths × 35 years in the pool. Record timings.
- Gate:
  - ≤ 5 s: continue as planned.
  - 5–15 s: plan the NFR-ARCH-6 work-reduction steps (direct bracket inversion, coarse→fine candidate grid).
  - \> 15 s after those reductions: raise the Rust/WASM option before M1 grows.

**M0 exit:** a runnable shell with file open/save, CI green, and the benchmark recorded with its gate decision.

---

## M1 — Deterministic engine

Goal: for one fixed claiming date and fixed death ages, a year-by-year table you can audit against the worked
examples and your own statement.

**T1.1 Rule data tables**
- Covers: NFR-ARCH-4, FR-DATA-1, FR-DATA-2, Q-TAX-5.
- Files: `data/rules/*.json`, `src/engine/rules/*`, `docs/rule-data.md`.
- Tables:
  - SSA: FRA by birth year, reduction/DRC constants, COLAs through 2027, AWI series, bend points, taxable maximum,
    earnings-test limits.
  - IRS 2026–2027: brackets, LTCG thresholds, standard and 65+ deductions, senior deduction with phase-out, NIIT.
  - RMD Uniform Lifetime and Single Life tables.
  - CMS Part B/D premiums and IRMAA tiers.
  - SC tax, **verified against SC DOR, source recorded**.
  - SSA period life table.
- Accessors return projected values (with a flag) for years beyond the table.
- Done when: accessor tests pass; `rule-data.md` has the annual checklist; the SC values cite an official source.

**T1.2 Dates and SSA ages**
- Covers: §3.1 claiming window.
- Files: `src/engine/core/dates.ts`.
- Steps: month arithmetic; SSA age (attained the day before the birthday); FRA by birth date; quarterly candidate grid
  that drops dates before the base date [FR-SIM-5].
- Done when: tests cover the 1st-of-month birthday edge cases, the FRA table, and the grid.

**T1.3 PIA from the earnings record**
- Covers: FR-SS-2, FR-SS-2a, NFR-ENG-1.
- Files: `src/engine/ss/pia.ts`.
- Steps:
  - Cap each year at the taxable maximum.
  - Index to the AWI of the age-60 year.
  - Take the top 35 years to get AIME.
  - Apply bend points for the age-62 year; truncate the PIA to the dime.
  - Apply COLAs from 62.
  - Recompute when post-claim earnings replace a lower year.
  - Cross-check against the statement estimate, warning if off by more than 2%.
- Done when: matches SSA's published PIA examples to the dime.

**T1.4 Own benefit and earnings test**
- Covers: FR-SS-1, §3.1.
- Files: `ss/ownBenefit.ts`, `ss/earningsTest.ts`.
- Steps:
  - Early and DRC factors by month.
  - Earnings test: $1 per $2 over the limit; $1 per $3 in the FRA year, counting only months before FRA.
  - Recompute the reduction at FRA so withheld months stop counting as early.
  - Round the monthly benefit down to the dollar.
- Done when: factors at 62, 64y6m, FRA, 70 match SSA tables; an earnings-test worked case passes.

**T1.5 Spouse and survivor** ∥
- Covers: FR-SS-3, §3.2.
- Files: `ss/spouse.ts`, `ss/survivor.ts`.
- Steps:
  - Spouse's PIA derived from her current benefit and claim month.
  - Spousal excess with its reduction, starting the month the Primary files.
  - Survivor benefit: Primary dies before or after claiming, the RIB-LIM floor, the survivor-FRA reduction, and the
    case where the Spouse dies first.
- Done when: unit tests for every branch, plus two cases cross-checked with Open Social Security (recorded as
  fixtures) [NFR-TEST-3].

**T1.6 Trust-fund haircut** ∥
- Covers: FR-TF-1, FR-TF-2.
- Files: `ss/haircut.ts`.
- Done when: presets and custom steps apply to own, spousal and survivor benefits from their effective month.

**T1.7 Federal tax**
- Covers: §3.7, FR-TAX-1, 2, 4.
- Files: `tax/federal.ts`, `tax/ssTaxation.ts`, `tax/payroll.ts`.
- Steps:
  - Ordinary brackets, with LTCG/qualified dividends stacked on top.
  - Standard deduction plus the 65+ amounts.
  - Senior deduction (2025–2028) with phase-out.
  - NIIT.
  - SS taxation via provisional income (Pub 915 worksheet).
  - FICA and SE tax.
  - Filing status MFJ → Single after the first death.
- Done when: Pub 915 worksheet examples and IRS bracket examples pass.

**T1.8 South Carolina tax** ∥
- Covers: §3.7 SC, FR-TAX-1.
- Files: `tax/sc.ts`.
- Steps: start from federal taxable income; SS exempt; retirement and 65+ deductions; capital-gain deduction; rates
  from T1.1.
- Done when: examples built from the SC1040 instructions pass.

**T1.9 Healthcare and IRMAA**
- Covers: FR-EXP-3, FR-TAX-5.
- Files: `cashflow/healthcare.ts`, `tax/irmaa.ts`.
- Steps:
  - COBRA until 65 for each person.
  - Part B and Part D base premiums plus IRMAA, using MAGI from two years earlier (seeded with `priorMagi` for the
    first two years).
  - Medigap and out-of-pocket costs.
  - Medical inflation spread over CPI.
- Done when: tier-crossing tests pass, and the lookback uses the right year.

**T1.10 Core accounts, RMDs, existing inherited IRA**
- Covers: §3.4, FR-ACC-1–5, FR-ACC-8, FR-WD-2.
- Files: `accounts/rmd.ts`, `accounts/inheritedIra.ts`, `accounts/taxable.ts`.
- Steps:
  - Traditional, Roth, taxable (basis, dividend drag) and cash accounts.
  - Fees.
  - RMD age by birth year (73/75), Uniform Table.
  - Inherited IRA: required-beginning-date determination, Single Life divisor minus 1 each year, Even/Back-loaded
    schedules, empty by the deadline.
  - Transfer to the surviving spouse on death [FR-ACC-3].
- Done when: tests cover RMD and inherited-IRA cases, both RMD-required and not.

**T1.11 Earnings, income, expenses** ∥
- Covers: FR-INC-1, FR-INC-2, FR-EXP-1, FR-EXP-2, FR-EXP-4.
- Files: `cashflow/earnings.ts`, `cashflow/income.ts`, `cashflow/expenses.ts`.
- Steps:
  - Indexing modes and one-time items.
  - The mortgage stops at its end date.
  - Survivor step-down applies to `perPerson` items only.
  - Partial-year (monthly) proration.
- Done when: unit tests pass.

**T1.12 Withdrawal solver**
- Covers: FR-WD-1 (Conventional + Bracket-fill), FR-SIM-3 step 5, FR-SIM-4.
- Files: `withdraw/solver.ts`, `withdraw/strategies.ts`.
- Steps:
  - Given required flows and after-tax spending, find gross withdrawals by account so that after-tax cash equals
    spending. Use fixed-point iteration with a $1 tolerance, falling back to bisection.
  - Depletion detection and shortfall recording.
- Done when: convergence tests pass, including near bracket and SS-taxation kinks.

**T1.13 Year step and deterministic path**
- Covers: FR-SIM-1, 2, 3, FR-LIFE-1 (fixed), FR-MC-5.
- Files: `sim/yearStep.ts`, `sim/path.ts`, `sim/deterministic.ts`.
- Steps:
  - The 10-step yearly order, with mid-year returns.
  - Deaths at fixed ages.
  - Real and nominal series.
  - Full state row per year.
- Done when: the minimal and full fixtures produce stable outputs, stored as golden files [NFR-TEST-2].

**T1.14 Reference engine and differential tests**
- Covers: NFR-TEST-7.
- Files: `test/reference/*`, `test/differential.test.ts`.
- Steps: a monthly-loop, deliberately naive engine written independently of T1.13. Property-based tests generate
  random synthetic households (fast-check). Match within $1/yr.
- Done when: 500 random households agree.

**T1.15 Worked examples** ∥
- Covers: NFR-TEST-6.
- Files: `docs/worked-examples.md`, `test/workedExamples.test.ts`.
- Steps: 3–4 cases with the arithmetic shown step by step: PIA, a claim-age benefit, the spousal excess, one year of
  federal + SC tax with SS taxation and the senior deduction, IRMAA, an RMD, an inherited-IRA schedule, one withdrawal
  solve. Each case cites its source worksheet.
- Done when: every figure in the document is asserted by a test.

**T1.16 Editable grid component**
- Covers: FR-UI-3, FR-UI-4.
- Files: `app/components/grid/*`.
- Steps:
  - TanStack Table with keyboard navigation and in-cell editors (currency, percent, date, select).
  - TSV copy/paste of ranges.
  - Add, delete and reorder rows.
  - Per-cell Zod validation messages.
- Done when: component tests pass, plus a Playwright paste test using the SSA earnings-table format.

**T1.17 Setup view (M1 inputs)**
- Covers: §8.1, §8.2 panels.
- Files: `app/views/setup/*`, `state/store.ts`.
- Steps:
  - Section list with these panels: Household, Earnings (with the computed PIA vs. statement), Social Security,
    Accounts (core types), Expenses, Healthcare, Assumptions (deterministic), Strategy (Conventional/Bracket-fill).
  - Completeness checklist.
  - Store with undo/redo [FR-UI-13].
- Done when: you can enter the full fixture by hand and the values match the file.

**T1.18 Results view: year table**
- Covers: FR-OUT-4, FR-OUT-7 (CSV), FR-UI-5.
- Files: `app/views/results/*`.
- Steps: read-only grid with the column groups, a real/nominal toggle, CSV export, debounced automatic recompute.
- Done when: the table matches the engine output for the fixture; the CSV opens in a text editor or LibreOffice.

**T1.19 M1 end-to-end**
- Covers: NFR-TEST-4 (partial).
- Files: `test/e2e/m1.spec.ts`.
- Done when: create, edit, save, reopen, and the table is identical.

**M1 exit / acceptance:** all tests green. Then a manual check with your real file in `private/`:
- the computed PIA is within 2% of your statement;
- the year table looks plausible line by line (SS start, RMDs, inherited-IRA depletion, taxes, IRMAA).

---

## M2 — Uncertainty and recommendation

Goal: the Console. A recommended claiming quarter, backed by Monte Carlo, explorable with sliders.

**T2.1 Inflation and returns**
- Covers: FR-MC-2, FR-MC-3 (parametric), FR-ACC-1.
- Files: `sim/inflation.ts`, `sim/returns.ts`.
- Steps:
  - AR(1) inflation.
  - Per-account correlated lognormal returns: one cross-account correlation plus inflation correlation, via a
    Cholesky factor.
  - Presets (Conservative/Moderate/Aggressive/Cash).
  - Fees.
- Done when: statistical tests confirm the means, standard deviations and correlations [NFR-TEST-5].

**T2.2 Stochastic mortality** ∥
- Covers: FR-LIFE-1, FR-LIFE-2.
- Files: `sim/mortality.ts`.
- Steps: monthly death draws from the SSA period table, with an age offset or multiplier.
- Done when: simulated life expectancy matches the table within tolerance.

**T2.3 Monte Carlo runner**
- Covers: FR-MC-1, FR-MC-4, FR-SIM-5, NFR-SIM-1, FR-UI-9.
- Files: `sim/monteCarlo.ts`, `worker/*`.
- Steps:
  - Paths × candidates sharded across the pool.
  - Common random numbers: each path's draws are keyed by path index only.
  - Progress reporting and cancellation.
  - Progressive mode: 500 paths while dragging, full run on release.
  - Results are percentile summaries, not raw paths, plus the median path's full rows.
- Done when: the result is identical across worker counts; the performance target is re-measured against M0.

**T2.4 Metrics and recommendation**
- Covers: FR-REC-1, FR-REC-2, FR-REC-3, FR-EXP-4.
- Files: `recommend/metrics.ts`, `recommend/recommend.ts`, `recommend/explain.ts`.
- Steps:
  - Success and bequest probabilities.
  - Terminal wealth (heir-tax discount on traditional balances) and minimum balance.
  - PV of SS, lifetime tax, break-even ages.
  - Objective with floors and the fallback rule.
  - Runner-up range (within 2%).
  - Plain-language explanation text.
- Done when: unit tests use synthetic result sets with known answers.

**T2.5 Scenarios and what-if overrides**
- Covers: FR-UI-1, FR-UI-8, FR-UI-13.
- Files: `state/*`, `app/shell/tabs.tsx`.
- Steps:
  - Scenario tabs: new, clone, rename, delete, reorder.
  - An override layer over the scenario, shown as an "N overrides" chip.
  - Apply to scenario, or save as a new scenario; Reset all.
  - Undo/redo across both layers.
- Done when: store tests pass; Playwright clones a tab.

**T2.6 Lever component and Console layout**
- Covers: §8.2 Console wireframe, FR-UI-6, FR-UI-7, FR-UI-7a, NFR-UI-2, FR-UI-17.
- Files: `app/components/lever/*`, `app/views/console/*`.
- Steps:
  - Lever = slider + numeric field, with snap, a saved-value tick, reset, and keyboard steps.
  - The default lever set.
  - "Add to Console" from Setup fields, saved in `consoleLevers`.
  - Fixed regions; show/hide/reorder of tiles and chart tabs, saved in `localStorage`.
- Done when: dragging the claim-age lever updates the deterministic view within the 50 ms budget (measured).

**T2.7 Recommendation card, KPI tiles, charts**
- Covers: FR-OUT-1, 2, 3, FR-UI-11, FR-UI-18, FR-OUT-8.
- Files: `app/components/kpi/*`, `app/components/charts/*`.
- Steps:
  - Recharts via shadcn: claim-age curve with bands and success line, balance fan (total and stacked by account),
    income stack, taxes.
  - Linked hover between the charts and the detail strip.
  - Clicking the curve sets the claim-age lever.
  - Tabular numerals, system theme, compact density.
  - An accessible table for each chart.
- Done when: visual check, and Playwright verifies the linked highlight.

**T2.8 Baseline ghost** ∥
- Covers: FR-UI-10.
- Done when: a pinned baseline shows as dashed series, and the tiles show deltas.

**T2.9 M2 tests**
- Covers: NFR-TEST-2, NFR-TEST-4, NFR-TEST-5.
- Done when: Monte Carlo golden summaries with a fixed seed are stored, and E2E covers the lever → override →
  apply → save flow.

**M2 exit / acceptance:** with your real file, the recommendation and its explanation make sense to you. Success
probabilities and claim-age curve shapes respond as expected to the inflation, return and death-age levers.

---

## M3 — Remaining assets and strategies

**T3.1 Future inheritances**
- Covers: §3.9, FR-INH-1–5, FR-MC-4.
- Files: `sim/inheritance.ts`, `accounts/inheritedIra.ts`.
- Steps:
  - Timing modes: mortality-based (default), fixed date, window.
  - Probability of receipt; real growth and spend-down until receipt.
  - On receipt, create inherited traditional/Roth accounts (the required-beginning-date rule uses the decedent's
    birth date) and add stepped-up non-IRA assets to taxable.
  - If the heir has died: surviving spouse, or lost.
- Done when: unit tests pass; the draws are shared across candidates.

**T3.2 Inherited real estate** ∥
- Covers: FR-INH-7.
- Files: `accounts/realEstate.ts`.
- Steps: sell on receipt, or keep (appreciation, carrying costs, rent, a later planned or backstop sale with capital
  gain over the stepped-up basis).
- Done when: unit tests pass.

**T3.3 With/without-inheritance recommendation**
- Covers: FR-INH-6, FR-REC-2.
- Steps: a second evaluation on the same paths with inheritances removed. The card shows both; the explanation says
  whether they differ.
- Done when: unit tests and a UI check pass.

**T3.4 HSA, 401(k)s, Roth 401(k)**
- Covers: FR-ACC-6, §3.4.
- Steps: HSA pays qualified medical costs first (Part B/D and out-of-pocket, not Medigap); contributions until
  Medicare. Still-working exception for the current employer's plan.
- Done when: unit tests pass.

**T3.5 Annuities** ∥ (may slip)
- Covers: FR-INC-3.
- Steps: COLA, survivor percentage, exclusion ratio until basis is recovered.
- Done when: unit tests pass.

**T3.6 Home equity** (backstop sale may slip)
- Covers: FR-ACC-7.
- Steps: appreciation; planned sale or downsizing; backstop sale at a liquid-asset floor; §121 exclusion; the mortgage
  stops on sale.
- Done when: unit tests pass.

**T3.7 Roth conversions and remaining strategies**
- Covers: FR-WD-1 (Proportional, Custom), FR-WD-2 (Bracket-aware), FR-WD-4, FR-WD-5.
- Steps: conversions up to a bracket and/or IRMAA cap within a year range; the withdrawal-schedule output view
  [FR-OUT-5].
- Done when: unit tests pass, and the reference engine is extended to match (differential tests stay green).

**T3.8 Eligible-designated stretch** ∥ (may slip)
- Covers: FR-ACC-2, FR-INH-1.
- Done when: life-expectancy schedule tests pass.

**T3.9 Setup panels for M3 inputs**
- Covers: §8.2 panels (Home, Inheritances with a real-estate sub-grid, Income, extra account types).
- Done when: the full fixture is editable end to end; E2E adds an inheritance [NFR-TEST-4].

**M3 exit:** all of §3 is implemented. The real file includes your expected inheritance, and the
with/without-inheritance comparison is shown.

---

## M4 — Analysis and polish

**T4.1 Sensitivity**
- Covers: FR-REC-4, FR-OUT-6.
- Steps: a tornado chart and table over longevity, ±2% real return, haircut, and inheritances.

**T4.2 Compare view**
- Covers: FR-UI-2, Q-UX-6.
- Steps: a metrics table with a column per scenario, plus overlaid claim-age curves.

**T4.3 Historical bootstrap** (may slip)
- Covers: FR-MC-3.
- Steps:
  - Bundle the Damodaran and CPI-U CSVs with attribution.
  - Block bootstrap (default block length 5).
  - Per-account proxy mix.
- Done when: statistical tests confirm the resampled means match history.

**T4.4 Warnings panel** ∥
- Covers: FR-UI-15, FR-DATA-2.
- Steps: the full set of warnings, including projected rule-table years.

**T4.5 Display settings, print, accessibility** ∥
- Covers: FR-UI-16, FR-OUT-7, FR-OUT-8, FR-DISC-1.
- Steps: settings for real/nominal, theme, density and number format; a print stylesheet; table equivalents for
  every chart; the disclaimer and rule-table dates.

**M4 exit = v1:** the full test suite is green, CI is green, and the final acceptance with your real file is done.

---

## v1.1

Order: the palette first (small and independent), then the two tax tasks, then explain-a-number last so its
breakdowns cover the new deduction and conversion-funding steps. Same rules as v1: one commit per task, `check:all`
green, goldens regenerated only with the change explained in the commit message.

**T5.1 Command palette**
- Covers: FR-UI-12.
- Steps: a shadcn `Command` dialog on Ctrl/Cmd+K. Views register their actions: file commands, switch view and
  scenario, jump to a Setup panel, pin baseline, reset levers, toggle real/nominal.
- Done when: e2e opens the palette, filters by typing, and runs one action from each group.

**T5.2 Tax on conversion funding**
- Covers: FR-WD-4, FR-TAX-4. Removes the "taxable sales that pay conversion tax" deviation.
- Problem: when taxable shares are sold to pay a conversion's tax (`src/engine/sim/path.ts`, Roth conversion block),
  the realized gain is not added to that year's income, so the conversion looks cheaper than it is.
- Steps:
  - Pay the tax from cash above its reserve target first (no gain realized), then taxable, then the rest of cash.
  - Size the conversion and its funding together. With sale S from taxable at gain fraction g, the tax due is
    T(x, gS), the tax on ordinary income + x with gS more long-term gain, less the tax before the conversion. Solve
    S = T(x, gS) by fixed-point iteration: it converges because the marginal rate on the gain is below 1, and stops
    within $1.
  - The cap "convert less if the tax cannot be paid" uses the full tax, including the gain.
  - Add the gain to the year's long-term gains so the later steps see it: the withdrawal solver, NIIT, Social
    Security taxation, MAGI for IRMAA two years later, and SC's 44% capital-gain deduction.
- Tests:
  - A low-basis taxable account owes more conversion tax than a full-basis one.
  - The year's total tax equals the evaluator on ordinary income + x and LTCG + gS.
  - A gain inside the 0% LTCG bracket adds no federal tax but does add SC tax.
  - Cash above the reserve target is used before taxable.
  - A worked example in `docs/worked-examples.md`.
- Done when: the tests pass and the deviation note is removed from Implementation status.

**T5.3 Itemized deductions**
- Covers: FR-TAX-6 (new).
- Each year the federal deduction is the larger of (a) the standard deduction with the 65+ additions and (b)
  itemized deductions. The OBBBA senior deduction applies either way.
- Itemized deductions (amounts and sources go in `data/rules/federalTax.json`, checked against IRS publications
  when implemented):
  - **State and local taxes (SALT):** the year's SC income tax plus the home's property tax. The cap is $40,000 for
    2025, rising 1% a year through 2029, then $10,000 from 2030. Above $500,000 of MAGI (indexed 1% a year), the
    cap shrinks by 30% of the excess, but not below $10,000 (P.L. 119-21, IRC 164(b)(7)).
  - **Mortgage interest:** the interest part of each payment from the amortization in
    `src/engine/accounts/mortgage.ts`, limited to interest on the first $750,000 of acquisition debt (IRC
    163(h)(3)(F)).
  - **Medical** costs above 7.5% of AGI (IRC 213): Medicare Part B and D premiums including IRMAA, Medigap, COBRA
    and out-of-pocket costs, excluding anything the HSA pays.
  - **Charitable gifts:** from expense items marked deductible (below), less the 0.5%-of-AGI floor from 2026.
  - **Top-bracket limit** from 2026: the deduction's value is capped at 35% for households in the 37% bracket (the
    2/37 reduction).
- **South Carolina:** under Act 110, SC tax starts from federal AGI and uses the SCIAD, so itemizing on the federal
  return does not change SC tax. Confirm this against the SC DOR instructions. It also avoids circularity: compute SC
  tax first, then the SALT deduction, then federal tax.
- **Engine:**
  - `federalEvaluator` gets an itemized-deduction input: fixed amounts (property tax, mortgage interest, charitable
    gifts, medical costs) plus SC tax as a function of AGI. The deduction is computed inside the evaluator, so the
    withdrawal solver sees it.
  - Itemizing adds kinks (the standard-vs-itemized switch, the 7.5% floor, the SALT phase-down). Add solver tests at
    those kinks.
- **Schema:** expense items get an optional `deductible: charity | medical`, so long-term care or other medical
  costs entered as expenses also count. The default is none, so existing files load unchanged and no version bump
  is needed.
- **UI:**
  - A "Tax-deductible" column in the Expenses grid.
  - Year-table columns "Deduction" and "Itemized".
  - An info note in the warnings panel: "Itemizes in N years (first YYYY)".
- **Reference engine:** add an independent implementation of the deduction and extend the differential test with
  random property tax, mortgage, medical costs and charitable gifts.
- Tests:
  - The SALT cap by year (2026, 2029, 2030) and the phase-down at $600,000 of MAGI.
  - Mortgage interest equals the drop in balance subtracted from the payments.
  - The medical 7.5% floor.
  - The standard deduction wins with no home; itemized wins with a large property tax plus interest.
  - The senior deduction is kept when itemizing.
  - The 37% limit.
  - A worked example.
- Done when: the tests and differential checks pass, `docs/rule-data.md` lists the new parameters, and the goldens
  are regenerated with the change explained.

**T5.4 Explain a number** (was T5.2)
- Covers: FR-UI-14.
- Steps:
  - Wrap the engine's named functions to record their inputs and outputs for a selected path and year.
  - The breakdown opens from the year table and the detail strip. It includes the standard-vs-itemized comparison
    and the gain realized to fund conversions.
- Done when: e2e opens a breakdown of federal tax and of a withdrawal, and the parts add up to the shown value.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Monte Carlo too slow in TypeScript | M0 gate (T0.6); work-reduction steps; Rust/WASM port behind the same engine API [NFR-ARCH-6] |
| Withdrawal solver fails to converge at tax kinks | Bisection fallback; kink-focused tests in T1.12; the differential engine catches regressions |
| Wrong rule values (especially SC 2026) | Official sources recorded per table; worked examples; `rule-data.md` checklist |
| No external oracle (no other planner, no spreadsheet) | Worked examples + independent reference engine + Open Social Security cross-checks + PIA vs. statement |
| Scope creep in M3 | The slip list in requirements §15 |
| Real data leaking into git | `private/` git-ignored from the first commit; only synthetic fixtures in tests |

---

## Implementation status (2026-11-05)

M0–M4 (v1) and v1.1 (T5.1 command palette, T5.2 tax on conversion funding, T5.3 itemized deductions, T5.4
explain-a-number) are implemented, with one commit per task.

Deviations and notes:
- **NFR-SIM-1 (5 s for 33 × 5,000):** not met on the development machine (4-core i7-7700). This household's 18
  candidates take about 8 s in Chromium. Mitigations: a 500-path preview first, cancel, and the coarse→fine grid.
  See `docs/benchmarks.md`.
- **NFR-TEST-3 (Open Social Security cross-check):** not automated; there is no API. SSA-published factors and
  percentages are used as test vectors instead.
- **NFR-TEST-7 (reference engine):** covers M1 features. Inheritances, property, annuities and Roth conversions
  have targeted tests rather than differential coverage.
- **Rule data:** ssa.gov blocks automated downloads. The AWI series was checked against SSA's published bend
  points and taxable maximums (1995–2027). IRS and CMS 2027 values were not yet published and are projected.
- **T3.2/T3.6** share one property model: the home and inherited real estate.

v1.1 notes:
- **T5.3:** the reference engine covers the itemized deduction through SC tax, medical and charitable items. It has no
  home model, so property tax and mortgage interest have unit tests only. Property tax inside the carrying costs of
  kept inherited real estate is not itemized (it is not split out).
- **T5.4:** explanations cover the year-table and detail-strip money columns. They are built from a one-year trace
  of the same path (re-run on demand), using the engine's tax and deduction functions on the captured inputs.

Changes after v1:
- **Tooltips:** every data-input label, editable grid column heading and Console lever has a shadcn tooltip of 5–40
  words (longer for esoteric fields). The texts live in `src/app/tips.ts`, keyed by data path so promoted levers
  find theirs; a unit test checks the length and an e2e test checks that no label or heading lacks one.
- **Mortgage payment instead of payoff month (Q-HOME-1, schema version 3):** the mortgage is entered as balance,
  as-of month, rate and the monthly P&I payment actually made, so extra principal payments shorten the loan; the
  payoff month is derived and the final payment is partial. The v2→v3 migration sets the level payment that meets
  the old payoff month and asks the user to check it.
- **Discretionary expenses (Q-EXP-6):** a second expense table with its own scale; two Console sliders and percent
  fields on Assumptions. Existing files load unchanged (new keys with defaults).
- **Mortgage and home costs (Q-HOME-1, schema version 2):** the home carries its mortgage (balance as of a month,
  rate, payoff; payment derived), property tax, insurance and maintenance. A sale pays off the loan; downsizing has
  no new mortgage and reduced costs. The v1→v2 migration drops the old mortgage-expense link and tells the user.
  Saving a migrated file keeps its comments.
