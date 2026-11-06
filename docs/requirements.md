# Requirements: Social Security Claiming Model

Status: v1.0 baseline (2026-11-04). Expands on [idea.md](idea.md). The answers to all five rounds of open
questions have been folded into the numbered requirements and are recorded in the decision log (Section 10). Section 8
covers information architecture, layout and the console controls. Section 15 covers delivery and engineering
conventions. The implementation plan is in [plan.md](plan.md). No questions remain open.

Conventions:
- **MUST / SHOULD / MAY** follow RFC 2119.
- Requirement IDs (`FR-…`, `NFR-…`) are stable so tests and code comments can cite them.
- "Husband" and "wife" follow idea.md. Internally the app uses **Primary** (the worker whose claiming date is being
  decided) and **Spouse**.
- Decision references such as *(D: Q-SS-3)* point to the decision log.

---

## 1. Purpose and scope

### 1.1 Problem

A married couple has to decide when the Primary starts Social Security retirement benefits. The Spouse is already
collecting. Starting earlier gives a smaller monthly benefit for more months. Starting later gives a larger,
inflation-indexed benefit, and the higher amount also continues as the survivor benefit. Delay is paid for by drawing
down savings in the meantime. Those savings sit in accounts with different tax treatment. Inherited IRAs, both the
existing one and any received later, must be emptied by fixed deadlines. Inflation, investment returns, longevity, the
timing and size of future inheritances, and the solvency of the trust fund are all uncertain.

### 1.2 Goal

Give a clear **recommended claiming age (to the quarter)** for the Primary. Back it with:
- comparative metrics for each candidate claiming date, under uncertainty;
- a year-by-year projection of income, taxes, expenses, withdrawals by account, and balances;
- a recommended withdrawal schedule by account type.

### 1.3 Scope

- The app serves **one household**: a married couple, Primary + Spouse *(D: Q-ARCH-5)*. Single filers and households
  without spousal benefits don't need to be supported, although the engine shouldn't make them impossible.
- Out of scope for v1:
  - Advice on specific investments or securities.
  - Disability (SSDI), child benefits, divorced-spouse benefits.
  - Defined-benefit pensions *(D: Q-ACC-3)*.
  - Suspending benefits at FRA, or withdrawing an application within 12 months *(D: Q-SS-5)*.
  - Uncertain trust-fund haircuts (planned for v2) *(D: Q-TF-1)*.
  - Joint optimization of decisions other than the Primary's claiming date (see FR-REC-5).
  - Multi-user collaboration, cloud sync, any server-side processing, PWA/offline install *(D: Q-ARCH-6)*.
  - Browsers other than Chromium-based ones *(D: Q-ARCH-1)*.
  - Long-term care as a modeled risk. It can be entered as ordinary expense items; a stochastic LTC event may come
    later *(D: Q-IMP-8)*.

---

## 2. Architecture and technology

| Concern | Decision |
|---|---|
| Runtime / package manager | **Bun 1.4.4**, pinned with mise (`mise.toml`); no Node/npm in scripts |
| Language | **TypeScript**, `strict` mode |
| UI | **React**, **Tailwind CSS**, **shadcn/ui** |
| Build / dev server | **Vite running on Bun** (`bunx --bun vite`) *(D: Q-ARCH-2)* |
| Editable grids | **TanStack Table** with custom cell editing *(D: Q-ARCH-3)* |
| Charts | **Recharts** via shadcn chart components *(D: Q-ARCH-4)* |
| Schema validation | Zod |
| YAML | `yaml` package (keeps comments when round-tripping) |
| Lint / format | **Biome** *(D: Q-IMP-7)* |
| Unit tests | `bun test` |
| E2E tests | **Playwright**, run via `bunx playwright test` |
| Browsers | **Chromium-based only** (Chrome, Edge, Brave, Opera) *(D: Q-ARCH-1)* |
| Hosting | **Local only**: `bun run dev`, or `bun run build` + `bun run preview` *(D: Q-ARCH-7)* |
| Source control / CI | git, private GitHub repository, GitHub Actions running type-check, Biome, `bun test` and Playwright *(D: Q-IMP-7)* |
| Persistence | Local YAML files through the **File System Access API** |

- **NFR-ARCH-1** The app MUST run entirely client-side. It MUST make no network requests except fetching its own
  static assets.
- **NFR-ARCH-2** Simulation MUST run in a pool of **Web Workers** so the UI stays responsive.
- **NFR-ARCH-3** The calculation engine MUST be a pure TypeScript module that doesn't depend on React or the DOM, so
  `bun test` can test it directly and it could later run from a CLI.
- **NFR-ARCH-4** Rule tables MUST be versioned data files bundled with the app, kept separate from logic. Each table
  records its effective year and source URL. Rule tables include: SSA parameters, AWI and bend points, COLAs, tax
  brackets, SC tax, RMD Uniform and Single Life tables, IRMAA tiers, Medicare premiums, SSA life tables, and
  historical return series.
- **NFR-ARCH-5** Random number generation MUST use a seedable PRNG (e.g. PCG32 or xoshiro128\*\*). With the same
  inputs and seed, results MUST be identical across runs.
- **NFR-ARCH-6** The engine is written in TypeScript. We reviewed Tauri + Rust and decided against it for now. Benchmark
  the core yearly loop, including the tax solve, early against NFR-SIM-1. If it misses the target, first cut the work
  (compute brackets directly instead of iterating, refine the claiming grid near the best date, use fewer paths for the
  live preview). Only after that, port the engine to Rust compiled to WebAssembly behind the same interface. Tauri is
  needed only if a native desktop app becomes a goal.

### 2.1 File handling

- **FR-FILE-1** Standard document commands: **New, Open…, Save, Save As…, Close**, with keyboard shortcuts
  (Ctrl/Cmd+N/O/S, Shift+Ctrl/Cmd+S).
- **FR-FILE-2** Files hold **inputs only**, as YAML. Outputs are recomputed whenever a file loads or an input changes.
- **FR-FILE-3** Each file has a `schemaVersion`. The app MUST migrate older versions forward on load and MUST refuse,
  with a clear message, files from a newer version than it supports.
- **FR-FILE-4** Validate on load with Zod. Errors name the YAML path and line where possible.
- **FR-FILE-5** Track unsaved changes. The title shows a modified marker, and the app warns on close/navigate when there
  are unsaved changes (`beforeunload`).
- **FR-FILE-6** Keep a recent-files list by storing `FileSystemFileHandle`s in IndexedDB. Re-request permission on
  reopen.
- **FR-FILE-7** In a browser without `showOpenFilePicker`, show a clear "Chromium-based browser required" message
  instead of the app. There is no fallback.
- **FR-FILE-8** Save the random seed and simulation settings in the file so results can be reproduced.

One file = one **household** containing one or more **scenarios** (tabs). Household facts (people, birth dates,
earnings history) are shared by all scenarios. Everything else is per scenario, so it can be varied by cloning.

---

## 3. Domain model and rules

This section records the rules the engine has to implement. Dollar figures are for 2026/2027 and belong in rule tables
(NFR-ARCH-4), not in code.

### 3.1 Social Security: Primary's own retirement benefit

- **PIA and FRA.** The benefit is based on the Primary Insurance Amount (PIA), which is payable at Full Retirement Age
  (FRA). FRA is **67** for anyone born in 1960 or later. It is 66 + 2 months per year for births 1955–1959.
- **Claiming window.** From age 62 (first full month at 62; an SSA "age" is attained the day before the birthday) to
  age 70. Candidate claiming dates that fall before the base date are excluded.
- **Early reduction.** 5/9 of 1% per month for the first 36 months before FRA, then 5/12 of 1% for each further month.
  At 62 with an FRA of 67, the benefit is 70% of PIA.
- **Delayed retirement credits (DRCs).** 2/3 of 1% per month (8% a year) after FRA, up to age 70. At 70 with an FRA of
  67, the benefit is 124% of PIA.
- **COLA.** The PIA gets every COLA from the year the Primary turns 62, whether or not they have claimed. Actual COLAs
  come from data: 2026 = 2.8%, **2027 = 3.6%**. After that, COLA follows simulated inflation *(D: Q-STOCH-3)*.
- **Timing.** Benefits for a month are paid the following month. The model ignores this one-month lag.
- **Earnings test.** Applies to months before FRA when benefits have been claimed and the person still has earned
  income. 2027 exempt amounts: **$25,560/yr** below FRA ($1 withheld per $2 over); **$67,920** in the calendar year FRA
  is reached ($1 per $3 over, months before FRA only). At FRA, the reduction is recomputed so that months with
  withheld benefits no longer count as early months. This MUST be modeled, because earned income is an input
  *(D: Q-INC-1)*.
- **Inputs** *(D: Q-SS-1)*: the **FRA estimate** from the SSA statement, its "as of" date, and **projected earnings by
  calendar year** (2026, 2027, …) for both spouses. Earnings serve four purposes:
  1. income in the cash-flow model (FR-INC-1);
  2. payroll tax (FICA 7.65% for wages, SE tax 15.3% for self-employment, up to the $192,300 taxable maximum in 2027);
  3. the earnings test;
  4. computing the Primary's PIA (FR-SS-2). The statement estimate assumes earnings continue at the latest level until
     FRA, so stopping earlier lowers the PIA and earning more raises it.
- **Earnings record** *(D: Q-SS-6)*: the Primary's **past taxed Social Security earnings by year**, pasted from the SSA
  statement's earnings table into a grid, plus the projected earnings above.
- **FR-SS-1** The engine MUST compute the Primary's monthly benefit for any claiming month from 62y0m to 70y0m,
  including COLAs and the earnings test.
- **FR-SS-2** The engine MUST compute the Primary's PIA exactly from the earnings record plus projected earnings
  *(D: Q-SS-6)*:
  1. Cap each year's earnings at that year's taxable maximum.
  2. Index earnings to the **AWI of the year he turns 60**. Earnings from age 60 on count at face value.
  3. Average the highest 35 years and divide by 12 to get AIME (divide the total by 420 months).
  4. Apply the PIA formula (90% / 32% / 15%) with the **bend points for the year he turns 62**.
  5. Apply COLAs from age 62 onward.

  AWI, bend points and taxable maximums come from rule data. If future AWI values are needed, they grow at simulated
  inflation plus a real-wage-growth assumption (default 1.1%). Earnings after he claims that replace a lower year
  raise the PIA from the following year (SSA's automatic recomputation).
- **FR-SS-2a** Cross-check: when the projected earnings match the statement's assumption (latest year's earnings
  continued to FRA), compare the computed PIA with the statement's FRA estimate. If they differ by more than 2%, show a
  warning.

### 3.2 Social Security: Spouse

The Spouse is **already receiving benefits on her own record**, and her PIA is lower than the Primary's *(D: Q-SS-4)*.

- **Inputs** *(D: Q-SS-3)*: her **current monthly benefit**, the **month she claimed**, and her **birth date**. The
  engine derives her PIA exactly: current benefit ÷ the early-reduction (or DRC) factor for her claiming age relative
  to her FRA. COLAs are already in the current benefit, so the result is her PIA in current dollars. There is no
  manual spousal-fraction override.
- **Spousal benefit.** Up to **50% of the Primary's PIA** (never the DRC-boosted amount), and it can't start before
  the Primary files. SSA pays her own benefit plus a **spousal excess** = max(0, 50% × PIA_primary − PIA_spouse). The
  engine handles the zero case even though Q-SS-4 suggests the excess will be positive.
- **Spousal reduction.** If the spousal excess starts before the Spouse's FRA, it is reduced by 25/36 of 1% per month
  for the first 36 months, then 5/12 of 1% per month. Her own benefit keeps the reduction it got when she claimed.
- **Deemed filing.** For anyone born after Jan 1, 1954, filing for one benefit counts as filing for all of them. So
  the spousal excess starts automatically in the month the Primary files.
- **Survivor benefit.** When either spouse dies, the survivor keeps the **larger** of the two benefits:
  - If the Primary dies after claiming, the Spouse gets his actual benefit, DRCs included. The RIB-LIM rule sets a
    floor when he claimed early: the larger of his reduced benefit or 82.5% of PIA.
  - If he dies before claiming, her benefit is based on his PIA, plus any DRCs earned up to his death.
  - If she takes the survivor benefit before her **survivor FRA**, it is reduced: a linear reduction reaching 28.5% at
    age 60.
  - The survivor benefit is the main reason delaying can be worth it, so it MUST be modeled.
- **FR-SS-3** Model the Spouse's own benefit, the spousal excess that begins when the Primary files, and survivor
  benefits after the first death (for either spouse dying first).

### 3.3 Trust fund solvency

- The **2026 Trustees Report** projects the OASI trust fund running out in **Q4 2032**, after which about **78%** of
  scheduled benefits are payable. Combined OASDI runs out in **2034** at about **83%**, falling toward 65% by 2100.
- **FR-TF-1** Accept a benefit haircut schedule: a list of `{ effectiveDate, payablePercent }` steps applied to all
  benefits (own, spousal, survivor) from that date. The schedule is a fixed assumption in v1 *(D: Q-TF-1)*.
- **FR-TF-2** Provide presets: *No cut*, *Trustees 2026 OASI (78% from 2033)*, *Trustees 2026 OASDI (83% from 2034)*,
  *Custom*.

### 3.4 Accounts and assets

| Type | Tax treatment | Withdrawals | Special rules |
|---|---|---|---|
| **Traditional IRA** | Pre-tax | Ordinary income | RMDs from age **73** (born 1951–59) or **75** (born 1960+) |
| **Employer 401(k)/403(b)** — traditional | Pre-tax | Ordinary income | Same RMD rules. The *still-working exception* defers RMDs from the current employer's plan while employed. |
| **Employer 401(k)** — Roth | After-tax | Tax-free | No lifetime RMDs since 2024 |
| **Roth IRA** | After-tax | Tax-free; all withdrawals assumed qualified *(D: Q-ACC-5)* | No lifetime RMDs |
| **Inherited IRA — traditional** | Pre-tax | Ordinary income | 10-year rule. Annual RMDs in years 1–9 if the original owner died on or after their required beginning date. See FR-ACC-2. |
| **Inherited IRA — Roth** | After-tax | Tax-free | 10-year rule. No annual RMDs. |
| **HSA** | Pre-tax in, tax-free growth | Tax-free for qualified medical costs, including Medicare premiums but not Medigap. After 65, non-medical withdrawals are ordinary income. | Contributions stop when enrolled in Medicare |
| **Taxable brokerage** | After-tax | Gains at LTCG rates; dividends/interest taxed yearly | Cost-basis tracking |
| **Cash reserve** | After-tax | Interest is ordinary income | Target balance (months of expenses) |
| **Home equity** | Not a liquid account | Proceeds only when sold | See FR-ACC-7 |

Annuities are income streams (FR-INC-3), not accounts. All asset types above are in scope *(D: Q-ACC-3)*.

- **FR-ACC-1** Each account has an owner (Primary, Spouse, or Joint for taxable/cash/home), a starting balance on the
  base date, **its own return model (mean and volatility)** *(D: Q-STOCH-2)*, and an **annual fee/expense ratio** that
  is subtracted from returns *(D: Q-STOCH-4)*. Each account's return assumptions are fixed for the whole horizon; there
  is no glide path *(D: Q-ACC-4)*.
- **FR-ACC-2** Inherited IRA inputs *(D: Q-ACC-1)*:
  - traditional or Roth;
  - the beneficiary (Primary or Spouse);
  - the original owner's birth date and date of death;
  - the beneficiary class: *designated* (10-year rule) or *eligible designated* (life-expectancy stretch, e.g. not
    more than 10 years younger than the decedent).

  The engine derives the rest:
  - the depletion deadline: Dec 31 of the death year + 10;
  - whether annual RMDs apply: traditional only, and only if the owner died on or after their required beginning
    date, i.e. April 1 of the year after the year they reached RMD age;
  - the RMD divisor: the IRS Single Life Table factor for the beneficiary's age in the year after the death, reduced
    by 1 each year.
- **FR-ACC-3** If an inherited IRA's beneficiary dies before the deadline, the account passes to the surviving spouse
  and keeps the **original** deadline and schedule *(D: Q-ACC-2)*.
- **FR-ACC-4** Taxable account inputs: cost basis, and dividend/interest yield, so the yearly tax drag can be modeled.
- **FR-ACC-5** On the first death, the survivor takes over the decedent's own IRAs, 401(k)s and HSA as a spouse.
  Inherited IRAs are handled under FR-ACC-3.
- **FR-ACC-6** HSA inputs: balance, optional annual contribution until Medicare enrollment, and whether the HSA pays
  qualified medical costs first (default yes).
- **FR-ACC-7** Home equity inputs: current value, cost basis, appreciation (mean/volatility), an optional
  **mortgage**, annual **home costs**, and an optional **sale** *(D: Q-HOME-1)*.
  - Mortgage (fixed rate, from a statement): principal balance **as of a given month** (after that month's payment),
    interest rate and the **monthly principal-and-interest payment** actually made (escrow excluded; regular extra
    principal included). The payoff month is derived by amortization and shown; the last payment is only what is
    owed. The payment is fixed in dollars and runs to payoff while the home is owned.
  - Home costs: property tax, homeowners insurance and maintenance, per year in base-date dollars and
    inflation-indexed. They are paid every year the home is owned (also after the loan is paid off) and end at a sale.
  - Sale: on a planned date, or a **backstop** (sell when liquid assets fall below a threshold). Inputs: selling costs
    (%) and an optional replacement-home cost (downsizing). The mortgage balance is paid from the proceeds; the rest,
    less any replacement cost, goes to the taxable account. Gain above the Section 121 exclusion ($500k MFJ, $250k
    single) is a capital gain; the loan does not change the gain.
  - Downsizing: the replacement home is bought with cash (no new mortgage). Its property tax, insurance and
    maintenance are the old home's reduced by a percentage entered for each.
  - Home equity is **not** counted as liquid when testing for depletion. It is reported separately and included in
    terminal wealth net of selling costs and any mortgage balance still owed.
  - Mortgage interest and property tax are itemizable deductions (FR-TAX-6).
- **FR-ACC-8** Cash reserve: balance, interest rate, and target months of expenses. The withdrawal logic refills it
  first (optional).

### 3.5 Income other than Social Security

- **FR-INC-1** **Earned income by calendar year** for each spouse: a grid of `{ year, wages, selfEmployment }`
  *(D: Q-INC-1, Q-SS-1)*. It feeds cash flow, payroll/SE tax, the earnings test, and the PIA (Q-SS-6).
- **FR-INC-2** Other income streams `{ label, owner, annualAmount, startDate, endDate, indexing, taxCharacter }`, e.g.
  rental income or part-time work after the grid ends. There are no pensions *(D: Q-ACC-3)*.
- **FR-INC-3** **Annuities**: `{ label, owner, monthlyPayment, startDate, colaPercent, survivorPercent, qualified:
  bool, exclusionRatio }`. Qualified annuities are fully taxable. For non-qualified annuities, the exclusion-ratio
  portion is tax-free until basis is recovered. Payments drop to `survivorPercent` after the owner's death.

### 3.6 Expenses

- **FR-EXP-1** Expenses are entered as **after-tax spending**. The engine solves for the gross withdrawals needed to
  cover spending plus taxes *(D: Q-EXP-1)*. Expense items: `{ label, annualAmount (base-date dollars), startDate,
  endDate | null, indexing: 'inflation' | 'none' | fixed rate, oneTime: bool }`.
  - The home's mortgage, property tax, insurance and maintenance are entered with the home (FR-ACC-7), not as expense
    items. A fixed nominal payment unrelated to the home can use `indexing: none`.
  - One-time item (e.g. a home improvement): one date, one amount.
  - Ongoing living expenses: inflation-indexed, no end date.
- **FR-EXP-1a** Expenses are entered in two tables with the same columns *(D: Q-EXP-6)*: **nondiscretionary** (needs)
  and **discretionary** (wants: travel, gifts, hobbies). Each has its own scale (Assumptions and a Console slider).
  Healthcare and home costs are scaled by neither.
- **FR-EXP-2** After the first death, spending drops to **75%** of the couple's level by default, editable per
  scenario *(D: Q-EXP-2)*. The fraction applies to items flagged `perPerson: true` (default: living expenses). It does
  not apply to fixed items or to home costs (FR-ACC-7).
- **FR-EXP-3** **Healthcare is modeled separately** *(D: Q-EXP-3)*, for each person:
  - Before Medicare (under 65): **COBRA at a fixed premium** *(D: Q-EXP-5)*, entered as a monthly premium per person
    with a start date, plus out-of-pocket costs. COBRA is assumed to last **until each person reaches 65**, so there
    is no coverage gap and no individual/ACA plan to model *(D: Q-EXP-6)*. There's no subsidy modeling, so pre-65
    premiums don't depend on income. COBRA doesn't count as current employment coverage for Medicare, so Part B
    enrollment is assumed at 65.
  - From 65: Medicare **Part B** and **Part D** base premiums from data, **IRMAA** surcharges (FR-TAX-5), **Medigap**
    or Medicare Advantage premium, and out-of-pocket costs.
  - Healthcare uses its own **medical inflation rate**, set as a spread over CPI (default +1.5%).
  - Part B/D premiums and out-of-pocket costs MAY be paid from the HSA (FR-ACC-6). Medigap premiums can't be.
- **FR-EXP-4** **Bequest target** *(D: Q-EXP-4)*: a real (base-date dollars), after-tax terminal-wealth target. A path
  meets it if after-tax wealth at the second death, including home equity net of selling costs, is at least the
  target. It is used in the recommendation (FR-REC-2).

### 3.7 Taxes

Full federal and South Carolina income tax is computed *(D: Q-TAX-1, Q-TAX-2)*.

- **Taxation of benefits.** Provisional income = AGI excluding SS + tax-exempt interest + 50% of SS. MFJ thresholds
  are **$32,000 / $44,000**, single thresholds **$25,000 / $34,000**. These are not indexed. Up to 50% / 85% of
  benefits become taxable.
- **Federal income tax.**
  - Ordinary brackets.
  - LTCG/qualified dividend brackets at 0/15/20%.
  - Standard deduction plus the additional amount per person 65+.
  - The **OBBBA senior deduction**: $6,000 per person 65+, phasing out above $150k MAGI (MFJ).
  - NIIT at 3.8% above $250k MAGI (MFJ).
  - Payroll and SE tax on earnings (Section 3.1).
- **Filing status** switches from MFJ to Single in the year after the first death.
- **Tax law assumption** *(D: Q-TAX-4)*: current law as enacted today, with no future legislative changes. The TCJA
  brackets are permanent under OBBBA. The senior deduction **expires after 2028** as scheduled. Brackets, standard
  deduction and IRMAA thresholds are inflation-indexed. The SS-taxation thresholds and the NIIT threshold are not
  indexed.
- **South Carolina** *(D: Q-TAX-2; no move planned)*:
  - Social Security benefits are **fully exempt**.
  - Retirement income deduction (per person) and the age-65 deduction apply to IRA/401(k) withdrawals and annuity
    income.
  - Net long-term capital gains get a partial deduction.
  - SC starts from federal taxable income.
  - Rates and deduction amounts come from rule data. Published sources currently disagree on 2026 SC rates
    (possibly a new two-bracket structure under 2026 legislation) and deduction amounts. **Implementation task**
    *(D: Q-TAX-5)*: verify these values against SC DOR publications (the 2026 SC1040 instructions or the enacted act)
    before the SC rule table is finished, and record the source URL in the table.
  - SC has no estate or inheritance tax.
- **FR-TAX-1** Compute federal and SC tax every year on each simulated path.
- **FR-TAX-2** Indexed thresholds after the last published year grow with simulated inflation.
- **FR-TAX-3** Tax law is versioned data (NFR-ARCH-4).
- **FR-TAX-4** RMDs, inherited-IRA withdrawals, Roth conversions, home-sale gains and the taxable part of inheritances
  (none for non-IRA assets; see 3.9) all flow into AGI/MAGI.
- **FR-TAX-5** **IRMAA** MUST be modeled *(D: Q-TAX-3)*. Each year's Part B and Part D surcharge uses the household's
  MAGI from two years earlier. Tier thresholds are inflation-indexed from data. For MAGI in 2025 and 2026 (before the
  model starts), the user enters the actual values.
- **FR-TAX-6** **Itemized deductions** *(D: Q-TAX-5)*. Each year the federal deduction is the larger of the standard
  deduction (with the 65+ additions) and itemized deductions; the senior deduction applies either way.
  - Itemized deductions: SALT (SC income tax plus home property tax), capped at $40,000 in 2025, rising 1% a year
    through 2029 and $10,000 from 2030, with the cap phased down above $500,000 of MAGI to a $10,000 floor.
  - Mortgage interest on up to $750,000 of acquisition debt.
  - Medical costs above 7.5% of AGI: Medicare premiums including IRMAA, Medigap, COBRA, out-of-pocket costs, and
    expense items marked medical, excluding HSA-paid amounts.
  - Charitable gifts (expense items marked charity) above 0.5% of AGI from 2026.
  - The 2/37 top-bracket limitation from 2026.
  - SC tax is unaffected (it starts from AGI with the SCIAD).
  - The year table shows the deduction used.

### 3.8 Longevity

- **FR-LIFE-1** Support both (a) a fixed death age per person and (b) stochastic mortality from the **SSA period life
  table**. Stochastic is the default for the recommendation *(D: Q-LIFE-1)*. A per-person health adjustment (age
  offset or mortality multiplier) is available. The default is none.
- **FR-LIFE-2** In stochastic mode, each Monte Carlo path draws a death date for each spouse independently.

### 3.9 Future inheritances (new)

The household expects to inherit in the future. Each expected inheritance can include any combination of a
**traditional IRA**, a **Roth IRA**, and **non-IRA assets** (brokerage, cash, real estate). Rules for heirs who are
not the decedent's spouse:

| Inherited asset | What the engine does | Tax |
|---|---|---|
| Traditional IRA (incl. 401(k)) | Creates a new **inherited traditional IRA** account on receipt, beneficiary = heir. 10-year deadline from the decedent's death year. Annual RMDs in years 1–9 if the decedent died on or after their required beginning date (derived from the decedent's birth date and the death date, FR-ACC-2). | Withdrawals are ordinary income (federal + SC) |
| Roth IRA | Creates a new **inherited Roth IRA** account. 10-year deadline, no annual RMDs. | Tax-free; the 5-year rule is assumed satisfied |
| Non-IRA financial assets | Added to the **taxable account** (or cash) on receipt. Cost basis is **stepped up** to fair market value at death (IRC §1014), so the new basis = amount received. | No income tax when received. Federal estate tax (2026 exemption $15M per decedent, indexed) is the estate's concern, not the heir's. SC has no inheritance tax. |
| Real estate | Either **sold on receipt** (net of selling costs, into taxable) or **kept** (FR-INH-7). Basis is stepped up to value at death. | Gain on a later sale is a capital gain. There is no §121 exclusion unless the property becomes the primary residence for 2 of the 5 years before the sale. |

- **FR-INH-1** A scenario has a list of expected inheritances. Each has:
  - `label` (e.g. "Mother's estate");
  - `heir`: Primary or Spouse. IRAs pass to one named beneficiary;
  - `decedentBirthDate` and `decedentSex`, used for the RMD determination and for mortality-based timing. Each
    inheritance has **one decedent**. There is no "second of two deaths" timing *(D: Q-INH-1)*;
  - `timing`: **mortality-based** (the default; drawn per path from the SSA life table for the decedent's birth date
    and sex, optionally with a health offset), or a **fixed** date, or a **window** (uniform between two dates)
    *(D: Q-INH-1)*;
  - amounts by type: `traditionalIra`, `rothIra`, `nonIra`, each in **base-date dollars as of today**, plus an
    optional list of real-estate items (FR-INH-7) *(D: Q-INH-4)*;
  - `growth`: how each amount changes until receipt. The default is fixed real growth of 0%; a per-type
    return/volatility is also available. Either can be combined with an optional annual **spend-down** (e.g.
    long-term-care costs) *(D: Q-INH-4)*;
  - `probability` that it is received at all (default 100%);
  - `beneficiaryClass` for the IRA parts. The default is *designated* (10-year rule); *eligible designated*
    (life-expectancy stretch) is supported *(D: Q-INH-5)*.
- **FR-INH-2** On receipt, the engine creates the inherited accounts and adds them to the withdrawal strategy.
  Inherited traditional IRAs use the inherited-IRA schedule options (FR-WD-2). Inherited Roth IRAs default to
  **back-loaded**: grow tax-free and withdraw at the deadline or when needed.
- **FR-INH-3** Each inheritance is drawn per path (timing, receipt, growth). The same draws are used for every
  candidate claiming date (FR-MC-4).
- **FR-INH-4** If the heir has already died when the inheritance arrives on a path, it passes to the **surviving
  spouse** by default. A per-inheritance option marks it **lost to the household** instead *(D: Q-INH-2)*. If both
  spouses have died, the inheritance is ignored.
- **FR-INH-5** The year-by-year output shows inheritances received by type. The fan chart marks when they arrive (the
  median date in stochastic mode).
- **FR-INH-6** The **headline recommendation includes inheritances**, weighted by their probability. The
  recommendation card MUST always show the **without-inheritances** recommendation next to it, and the explanation
  MUST say whether the date differs *(D: Q-INH-3)*. The sensitivity view (FR-REC-4) includes with vs. without
  inheritances.
- **FR-INH-7** **Inherited real estate** *(D: Q-INH-6)*. Each item has `{ label, value (base-date dollars),
  disposition: 'sell_on_receipt' | 'keep', sellingCostPct }`.
  - *Sell on receipt*: net proceeds go to the taxable account, with basis equal to value at death, so there is
    essentially no gain.
  - *Keep*: the property becomes a non-liquid asset with:
    - `appreciation` (mean/volatility);
    - annual **carrying costs** in base-date dollars, inflation-indexed (property tax, insurance, maintenance),
      added to expenses;
    - optional net **rental income**, taxed as ordinary income (depreciation is ignored in v1);
    - an optional **later sale**: a planned date, or a backstop when liquid assets fall below a threshold, like
      FR-ACC-7. On sale, gain over the stepped-up basis is taxed as a capital gain.

    Kept real estate is reported with home equity and counts toward terminal wealth net of selling costs.

---

## 4. Stochastic modeling

- **FR-MC-1** Monte Carlo with a configurable number of paths (default 5,000, range 100–100,000) and a seed.
- **FR-MC-2** Variables drawn per path per year:
  - inflation (CPI), which drives COLA, indexed expenses, medical inflation (CPI + spread) and tax brackets;
  - the return on **each account** (and on home equity and pre-receipt inheritance growth, if volatile);
  - death dates for both spouses (if stochastic, FR-LIFE-1);
  - inheritance timing and receipt (FR-INH-3).
- **FR-MC-3** Return models *(D: Q-STOCH-1)*. Both models are supported. **Parametric** is the default.
  - **Parametric:** correlated lognormal annual returns per account. Each account has a mean and volatility, chosen
    from **presets** (*Conservative*, *Moderate*, *Aggressive*, *Cash*) or entered directly. Accounts are correlated
    through one cross-account correlation (default 0.85) plus each account's correlation with inflation. Inflation is
    AR(1) with editable mean, volatility and persistence.
  - **Historical bootstrap:** sample blocks of whole historical years (default block length 5) from bundled US
    series: Damodaran's annual returns (NYU Stern, 1928–present: S&P 500, 3-month T-bill, 10-year Treasury) and BLS
    CPI-U, stored as CSV with attribution *(D: Q-IMP-6)*. Because returns are per account, each account declares a stock/bond/cash **proxy mix**, which is used only in this mode.
  - **Deterministic:** one path at the mean rates and fixed death ages, for sanity checks and explaining results.
- **FR-MC-4** **Common random numbers.** Every candidate claiming date MUST be evaluated on the *same* set of random
  paths, including death dates and inheritance draws.
- **FR-MC-5** All outputs are reported in both **nominal** and **real (base-date)** dollars, with a toggle.

---

## 5. Simulation engine

- **FR-SIM-1** Time step: **annual** (calendar years), with **monthly precision** for SS start dates, the earnings
  test, partial first years and dated events (inheritances, one-time expenses, mortgage end) *(D: Q-SIM-1)*.
- **FR-SIM-2** Horizon: from the base date (default **Jan 2027**, never earlier) until both spouses have died, capped
  at a configurable maximum age (default 100 for the younger spouse).
- **FR-SIM-3** Steps each year:
  1. Receive any inheritances due this year, creating new accounts and adding to taxable.
  2. Compute fixed income: SS (with haircut, earnings test), earnings, annuities, other streams.
  3. Compute required withdrawals: RMDs (own and inherited) and forced inherited-IRA depletions.
  4. Compute expenses, including healthcare, Medicare premiums and IRMAA.
  5. Solve for discretionary withdrawals by account (Section 6) to cover after-tax spending plus federal + SC tax.
     The tax depends on the withdrawals, so this needs a fixed-point/iterative solve.
  6. Do Roth conversions if enabled (FR-WD-4).
  7. Excess cash (e.g. RMDs beyond need) refills the cash reserve, and the rest goes to taxable.
  8. Apply returns using the **mid-year convention**: start balance × (1 + r) + net flow × (1 + r)^½ *(D: Q-SIM-2)*.
     Subtract fees.
  9. Process deaths: survivor benefits, account transfers, filing status from next year, expense step-down.
  10. Record the full state row.
- **FR-SIM-4** **Depletion:** the first year spending can't be fully funded from liquid assets, after any backstop
  home sale. Record the year and the shortfall, and continue with reduced spending (SS + other income only) so
  later-year statistics stay meaningful.
- **FR-SIM-5** Candidate claiming dates: **quarterly**, from 62y0m to 70y0m relative to the Primary's birth month *(D:
  Q-REC-3)*. That is 33 candidates, minus any before the base date. FRA (67y0m) is on the grid.
- **NFR-SIM-1** Performance target: 33 candidates × 5,000 paths × ~35 years in **under 5 seconds** on a mid-range
  laptop, using a worker pool. Show progress, and allow cancelling.

---

## 6. Withdrawal strategy

- **FR-WD-1** Built-in strategies. The default is **Bracket-fill (12%)**.
  - **Conventional:** required withdrawals first, then cash above target, then taxable, then traditional, then Roth.
  - **Bracket-fill:** take traditional/inherited withdrawals up to the top of a target bracket (e.g. 12% or 22%) or a
    chosen IRMAA tier, whichever is lower. Cover the rest from taxable, then Roth.
  - **Proportional:** pro-rata across accounts.
  - **Custom order:** a user-defined priority list.
  - In all strategies, the HSA pays qualified medical costs first when FR-ACC-6 is enabled.
- **FR-WD-2** **Inherited IRA schedule**, chosen per inherited account: *Even* (balance ÷ remaining years),
  *Back-loaded* (required RMDs only, then the remainder in the final year), or *Bracket-aware* (fill a low bracket
  each year). Every inherited account MUST be empty by its deadline. Defaults: Even for traditional, Back-loaded for
  Roth.
- **FR-WD-3** Being able to cover the gap years before claiming is part of the claiming decision. The model MUST show,
  for each candidate date, which accounts pay for the gap.
- **FR-WD-4** **Roth conversions** (optional toggle): convert traditional to Roth up to a target bracket and/or IRMAA
  tier during low-income years. The tax is paid from cash above its reserve target, then taxable, then the rest of
  cash. Gains realized by selling taxable shares to pay the tax are taxed in the same year *(D: Q-TAX-6)*. Settings:
  target bracket, IRMAA cap, start year, end year (or "until SS claim" or "until RMD age").
- **FR-WD-5** Output a **recommended withdrawal schedule**: for the recommended claiming date, the median-path and
  deterministic-path withdrawal amounts per account per year, plus conversions.

---

## 7. Recommendation logic

- **FR-REC-1** For each candidate claiming date, compute these metrics across paths:
  - **Success probability**: liquid savings never depleted while either spouse is alive.
  - **Bequest probability**: terminal wealth ≥ bequest target (FR-EXP-4).
  - Median and 10th-percentile **terminal wealth** (real, after-tax, with traditional balances discounted at an
    assumed heir tax rate, default 22%).
  - Median/10th-percentile **minimum liquid balance** reached.
  - Expected **lifetime household SS benefits** (real) and expected present value.
  - Expected **lifetime federal + SC tax + IRMAA**.
  - **Break-even age** against claiming at 62 and at FRA (deterministic).
- **FR-REC-2** **Primary objective** *(D: Q-REC-1)*: maximize **median real after-tax terminal wealth**, subject to
  success probability ≥ **90%** (editable). If a bequest target is set, bequest probability ≥ a second floor (default
  50%). Metrics (a) success probability, (c) 10th-percentile terminal wealth and (e) PV of SS benefits are shown
  alongside. If no candidate meets the floors, recommend the one with the highest success probability, and say so.
  Show the runner-up range: every date within 2% of the best objective value, so a flat optimum isn't overstated.
  The without-inheritances recommendation is computed by re-running the evaluation on the same paths with
  inheritances removed (FR-INH-6).
- **FR-REC-3** Explain the result in plain language. For example: "Claiming at 70y0m maximizes median after-tax
  terminal wealth (+$84k vs. 67) and raises the survivor benefit by 24%. It needs $X from the taxable account in
  2027–2030. Success probability is 96% vs. 95%. Without the expected inheritance, the recommendation would be 68y6m."
- **FR-REC-4** **Sensitivity** (tornado chart and table): how the recommendation changes with longevity (fixed death
  ages from 75 to 100), real return (±2%), trust fund haircut (none vs. preset), and inheritances (with vs. without).
- **FR-REC-5** Only the Primary's claiming date is optimized. The Spouse's claim is a historical fact. Retirement date,
  Roth conversion settings and withdrawal strategy are user inputs, compared by cloning scenarios (Q-REC-2 left blank,
  interpreted this way).

---

## 8. User interface

### 8.1 Information architecture

Inputs fall into three layers. They change at different rates, so the UI keeps them apart:

| Layer | What it holds | How often it changes | Where it is edited |
|---|---|---|---|
| **Facts** *(household, shared)* | People, birth dates, earnings record, SSA estimate, Spouse's benefit, current balances, inherited-IRA facts | Rarely; once per statement or year | **Setup** view, forms and grids |
| **Plan** *(per scenario)* | Projected earnings, expenses, healthcare, home, inheritances, annuities, withdrawal and Roth strategy | Occasionally | **Setup** view, forms and grids |
| **Levers** *(per scenario)* | The handful of uncertain or "what if" values that drive the answer (FR-UI-7) | Constantly, while exploring | **Console** view, sliders and toggles |

Results are only ever *read*, never edited, and they appear in the Console and the Results views.

Top-level views, chosen from the app shell:
- **Console** (default once setup is complete): levers, the recommendation, and the main charts on one screen.
- **Setup**: the full input panels (table below), shown as a left-hand section list with one panel at a time.
- **Results**: full-size year-by-year table, withdrawal schedule, sensitivity, and the trace of a single path.
- **Compare** (FR-UI-2): scenarios side by side, as a metrics table (one column per scenario, shown first) and as
  overlaid charts, e.g. every scenario's claim-age curve on one chart *(D: Q-UX-6)*.

A **completeness checklist** in Setup shows which required facts are missing; it is hidden once nothing is. The Console stays disabled until the
minimum set is entered: birth dates, earnings record or FRA estimate, Spouse's benefit, at least one account, and
living expenses.

### 8.2 Layout

- **App shell:** a menu/toolbar (File commands, view switcher, Run, settings), with the scenario tabs below it, and a
  status bar (run state, paths, seed, rule-table date, unsaved marker).
- **Scenario tabs** (FR-UI-1): one tab per scenario. Actions: **New (blank)**, **Clone** (copies all inputs from the
  current tab), **Rename**, **Delete** (with confirmation), **Reorder** (drag).
- **NFR-UI-1** Target: desktop/laptop, minimum width 1280 px. Phone layouts aren't needed.

Console layout (fixed regions; panels inside them can be shown/hidden and collapsed):

```
┌ File ▾  View: [Console] Setup Results Compare        Run ▶   ⌘K ┐
├ [Base case] [No inheritance] [Retire 2028] [+]                  ┤
├──────────────┬──────────────────────────────────────────────────┤
│ LEVERS       │ RECOMMENDATION  Claim at 69y6m (Nov 2030)        │
│ Claim age    │ KPI tiles: success 94% · median estate $1.2M ·   │
│ ◀━━━●━━━▶    │ PV of SS $612k · lifetime tax $410k              │
│ 62  69y6m  70│ w/o inheritance: 68y9m                           │
│ Inflation    ├──────────────────────────────────────────────────┤
│ Real return  │ MAIN CHART  (tabs: Claim-age curve | Balance fan │
│ Death ages   │   | Income stack | Taxes)                        │
│ Trust fund % │                                                  │
│ Survivor %   ├──────────────────────────────────────────────────┤
│ Roth bracket │ DETAIL  year-by-year strip, selected claim age   │
│ Inheritance  │ (linked to chart hover)                          │
│ [Reset all]  │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

Setup panels:

| Panel | Contents |
|---|---|
| Household *(shared)* | Names, birth dates, base date, state (SC), prior-year MAGI for IRMAA |
| Earnings *(shared)* | Primary's past earnings record (pasted from SSA statement); projected wages/self-employment per spouse by year; computed PIA vs. statement estimate |
| Social Security | Primary's FRA estimate + as-of date; Spouse's current benefit and claim month; haircut schedule |
| Accounts | Grid: type, owner, balance, basis, return preset/mean/vol, fee, inherited-IRA fields |
| Home | Value, basis, appreciation; mortgage (balance as of a month, rate, monthly P&I payment; derived payoff month shown); property tax, insurance, maintenance; sale plan/backstop; replacement home and its cost reductions |
| Inheritances | Grid: label, heir, decedent birth date/sex, timing, amounts by type, growth, probability, if-heir-predeceases; sub-grid for real estate (keep/sell, carrying costs, rent) |
| Income | Annuities and other streams |
| Expenses | Two grids, nondiscretionary and discretionary (with a tax-deductible flag: charity or medical); survivor step-down %; bequest target |
| Healthcare | COBRA premium and start date per person, Medicare/Medigap/Part D, out-of-pocket, medical inflation spread |
| Assumptions | Inflation, return model, mortality, simulation settings, seed |
| Strategy | Withdrawal strategy, inherited-IRA schedules, Roth conversion settings, objective floors |

### 8.3 Spreadsheet-like editing

- **FR-UI-3** Grids (TanStack Table) support keyboard navigation (arrows, Tab/Enter), in-cell editing, copy/paste of
  ranges from and to Excel/Sheets (TSV), add/delete/reorder rows, and per-cell validation messages.
- **FR-UI-4** Inputs accept currency (`$1,234`, `1.2k`, `1.2M`), percentages (`3.5%`) and dates (`2032-01`,
  `Jan 2032`).
  - Every input label, editable grid column heading and Console lever has a hover tooltip (5–40 words) explaining
    the field; esoteric fields get longer tips.
- **FR-UI-5** Recalculation is automatic after input changes, debounced, and a manual "Run" is also available. A
  deterministic preview SHOULD update instantly, and Monte Carlo SHOULD follow.

### 8.4 Outputs

- **FR-OUT-1** **Recommendation card**: the recommended claiming quarter/age, the headline metrics, the explanation
  text.
- **FR-OUT-2** **Claiming-date comparison chart**: x = claiming age (quarterly), y = primary objective, with
  percentile bands and a line for success probability.
- **FR-OUT-3** **Balance fan chart**: total liquid portfolio over time (10/25/50/75/90 percentiles) for the selected
  claiming date, with a stacked-by-account view. Inheritance arrivals are marked.
- **FR-OUT-4** **Year-by-year table** (read-only grid) for the deterministic or median path. Columns:
  - year, ages;
  - SS for each spouse, earnings, annuities/other income, **inheritances received**;
  - expenses, healthcare, IRMAA;
  - withdrawals per account, RMDs, conversions;
  - taxable income, federal tax, SC tax;
  - end balances per account, home equity.

  With a real/nominal toggle.
- **FR-OUT-5** **Withdrawal schedule** view (FR-WD-5).
- **FR-OUT-6** **Sensitivity** view (FR-REC-4).
- **FR-OUT-7** Export the year-by-year table to CSV. Printing to PDF via a print stylesheet SHOULD work.
- **FR-OUT-8** Charts MUST have an accessible table equivalent.

### 8.5 Console controls (levers)

- **FR-UI-6** A lever is a **slider paired with a numeric field**. Each lever has:
  - snap steps;
  - a tick showing the scenario's saved value;
  - double-click (or a reset icon) to return to the saved value;
  - keyboard control (arrows = one step, PgUp/PgDn = 10 steps).

  Discrete choices use segmented controls or toggles instead of sliders.
- **FR-UI-7** Default levers *(D: Q-UX-2)*:

  | Lever | Control | Range / steps |
  |---|---|---|
  | **Claim age** (inspect) | Slider | 62y0m–70y0m, quarterly. It shows results for *that* date; the recommended date is marked |
  | Inflation mean | Slider | 1–6%, 0.25% |
  | Real return shift (all accounts) | Slider | −3% to +3%, 0.25% |
  | Volatility multiplier | Slider | 0.5×–1.5× |
  | Mortality | Toggle *Stochastic / Fixed* + two death-age sliders | 70–105 |
  | Trust-fund payable % and start year | Slider + stepper | 60–100%; 2030–2040 |
  | Survivor spending fraction | Slider | 50–100% |
  | Nondiscretionary spending scale | Slider | 70–130% |
  | Discretionary spending scale | Slider | 0–150% |
  | Roth conversion target | Segmented | Off / 12% / 22% / 24% |
  | Withdrawal strategy | Segmented | Conventional / Bracket-fill / Proportional |
  | Inheritances | Toggle + amount scale slider | 0–150% |
  | Bequest target | Slider | $0–$1M, $25k |
  | Success floor | Slider | 70–99% |

- **FR-UI-7a** **Add to Console.** Any scalar input in Setup can be promoted to a lever (right-click → "Add to
  Console", with a range and step), and removed again. Promoted levers are saved with the scenario in the YAML file
  *(D: Q-UX-2)*.
- **FR-UI-8** **Lever semantics** *(D: Q-UX-1)*. Moving a lever creates a **what-if override** on the current scenario. It
  is shown as a badge on the lever and a "N overrides" chip on the tab. The overrides are not part of the scenario's
  saved inputs until the user chooses **Apply to scenario** or **Save as new scenario**. **Reset all** discards them.
- **FR-UI-9** **Progressive recompute while dragging.** The deterministic path updates on every slider tick. A
  reduced Monte Carlo (e.g. 500 paths) runs during the drag, and the full run starts on release. Results that are out
  of date are visibly dimmed. Common random numbers (FR-MC-4) keep results from jumping around between runs.
- **NFR-UI-2** The deterministic recompute for all candidates SHOULD finish within 50 ms, so dragging feels live.

### 8.6 Console behaviours

Release *(D: Q-UX-4)*: FR-UI-10, 11, 13 and 15 are **v1**. FR-UI-12 (command palette) and FR-UI-14 (explain a number)
are **v1.1**. The engine SHOULD record the intermediate values of each calculation from the start, so FR-UI-14 can be
added without reworking it.

- **FR-UI-10** **Baseline ghost.** The user can pin the current results as a baseline. Charts then draw the baseline
  as a faint/dashed series, and KPI tiles show deltas ("+3 pts success, −$40k estate").
- **FR-UI-11** **Linked highlighting.** Hovering a year on any chart highlights that row in the detail strip, and
  the other way round. Clicking a point on the claim-age curve sets the Claim age lever.
- **FR-UI-12** **Command palette** (Ctrl/Cmd+K): file commands, switching views and scenarios, jumping to a Setup
  panel, "pin baseline", "reset levers", "toggle real/nominal".
- **FR-UI-13** **Undo/redo** (Ctrl/Cmd+Z / Shift+Z) for every input and lever change in the session.
- **FR-UI-14** **Explain a number.** Clicking any computed value in the detail strip or year table opens a breakdown
  of how it was calculated. Example: federal tax 2031 = brackets applied to taxable income of $X, which came from
  RMD $a + IRA withdrawal $b + 85% of SS $c, minus the standard deduction.
- **FR-UI-15** **Warnings panel**, with a badge in the status bar. It lists validation issues and modeling flags:
  PIA cross-check mismatch, a recommendation that changes without inheritances, IRMAA tier crossings, a forced
  inherited-IRA year-10 lump sum, depletion.
- **FR-UI-16** **Display settings** (per user, not per file):
  - dollars: **real (today's) by default**, with nominal one click away *(D: Q-UX-5)*;
  - theme: light/dark/**system** (default);
  - density: comfortable/**compact** (default);
  - number format (`$1.2M` vs `$1,234,567`).
- **FR-UI-17** **Panel visibility** in the Console *(D: Q-UX-3)*: fixed regions. Within them the user can show, hide
  and reorder the main-chart tabs and KPI tiles. There is no free-form drag/resize dashboard. The layout is stored
  **in the browser** (`localStorage`), not in the YAML file, with a "Reset layout" command.
- **FR-UI-18** **Visual style** *(D: Q-UX-7)*: console-leaning, i.e. compact, information-dense panels with
  **tabular (fixed-width) numerals** so columns of figures line up. The theme follows the system setting. Color is
  used for meaning (status, deltas, series), not decoration.

---

## 9. Data file format (illustrative)

```yaml
schemaVersion: 3
household:
  baseDate: 2027-01
  state: SC
  priorMagi: { 2025: 118000, 2026: 124000 }     # IRMAA lookback
  people:
    primary:
      name: Husband
      birthDate: 1961-05-14
      ss:
        fraEstimateMonthly: 3150     # from SSA statement, today's dollars
        estimateAsOf: 2026-10
      earningsRecord:                 # taxed SS earnings, pasted from SSA statement
        - { year: 1983, amount: 14200 }
        # … one row per year …
        - { year: 2025, amount: 176100 }
      earnings:                       # projected
        - { year: 2026, wages: 85000 }
        - { year: 2027, wages: 40000, selfEmployment: 15000 }
      mortality: { model: ssa_period, ageOffset: 0 }
    spouse:
      name: Wife
      birthDate: 1963-02-02
      ss:
        currentMonthly: 1400
        claimedDate: 2025-03          # PIA derived from these
      earnings: []
      mortality: { model: ssa_period, ageOffset: 0 }
scenarios:
  - id: base
    name: Base case
    trustFund:
      preset: trustees_2026_oasi
      steps: [{ effective: 2033-01, payablePercent: 78 }]
    accounts:
      - { type: roth_ira, owner: primary, balance: 180000, return: { preset: aggressive }, fee: 0.0005 }
      - { type: traditional_ira, owner: primary, balance: 650000, return: { mean: 0.055, sd: 0.11 }, fee: 0.001 }
      - { type: traditional_401k, owner: spouse, balance: 90000, return: { preset: moderate }, fee: 0.004 }
      - type: inherited_ira
        flavor: traditional
        beneficiary: spouse
        balance: 220000
        decedentBirthDate: 1938-07-01
        decedentDeathDate: 2023-04-15    # → deadline 2033, annual RMDs required
        beneficiaryClass: designated
        return: { preset: moderate }
      - { type: hsa, owner: primary, balance: 25000, payMedicalFirst: true, return: { preset: moderate } }
      - { type: taxable, owner: joint, balance: 300000, costBasis: 210000, dividendYield: 0.018,
          return: { preset: moderate }, fee: 0.0005 }
      - { type: cash, owner: joint, balance: 40000, rate: 0.035, targetMonths: 12 }
    home:
      value: 450000
      appreciation: { mean: 0.03, sd: 0.06 }
      basis: 280000
      mortgage: { balance: 92340, asOf: 2026-12, rate: 0.0375, payment: 1799.99 }  # P&I; paid off Aug 2031
      costs: { propertyTax: 3200, insurance: 2400, maintenance: 4500 }              # today's $, per year
      replacementCostCuts: { propertyTax: 0.4, insurance: 0.3, maintenance: 0.5 }  # used when downsizing
      sale: { mode: backstop, liquidFloor: 50000, sellingCostPct: 0.07, replacementCost: 0 }
    inheritances:
      - label: Mother's estate
        heir: primary
        decedentBirthDate: 1940-09-10
        decedentSex: female
        timing: { mode: mortality, ageOffset: 0 }
        amounts: { traditionalIra: 150000, rothIra: 40000, nonIra: 250000 }   # base-date dollars
        realEstate:
          - label: Lake cabin
            value: 220000
            disposition: keep
            appreciation: { mean: 0.03, sd: 0.08 }
            carryingCosts: 6500
            rentalIncome: 0
            sale: { mode: planned, date: 2038-06, sellingCostPct: 0.07 }
        growth: { realRate: 0.0, annualSpendDown: 0 }
        probability: 1.0
        ifHeirPredeceases: surviving_spouse    # | lost
        beneficiaryClass: designated
    income:
      annuities:
        - { label: SPIA, owner: primary, monthly: 800, start: 2030-01, colaPercent: 0, survivorPercent: 0.5,
            qualified: false, exclusionRatio: 0.6 }
      streams: []
    expenses:
      survivorFraction: 0.75
      bequestTarget: 200000
      items:
        - { label: Living, annual: 72000, start: 2027-01, indexing: inflation, perPerson: true }
        - { label: Roof + kitchen, annual: 60000, start: 2028-06, oneTime: true, indexing: inflation }
    healthcare:
      medicalInflationSpread: 0.015
      pre65:                                                   # per person
        primary: { cobraMonthly: 1150, start: 2027-01, outOfPocket: 3000 }   # runs until 65
        spouse:  { cobraMonthly: 1150, start: 2027-01, outOfPocket: 3000 }
      medicare: { medigapAnnual: 2400, outOfPocket: 1500 }     # Part B/D base + IRMAA from data
    strategy:
      withdrawal: bracket_fill
      targetBracket: 0.12
      irmaaCapTier: 0
      inheritedIraSchedule: { traditional: even, roth: back_loaded }
      rothConversions: { enabled: true, upToBracket: 0.22, irmaaCapTier: 1, until: claim }
    assumptions:
      inflation: { model: ar1, mean: 0.025, sd: 0.012, phi: 0.6 }
      returns: { model: parametric, crossAccountCorrelation: 0.85, inflationCorrelation: -0.1 }
      heirTaxRate: 0.22
    simulation: { paths: 5000, seed: 20270101, maxAge: 100 }
    objective: { metric: median_terminal_real_after_tax, successFloor: 0.90, bequestFloor: 0.50 }
    consoleLevers:                     # promoted via "Add to Console" (FR-UI-7a); overrides are never saved
      - { path: healthcare.medicalInflationSpread, min: 0, max: 0.04, step: 0.0025 }
```

---

## 10. Decision log (answered questions)

A blank answer meant "accept the recommendation".

| ID | Question (short) | Decision | Where applied |
|---|---|---|---|
| Q-SS-1 | What benefit input? | FRA estimate plus earnings estimates by year (2026, 2027, …) | 3.1, FR-INC-1; follow-up Q-SS-6 |
| Q-SS-2 | Birth dates | Both are inputs | 3.1, 3.2, §9 |
| Q-SS-3 | Spouse spousal fraction | Enter her current benefit; compute exactly (no override) | 3.2 |
| Q-SS-4 | Spouse PIA < 50% of Primary's? | "Wife's PIA is less than husband's." The engine computes max(0, ½·PIA_P − PIA_S), so both cases work | 3.2 |
| Q-SS-5 | Suspension / withdrawal | Leave out | 1.3 |
| Q-TF-1 | Haircut uncertainty | Fixed schedule with presets in v1; uncertainty in v2 | 3.3 |
| Q-ACC-1 | Inherited IRA details | All are inputs (owner dates, RMD status derived, trad/Roth, beneficiary) | FR-ACC-2 |
| Q-ACC-2 | Beneficiary dies before deadline | Passes to surviving spouse on same schedule | FR-ACC-3 |
| Q-ACC-3 | Other assets | HSA, cash reserve, employer 401(k)s, annuities, home equity. **No pensions** | 3.4, FR-INC-3 |
| Q-ACC-4 | Glide path | Fixed per account | FR-ACC-1 |
| Q-ACC-5 | Roth 5-year rule | Assume qualified | 3.4 |
| Q-INC-1 | Earned income | Model input | FR-INC-1 |
| Q-EXP-1 | Expense basis | After-tax | FR-EXP-1 |
| Q-EXP-2 | Survivor spending | 75% default, editable | FR-EXP-2 |
| Q-EXP-3 | Healthcare | Modeled separately | FR-EXP-3 |
| Q-EXP-4 | Bequest goal | Input | FR-EXP-4, FR-REC-2 |
| Q-TAX-1 | Tax depth | Full federal | 3.7 |
| Q-TAX-2 | State | South Carolina, no move planned | 3.7 |
| Q-TAX-3 | IRMAA | Include | FR-TAX-5 |
| Q-TAX-4 | Future tax law | No changes: current law as enacted (senior deduction ends after 2028) | 3.7 |
| Q-STOCH-1 | Return model | Parametric (default, presets) + historical bootstrap | FR-MC-3 |
| Q-STOCH-2 | Asset class vs. per account | Per account | FR-ACC-1, FR-MC-3 |
| Q-STOCH-3 | COLA | Follows simulated inflation; actual COLAs through 2027 in data | 3.1 |
| Q-STOCH-4 | Fees | Expense ratio per account | FR-ACC-1 |
| Q-LIFE-1 | Mortality | Fixed + stochastic; stochastic default | FR-LIFE-1 |
| Q-SIM-1 | Time step | Annual, monthly-precise events | FR-SIM-1 |
| Q-SIM-2 | Return timing | Mid-year convention | FR-SIM-3 |
| Q-REC-1 | Objective | Median real after-tax terminal wealth, ≥ 90% success floor | FR-REC-2 |
| Q-REC-2 | Joint optimization | Left blank → claiming date only; other choices via scenarios | FR-REC-5 |
| Q-REC-3 | Candidate grid | Quarterly | FR-SIM-5 |
| Q-ARCH-1 | Browsers | Chromium only | FR-FILE-7 |
| Q-ARCH-2 | Build | Vite on Bun | §2 |
| Q-ARCH-3 | Grid | TanStack Table | §2 |
| Q-ARCH-4 | Charts | Recharts via shadcn | §2 |
| Q-ARCH-5 | Audience | One household | 1.3 |
| Q-ARCH-6 | PWA | Not needed | 1.3 |
| Q-ARCH-7 | Hosting | Local only | §2 |
| Q-SS-6 | How earnings change PIA | (a) Exact: paste earnings record; compute AIME/PIA; statement estimate is a cross-check | FR-SS-2, FR-SS-2a |
| Q-EXP-5 | Pre-65 coverage | COBRA at a fixed premium; no ACA subsidy modeling | FR-EXP-3 |
| Q-TAX-5 | SC 2026 rates | Not known; verify against SC DOR during implementation | 3.7 |
| Q-INH-1 | Decedent and timing | One living parent; mortality-based default; no second-of-two-deaths | FR-INH-1 |
| Q-INH-2 | Heir predeceases | Passes to surviving spouse; option "lost to household" | FR-INH-4 |
| Q-INH-3 | Headline includes inheritance? | Yes, probability-weighted; without-inheritance result always shown | FR-INH-6, FR-REC-2 |
| Q-INH-4 | Amount basis | Today's values, real growth (default 0%), optional spend-down | FR-INH-1 |
| Q-INH-5 | Eligible designated beneficiary | Field supported; default designated (10-year) | FR-INH-1 |
| Q-INH-6 | Real estate | Option to keep it (carrying costs, rent, later sale) or sell on receipt | FR-INH-7 |
| Q-EXP-6 | Coverage after COBRA | (c) Not applicable: COBRA lasts until 65 for both | FR-EXP-3 |
| Q-UX-1 | Lever semantics | What-if overrides; apply or save as new scenario | FR-UI-8 |
| Q-UX-2 | Lever list | Default list in FR-UI-7, plus "Add to Console" for any scalar input | FR-UI-7, FR-UI-7a |
| Q-UX-3 | Layout configurability | Fixed regions with show/hide/reorder; saved in browser | FR-UI-17 |
| Q-UX-4 | Console behaviours in v1 | Baseline ghost, linked highlighting, undo/redo, warnings in v1; palette and explain in v1.1 | 8.6 |
| Q-UX-5 | Default dollars | Real, nominal one click away | FR-UI-16 |
| Q-UX-6 | Compare view | Table first, plus overlaid charts | 8.1 |
| Q-IMP-1 | Milestones | M0–M4 + v1.1 as proposed; slip candidates: bootstrap, annuities, home backstop, EDB stretch | §15, plan.md |
| Q-IMP-2 | Real data | Synthetic fixtures in repo; real household file in git-ignored `private/` | §15 |
| Q-IMP-3 | Validation oracle | No other planner, no spreadsheet → worked-examples doc + reference implementation | NFR-TEST-6, NFR-TEST-7 |
| Q-IMP-4 | Money arithmetic | float64 dollars; rule-mandated rounding only | NFR-ENG-1 |
| Q-IMP-5 | Rule-data upkeep | Hand-maintained tables, `docs/rule-data.md`, projection warning | FR-DATA-1, FR-DATA-2 |
| Q-IMP-6 | Historical returns | Damodaran + BLS CPI-U CSV | FR-MC-3 |
| Q-IMP-7 | Repo/tooling | git + private GitHub, Biome, GitHub Actions | §2 |
| Q-IMP-8 | Long-term care | Expense items in v1 | 1.3 |
| Q-IMP-9 | Plan format | `docs/plan.md`, session-sized tasks with requirement IDs and tests | plan.md |
| Q-UX-7 | Visual style | Left blank (no Rec) → compact console style, system theme, tabular numerals | FR-UI-18 |
| Q-TAX-5 | Itemized deductions (after v1) | Larger of standard and itemized each year: SALT (SC tax + property tax, OBBBA cap and phase-down), mortgage interest, medical over 7.5% of AGI, charity over 0.5% of AGI; 2/37 limit. SC unaffected | FR-TAX-6, plan T5.3 |
| Q-TAX-6 | Gains from funding conversion tax (after v1) | Taxed in the same year; cash above its reserve target pays first | FR-WD-4, plan T5.2 |
| Q-EXP-6 | Discretionary expenses (after v1) | Two expense tables, nondiscretionary and discretionary, each with its own scale (percent field and Console slider); healthcare unscaled. File keys: `expenses.items` / `assumptions.expenseScale` stay as the nondiscretionary ones, plus `expenses.discretionary` / `assumptions.discretionaryScale` | FR-EXP-1a, FR-UI-7 |
| Q-HOME-1 | Mortgage and home costs (after v1) | Mortgage from a statement: balance as of a month, rate, monthly P&I payment (payoff derived, so extra principal shortens the loan; schema version 3 replaced the payoff month). Property tax, insurance, maintenance with the home, ending at a sale. Downsizing: no new mortgage; each cost reduced by a percentage. Schema version 2; v1 files lose the expense link with a note | FR-ACC-7, FR-EXP-1 |

---

## 11. Open questions

None at present. New questions go here in the same **Q-…** / **Rec:** / **Answer:** format. Once answered, they move
to the decision log.

---

## 12. Testing and acceptance

- **NFR-TEST-1** Unit tests (`bun test`) for every rule:
  - early/delayed factors at boundary months;
  - spousal reduction, and Spouse PIA derived from current benefit;
  - survivor reduction and RIB-LIM;
  - earnings test and the FRA recomputation;
  - RMD divisors and the required-beginning-date determination;
  - AIME/PIA from an earnings record (wage indexing, top 35 years, bend points, automatic recomputation);
  - inherited IRA schedules (traditional and Roth; RMD and no-RMD cases);
  - step-up in basis on inherited non-IRA assets and real estate; kept-real-estate carrying costs and later sale;
  - an inheritance redirected to the surviving spouse when the heir has died;
  - provisional income and SS taxation;
  - federal brackets, senior deduction phase-out, SC tax;
  - IRMAA tiers with two-year lookback;
  - home-sale exclusion.

  Test vectors come from SSA/IRS/SC DOR published examples.
- **NFR-TEST-2** Golden-file tests: a fixed YAML input plus a fixed seed produces a stored output summary. Any rule
  change that alters results must update these files deliberately.
- **NFR-TEST-3** Cross-check deterministic SS results against the SSA Quick Calculator / Open Social Security for a
  handful of cases. The cases are recorded as test fixtures. Check the computed PIA against the SSA statement's FRA estimate for the household's real earnings
  record (FR-SS-2a).
- **NFR-TEST-4** Playwright E2E (Chromium): create a scenario, edit grids including paste, add an inheritance, clone a
  tab, save and reopen a file (mock the File System Access handles), confirm the outputs recompute identically.
- **NFR-TEST-5** Statistical tests: generated returns and inflation match their parameters within tolerance;
  mortality-based draws of death and inheritance timing match the life table.
- **NFR-TEST-6** **Worked examples instead of a spreadsheet** *(D: Q-IMP-3)*. `docs/worked-examples.md` contains 3–4
  deterministic cases with the arithmetic written out step by step: PIA from earnings, a benefit at a given claim
  age, the spousal excess, one year of federal + SC tax with SS taxation and the senior deduction, IRMAA, an RMD, an
  inherited-IRA schedule, and one withdrawal solve. Each case cites the IRS/SSA worksheet it follows (e.g. the Pub 915
  worksheet). Each one is also a `bun test`, so the document and the code can't drift apart. There is no other
  planner to compare against.
- **NFR-TEST-7** **Reference implementation (differential testing).** A deliberately simple, unoptimized
  single-path engine under `test/reference/` (monthly loop, no caching, straightforward bracket iteration).
  Property-based tests on random synthetic households check that the production engine's deterministic output
  matches it within $1 per year.

## 13. Disclaimers

- **FR-DISC-1** The app MUST say it is an educational planning tool and not financial, tax or legal advice. It MUST
  show the effective date of the rule tables in use.

## 14. Reference sources

- SSA, early/delayed retirement: <https://www.ssa.gov/benefits/retirement/planner/agereduction.html>,
  <https://www.ssa.gov/benefits/retirement/planner/delayret.html>
- SSA, spousal benefits: <https://www.ssa.gov/benefits/retirement/planner/applying7.html>
- SSA, survivor benefits: <https://www.ssa.gov/benefits/survivors/>
- SSA, PIA formula and bend points: <https://www.ssa.gov/oact/cola/piaformula.html>
- SSA 2027 COLA fact sheet (3.6% COLA, $25,560 / $67,920 earnings test, $192,300 taxable max):
  <https://www.ssa.gov/cola/factsheets/2027.html>
- 2026 Trustees Report press release (OASI depletion Q4 2032 at 78% payable; OASDI 2034 at 83%):
  <https://www.ssa.gov/news/en/press/releases/2026-06-09.html>
- SSA period life table: <https://www.ssa.gov/oact/STATS/table4c6.html>
- IRS Pub 590-B (RMDs, inherited IRAs, 10-year rule, Single Life Table): <https://www.irs.gov/publications/p590b>
- IRS Pub 915 (taxation of SS benefits): <https://www.irs.gov/publications/p915>
- IRS Pub 969 (HSAs): <https://www.irs.gov/publications/p969>
- IRS Pub 523 (home sale exclusion): <https://www.irs.gov/publications/p523>
- IRS Pub 551 (basis of inherited property): <https://www.irs.gov/publications/p551>
- Medicare premiums and IRMAA: <https://www.medicare.gov/basics/costs/medicare-costs>
- SC Department of Revenue (individual income tax): <https://dor.sc.gov/tax/individual-income>
- Open Social Security (reference implementation for claiming math): <https://opensocialsecurity.com>
- Damodaran, historical returns on stocks, bonds and bills: <https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html>
- BLS CPI-U: <https://www.bls.gov/cpi/>

## 15. Delivery and engineering conventions

- **Milestones** *(D: Q-IMP-1)*. Each milestone ends with something you can run and check. Details are in
  [plan.md](plan.md).
  - **M0 Skeleton and spike:** scaffold, schema, YAML open/save, worker pool, engine benchmark (the NFR-ARCH-6
    checkpoint).
  - **M1 Deterministic engine:** SS, core accounts, RMDs, federal + SC tax, IRMAA, healthcare, expenses; Setup view and
    the year-by-year table.
  - **M2 Uncertainty and recommendation:** Monte Carlo, stochastic mortality, recommendation, Console with levers,
    charts, baseline ghost.
  - **M3 Remaining assets:** inheritances, HSA, 401(k)s, annuities, home sale, Roth conversions, all withdrawal
    strategies.
  - **M4 Analysis:** sensitivity, Compare, historical bootstrap, CSV/print, warnings.
  - **v1.1:** command palette, explain-a-number.
  - If time runs short, these move after v1: historical bootstrap, annuities, home backstop sale, eligible-designated
    stretch.
- **Private data** *(D: Q-IMP-2)*. The repo holds synthetic fixtures only. The real household file lives in a
  git-ignored `private/` folder. It is used for a manual acceptance check at the end of M1 (PIA cross-check, plausible
  year table) and M2 (a plausible recommendation).
- **NFR-ENG-1** **Money arithmetic** *(D: Q-IMP-4)*: float64 dollars throughout. Rounding happens only where a rule
  requires it (PIA truncated to the dime, monthly benefit rounded down to the dollar, IRS tax-table rounding) and for
  display.
- **FR-DATA-1** **Rule-data upkeep** *(D: Q-IMP-5)*: rule tables are hand-maintained data files. Each records its
  effective year and source URL. `docs/rule-data.md` is the annual update checklist: SSA fact sheet (Oct), IRS
  inflation adjustments (Oct/Nov), CMS Part B/D and IRMAA (Nov), SC DOR (Dec/Jan), Trustees Report (spring).
- **FR-DATA-2** When a simulation year is past the latest published table, its values are projected forward with
  simulated inflation. The warnings panel notes the first projected year for each table.
