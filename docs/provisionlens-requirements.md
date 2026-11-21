# Requirements: ProvisionLens

Status: **draft 0.1 (2026-11-20)**, for discussion. It combines ssmodel ([requirements.md](requirements.md)) and
Checquery, following the decisions in [rebrand-assessment.md](rebrand-assessment.md). Many questions are open on
purpose (Section 15). Each one has options and a lean; the lean is a starting point for discussion, not a decision.
Answers move into the decision log (Section 16) and into the numbered requirements, the same way ssmodel's
requirements were developed.

How this document relates to the existing ones:
- **ssmodel's `requirements.md`** stays authoritative for the retirement engine (Social Security, taxes, accounts,
  withdrawals, Monte Carlo, recommendation, Console) except where this document changes it. Those requirements keep
  their IDs.
- **Checquery's `tasks/done/*.md`** (`action-log.md`, `materialized-store.md`, `ledger-store.md`,
  `info-architecture.md`) stay authoritative for the ledger domain and storage design except where this document
  changes it. They move into this repo as architecture references.
- **This document replaces** ssmodel's file section (FR-FILE-1 to FR-FILE-9) with FR-STO, and Checquery's
  server-related design entirely.

Conventions:
- **MUST / SHOULD / MAY** follow RFC 2119.
- New requirement areas use prefixes not used in ssmodel: `HH` household, `STO` storage, `LED` ledger, `IMP` import,
  `BUD` budget, `BLD` Building Years, `RET` Retiring Years changes, `PRD` product, `MIG` migration. Continued areas
  (`FR-TAX`, `FR-UI`, `NFR-SIM`, `NFR-TEST`) continue ssmodel's numbering.
- Open questions are `OQ-<area>-n`. Requirements that depend on one cite it, e.g. *(OQ-BUD-2)*.
- Decisions are `D<n>` (Section 16).
- "Person 1" and "Person 2" replace ssmodel's Primary and Spouse.

---

## 1. Purpose and scope

### 1.1 Problem

A household's money questions span its whole life, but the tools for them are split up:
- **Recording what happened:** a ledger or a budgeting app.
- **Planning next year:** a spreadsheet budget.
- **Saving for big goals:** calculators for college, a house or paying off loans.
- **Deciding about retirement:** retirement planners and Social Security calculators.

Each tool has its own data and assumptions, and none of them feeds the next. Actual spending doesn't inform the
budget. The budget doesn't inform the long-range plan. The plan can't show whether this year's choices keep the
goals on track.

### 1.2 Goal

One app, with one local file per household, that follows the household along a single timeline (from
[rebrand.md](rebrand.md)):

| Phase | Part of the app | Answers |
|---|---|---|
| **Past: prior years** | Ledger reports | Where did the money go? How has net worth changed? |
| **Past: this year** | Ledger + budget | How is this year going against the budget? What will the year end look like? |
| **Future: next year** | Budget | What do we expect to earn, spend, give and save, month by month? |
| **Future: Building Years** | Goals engine | Are college, a house, debt payoff and retirement savings on track? What needs to change? |
| **Future: Retiring Years** | Retirement engine (ssmodel) | When can we retire, when should each of us claim Social Security, and how do we draw down savings? |

Each phase feeds the next:
- Actuals seed the budget.
- The budget is year 1 of the long-range plan.
- Building Years end with the balances Retiring Years start from.

All of it is one continuous simulation.

### 1.3 Audience and positioning

- **First users:** family and friends *(D3)*. Many are not yet close to retirement: young singles, young families,
  people in mid-career, and near-retirees like the original ssmodel household.
- **Positioning:** "Biblical Stewardship & Personal Finance Software" *(OQ-PRD-4 for what that means in features)*.
- **Not advice:** an educational planning tool, not financial, tax or legal advice (ssmodel Section 13 carries
  forward).

### 1.4 Out of scope (initially)

- Any server, account sign-up, cloud sync or direct bank connection *(D2; OQ-IMP-3)*.
- Browsers other than desktop Chromium; phones and tablets *(D5)*.
- States other than SC at launch *(D4)*; local and city taxes.
- Businesses, rental property businesses, and self-employment *(OQ-BLD-13)*.
- Investment holdings and lot tracking *(OQ-LED-5)*.
- Multiple currencies; non-US households.
- Marriage, divorce and remarriage during the plan *(OQ-HH-2)*.
- Insurance needs analysis *(OQ-BLD-15)*.
- Everything ssmodel's Section 1.3 lists as out of scope, unless reopened below. Defined-benefit pensions are
  reopened *(OQ-RET-6)*.

---

## 2. Decisions carried in

From [rebrand-assessment.md](rebrand-assessment.md):

- **D1** ssmodel's tech stack: React 19, shadcn, Recharts, TanStack Table, Zustand, Zod, Vite on Bun, TypeScript 7,
  Biome, `bun test`, Playwright.
- **D2** No server. A PWA opens a local SQLite file (`.plens`) directly.
- **D3** A product, first for family and friends, so the model is generic in household shape and life stage.
- **D4** States are added one at a time, starting with SC only.
- **D5** Desktop Chromium only, for now.

Added with this document:
- **D6** The budget follows Checquery's data model: budget lines attach to Checquery accounts, and rollups use the
  account category tree. It supports expenses at various frequencies and durations, seasonal expenses, and one-time
  expenses.
- **D7** Building Years cover at least: college savings, saving for a house, paying off student loans, paying down a
  mortgage, pre-retirement savings, and other goals in the same framework.

---

## 3. Architecture

ssmodel's NFR-ARCH-1 to NFR-ARCH-7 carry forward:
- browser-only, with no network requests except the app's own static assets;
- simulation in a Web Worker pool;
- a pure TypeScript engine;
- rule tables as versioned data;
- a seedable random number generator;
- the TypeScript-first engine decision;
- the PWA.

Added:

- **NFR-ARCH-8** SQLite runs as the official SQLite WASM build in a dedicated Web Worker (the *store worker*). The UI
  talks to it through a typed message protocol, as ssmodel's `src/worker/` does for the engine.
- **NFR-ARCH-9** Storage code goes through a small database-driver interface with two implementations: `bun:sqlite`
  for `bun test`, and SQLite WASM in the app. No storage module imports either driver directly.
- **NFR-ARCH-10** Checquery's storage design carries forward. An append-only, optionally encrypted change log is
  stored in the file. An in-memory materialized database is rebuilt by replaying the log on open, and all reads and
  reports come from it *(OQ-LED-3, OQ-STO-6)*.
- **NFR-ARCH-11** The domain schemas (Zod) are the source of truth for both ledger and planning types. Checquery's
  `@checquery/shared` domain moves into `src/` alongside ssmodel's `src/schema/`.
- **NFR-ARCH-12** Money:
  - The ledger and budget keep exact cents, as Checquery does.
  - The planning engines keep float64 dollars, as ssmodel does (NFR-ENG-1).
  - Values convert at one boundary module, and nowhere else *(OQ-LED-1)*.

---

## 4. Household (FR-HH)

- **FR-HH-1** A household has **one or two adults** (Person 1, and optionally Person 2) and zero or more
  **dependents**. Each adult has:
  - a name;
  - a birth date;
  - a sex, used only for life tables *(OQ-HH-6)*;
  - a Social Security status (FR-HH-3);
  - optionally, a planned retirement date (FR-BLD-12).
- **FR-HH-2** Relationship of two adults: married. Unmarried partners sharing a file are *(OQ-HH-1)*.
- **FR-HH-3** Social Security status for each adult is one of:
  - **not yet claiming:** earnings record (pasted from the SSA statement, FR-SS-2) plus projected wages from
    Building Years;
  - **claiming:** current monthly benefit and the month it started (today's Spouse model, FR-SS-3).
  Both, either or neither adult may be claiming.
- **FR-HH-4** Dependents: name, birth date (future dates allowed for planned children, *OQ-HH-3*), and whether they
  count as a qualifying child for tax purposes. Dependent status ends at an age set per dependent (default 18, or 24
  if a full-time student).
- **FR-HH-5** Filing status for each tax year is derived:
  - **married filing jointly** while both married adults are alive;
  - **single** or **head of household** otherwise, depending on qualifying dependents;
  - married filing separately is not supported *(OQ-HH-5)*.
  The survivor rules (FR-TAX in ssmodel, Section 3.7) carry forward.
- **FR-HH-6** State of residence, with dated moves. Only SC has tax rules at launch *(D4)*. Another state can be
  chosen only once its rule table exists; until then the app explains this instead of computing wrong taxes.
- **FR-HH-7** The household has a **base date**: the first month the plan projects. It defaults to the month after
  the latest ledger data, or the start of next year when a budget for next year exists *(OQ-BLD-1)*.

---

## 5. Ledger: the past (FR-LED)

### 5.1 Carried from Checquery

- **FR-LED-1** Entities and rules as in Checquery:
  - accounts of five types (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE) in a category tree with five predefined roots;
  - accounts as leaves, each categorized at least one level below its root;
  - the singleton Net Worth EQUITY account;
  - vendors with an optional default account;
  - transactions with split double-entry entries, a posted date, an optional cleared date, a code, a vendor or
    description, and a needs-review flag;
  - balance assertions.
- **FR-LED-2** Reported net worth is always assets minus liabilities as of a date, never the Net Worth account's
  balance (Checquery's domain notes).
- **FR-LED-3** Pages from Checquery, rewritten in React:
  - the Register for each account, and the Income Log and Expense Log;
  - account and category trees, and vendors;
  - the Balance Sheet and Income Statement (Summary and Details), by period (year, quarter, month);
  - the inline calculator.
- **FR-LED-4** Each change is stamped with an Origin. Without a server, an Origin is a **device/user name** set in
  the app's settings, replacing Checquery's user plus IP address.

### 5.2 New for planning

- **FR-LED-5** ASSET and LIABILITY accounts can carry **planning attributes**. An account without them is ignored by
  the planning engines, apart from net worth reporting.
  - **Owner:** Person 1, Person 2 or joint.
  - **Tax treatment** (ssmodel `AccountType`): cash, taxable (with cost basis), traditional, Roth, inherited
    traditional or Roth, HSA, 529, or home.
  - **Return model:** preset, or mean and volatility (FR-ACC in ssmodel), with an optional glide path
    *(OQ-BLD-18)*.
  - **Loan terms, for liabilities:** rate, monthly payment, kind (mortgage, student loan, auto, credit card,
    other), and the asset it's secured by.
- **FR-LED-6** Plan starting balances come from ledger balances as of the base date: the latest balance assertion
  or computed balance. They are shown with their as-of date, and the user can override them per scenario.
- **FR-LED-7** INCOME and EXPENSE accounts and categories carry a **planning group**: essential, discretionary,
  housing, healthcare, giving, taxes, debt interest, or other. They also carry a default **indexing** (inflation,
  medical, none, or a rate). These tell the long-range engine how each line behaves after the budget year (FR-BUD-16).
- **FR-LED-8** A new file starts from a **default chart of accounts**: categories and accounts for a typical
  household, with planning groups already set. The user can rename, delete or add.
- **FR-LED-9** Investment accounts are tracked by balance. Market changes are recorded as revaluation entries
  against Net Worth, typically from monthly statements, as Checquery does for home values *(OQ-LED-5)*.
- **FR-LED-10** A **paycheck** can be entered as one split transaction: gross pay as income, with entries for taxes
  withheld, retirement contributions, HSA and insurance premiums, and net pay to checking. Paycheck templates make
  this quick *(OQ-LED-6)*.

### 5.3 Importing transactions (FR-IMP)

- **FR-IMP-1** Import bank and card exports into an account: **CSV** with a saved column mapping per institution
  *(OQ-IMP-1)*, and **OFX/QFX** where available.
- **FR-IMP-2** Duplicate detection: on OFX transaction IDs where present, otherwise on account, date, amount and
  description. Possible duplicates are shown for the user to confirm, never dropped silently.
- **FR-IMP-3** Categorization, in this order:
  1. user rules (text in payee or description → vendor and account);
  2. the vendor's default account;
  3. the account most often used for that vendor before *(OQ-IMP-2)*.
  Uncategorized or guessed transactions get the needs-review flag.
- **FR-IMP-4** The bank's date goes into the cleared date. The posted date takes it too unless the file gives a
  separate transaction date.
- **FR-IMP-5** Import is all or nothing per file. Errors name the line, as Checquery's export-import task requires.

---

## 6. Next year: budget (FR-BUD)

### 6.1 Structure

- **FR-BUD-1** A **budget** covers one calendar year *(OQ-BUD-4)* and is stored in the household file. Past
  budgets are kept for comparison. Each budget has a **status**: draft, active (the year is underway) or closed.
- **FR-BUD-2** A budget is a set of **budget lines**. Each line attaches to one Checquery account *(D6)*:
  - an **INCOME** account (wages, interest, gifts received);
  - an **EXPENSE** account (groceries, utilities, giving);
  - an **ASSET** account, for planned saving and goal contributions (a 529, a house fund, a Roth IRA);
  - a **LIABILITY** account, for planned principal payments (mortgage, student loan).
  Lines may also attach to an account category *(OQ-BUD-2)*.
- **FR-BUD-3** A line may name a **vendor** under its account, for example Netflix under Subscriptions *(OQ-BUD-3)*.
  This is for display and for matching actuals. It doesn't change the category rollup.
- **FR-BUD-4** Rollups (category subtotals, type totals, net) come from the **account category tree**. There is no
  separate budget category hierarchy. Renaming or moving an account or category in the ledger changes the budget's
  layout automatically.
- **FR-BUD-5** Budget lines are stored as entities in the change log (with id, origin and timestamp), like other
  Checquery entities *(OQ-STO-6)*. Amounts use Checquery's currency format.

### 6.2 Amount patterns

- **FR-BUD-6** Each line has one **pattern**, which describes when amounts occur and how large they are:

  | Pattern | Inputs | Examples |
  |---|---|---|
  | **Recurring** | amount per occurrence; frequency; anchor date; duration | paycheck every other Friday; rent on the 1st; quarterly water bill; annual insurance premium in March |
  | **Seasonal** | 12 monthly amounts, or an annual total with a seasonal profile | heating, higher December to February; lawn care, April to October; Christmas gifts in November and December |
  | **One-time** | date and amount | new roof in June; wedding in September; a car purchase |
  | **Irregular (spread)** | annual total; optional sinking-fund earmark | car repairs, medical co-pays, home maintenance |
  | **Percentage** | rate, and the base it applies to | giving 10% of gross income; 401(k) at 6% of salary; employer match |
  | **Loan payment** | the liability account | mortgage payment, split into principal and interest from the loan's amortization *(OQ-BUD-11)* |

- **FR-BUD-7** **Frequencies** for recurring lines: weekly, every 2 weeks, twice a month (two days of the month),
  monthly (a day of the month, or the last day), every N months, quarterly, twice a year, yearly (month and day),
  and every N years (for budgeting multi-year items in the year they fall due).
- **FR-BUD-8** **Duration** for recurring lines:
  - open-ended;
  - until an end date;
  - for N occurrences (for example, 10 remaining car payments);
  - between a start and end date within the year (for example, daycare from September).
- **FR-BUD-9** **Amount changes within the year:** a line can have dated steps, for example rent rising in August
  or a raise in April. Each step applies from its date onward.
- **FR-BUD-10** **Seasonal profiles** are named sets of 12 monthly weights, reusable across lines and years:
  "Heating", "Cooling", "Holidays", or the user's own. They can be derived from a past year's actual monthly pattern
  for an account *(OQ-BUD-6)*.
- **FR-BUD-11** **Calendar expansion:** the budget engine expands each line into dated occurrences for the year.
  - Biweekly pay gives 26 or 27 paychecks depending on the calendar, and months with three paychecks show up as such.
  - Day 31 means the last day of shorter months.
  - Weekend shifting is a per-line option *(OQ-BUD-7)*.

### 6.3 Building a budget

- **FR-BUD-12** A new budget starts from one of:
  - **last year's budget**, rolled forward: dates move to the new year, and amounts can be raised by an inflation
    rate;
  - **last year's actuals by account**, with suggested patterns *(OQ-BUD-13)*;
  - a **template** for the household's life stage;
  - **blank**.
  The user then edits it line by line.
- **FR-BUD-13** **Editing:**
  - a grid of lines (rows grouped by the category tree) against months, with year totals;
  - a pattern editor for the selected line;
  - spreadsheet-style editing and paste, as in ssmodel's grids (Section 8.3).
- **FR-BUD-14** **Checks while editing:**
  - Income minus expenses minus planned saving and principal is shown live, for each month and the year.
  - Unallocated surplus or a shortfall is flagged *(OQ-BUD-1)*.
  - Lines on inactive or deleted accounts are flagged.
- **FR-BUD-15** **Original and current:** when a budget becomes active, its original version is kept. Later edits
  change the current version, and reports can compare actuals with either *(OQ-BUD-5)*.

### 6.4 Tracking against actuals (this year)

- **FR-BUD-16** **Actuals** for a line are the entries posted to its account, by posted date *(OQ-LED-7)*, within
  the period.
  - Lines with a vendor count only that vendor's entries. The account's other entries go to an "other" line under
    that account.
  - Accounts with actuals but no budget line appear as **unbudgeted**.
- **FR-BUD-17** **Budget vs. actual** report:
  - by month, quarter, year to date and full year;
  - at any level of the category tree;
  - variance in dollars and percent;
  - variance colored by direction: spending under budget and income over budget are favorable.
- **FR-BUD-18** **Year-end forecast:** actuals to date plus the remaining budgeted occurrences give a projected
  year-end for every line and total. This is the "This Year" view.
- **FR-BUD-19** **Cash flow:** the projected month-end balance of chosen cash accounts. It starts from today's
  ledger balances and adds the remaining occurrences. A month that falls below a user-set floor is flagged.
- **FR-BUD-20** **Irregular expenses and sinking funds:** an irregular line can be tracked against its annual total
  instead of month by month. It can have an **earmark**, a running "set aside" amount that grows by the monthly
  share and is spent down by actuals *(OQ-BUD-9, OQ-BUD-10)*.
- **FR-BUD-21** Indicators appear in the app only. There are no push notifications, since there's no server
  *(OQ-BUD-15)*.

### 6.5 Giving

- **FR-BUD-22** Giving is a first-class planning group. Giving lines can be a percentage of gross or net income
  *(OQ-BUD-16)*. Reports show giving against its target, by month and by year. Charitable lines feed the itemized
  deduction (FR-TAX-6) when itemizing applies.

### 6.6 Feeding the plan

- **FR-BUD-23** The budget year is **year 1 of the long-range plan**. For each planning group, the plan takes the
  budget's annual totals. For later years, it applies the group's indexing (FR-LED-7) and any line end dates.
  - One-time lines don't repeat.
  - Lines ending within the year stop.
  - "Every N years" lines repeat every N years.
- **FR-BUD-24** Budget lines to ASSET and LIABILITY accounts that are linked to a goal (FR-BLD-2) become that goal's
  year-1 contributions or payments. The same number is never entered twice.
- **FR-BUD-25** Taxes in the budget come from the user, usually from pay stubs. Next to them, the tax engine shows
  the **estimated tax for the year** and the likely refund or amount owed *(OQ-BUD-12)*.

### 6.7 Illustrative budget line

Field names are illustrative. The real schema follows Checquery's entity conventions.

```yaml
- id: bdln-0193
  budgetYear: 2027
  acctId: acct-utilities-electric     # an EXPENSE account
  vndrId: vndr-duke-energy             # optional
  pattern:
    kind: seasonal
    annual: "$2,400.00"
    profile: Heating                   # 12 named weights
  description: Electric, all-electric heat pump
- id: bdln-0194
  budgetYear: 2027
  acctId: acct-income-salary-p1
  pattern:
    kind: recurring
    amount: "$3,250.00"
    frequency: { every: 2, unit: week }
    anchor: 2027-01-08
    steps: [{ from: 2027-04-01, amount: "$3,380.00" }]   # raise in April
- id: bdln-0195
  budgetYear: 2027
  acctId: acct-giving-church
  pattern: { kind: percentage, rate: 0.10, base: gross-income }
- id: bdln-0196
  budgetYear: 2027
  acctId: acct-house-fund              # an ASSET account linked to the house goal
  pattern: { kind: recurring, amount: "$800.00", frequency: { every: 1, unit: month }, day: 15 }
```

---

## 7. Building Years and goals (FR-BLD)

Building Years cover the years from the base date until the first adult retires. They run in the same simulation
as Retiring Years (FR-BLD-12).

**Goals are not limited to Building Years** *(D8)*. A goal can fall in the working years, in retirement, or span
both. Examples: a home renovation at 68, a repair reserve that lasts as long as the home, travel in the first years
of retirement, or a legacy at the end of life. The goal model is the same in every phase. Section 7.5 covers how
goals behave in retirement. Goal requirements keep the `FR-BLD` prefix for now *(OQ-DEL-4)*.

### 7.1 Income and contributions

- **FR-BLD-1** **Wages** for each adult:
  - current annual gross pay, with real wage growth;
  - optional dated changes (job change, raise, a gap such as parental leave or going part-time);
  - bonuses as dated or recurring amounts.
  Projected wages also extend each adult's Social Security earnings record for the AIME/PIA calculation (FR-SS-2).
- **FR-BLD-2** **Goals** are the core entity. Every goal has:
  - a kind, a name, a target amount (today's dollars or nominal) and a target date or age;
  - an **index** for growth: general inflation, college costs, home prices, or none;
  - a **priority** (FR-BLD-10);
  - one or more **funding accounts** (ASSET accounts in the ledger), whose current balances are its starting point;
  - a **contribution plan:** fixed per month or year, a percentage of pay, or "what it takes", meaning the app
    computes the required amount.
  - an **importance:** must-have or nice-to-have (FR-BLD-17);
  - optionally, a **flexible date range** instead of a single target date (FR-BLD-18).
  Kinds:
  - emergency fund, college, house down payment, debt payoff, mortgage paydown, retirement savings, vehicle, major
    purchase or event, giving goal, custom;
  - plus the kinds in Section 7.4: K–12 tuition, new child, career break, helping adult children, caring for
    parents, home projects, home repair reserve, second home, financial independence, phased retirement,
    debt-free date, giving pledge, legacy, windfall giving, gift bunching, adult education, trips and sabbaticals,
    and a child's own accounts;
  - and the mainly-retirement kinds: travel phase, aging in place, last vehicle purchases, long-term care reserve,
    downsizing or relocating, and service years.
  Goals can fall in any phase of the timeline (Section 7.5).
- **FR-BLD-3** **Pre-retirement savings** for each adult and each plan (401(k), 403(b), 457(b), traditional IRA,
  Roth IRA, HSA, taxable):
  - **Contributions** as a percentage of pay or a dollar amount, split between Roth and traditional where the plan
    allows.
  - **Employer match** as up to two tiers, for example 100% of the first 3% plus 50% of the next 2% *(OQ-BLD-10)*,
    with optional employer non-elective contributions.
  - **Limits from rule data:** IRS elective deferral limits, age-50 catch-up and the age-60–63 higher catch-up, the
    rule that requires Roth catch-up contributions for higher earners, IRA limits, HSA self and family limits, and
    the age-55 HSA catch-up. Contributions above a limit are capped, with a warning.
  - **Phase-outs:** IRA deductibility and Roth IRA eligibility phase-outs are applied *(OQ-BLD-12 for backdoor
    Roth)*.

### 7.2 Goal kinds in detail

- **FR-BLD-4** **Emergency fund:** the target is N months of essential expenses, taken from the budget's essential
  and housing groups (default 6) *(OQ-BLD-17)*. It is funded from a cash account. When spent, it is refilled at the
  goal's priority.
- **FR-BLD-5** **College**, one goal per child:
  - start year (default: the year the child turns 18) and number of years (default 4);
  - a cost basis: public in-state, public out-of-state, private, or custom, in today's dollars *(OQ-BLD-4)*;
  - a college-cost inflation spread over general inflation;
  - the share the parents intend to fund;
  - expected scholarships and aid as a reduction *(OQ-BLD-5)*;
  - funding from 529 accounts, with SC's state income tax deduction for 529 contributions applied through the SC
    rule table.
  Withdrawals pay qualified costs. Money left over can stay invested, move to another child, or roll over to a Roth
  IRA under the 529-to-Roth rules *(OQ-BLD-6)*.
- **FR-BLD-6** **House purchase:**
  - target price in today's dollars, indexed by a home-price rate; purchase date;
  - down payment percentage, closing costs, and a funding account;
  - mortgage rate and term at purchase, and PMI below 20% down until it can be dropped.
  At purchase:
  - the down payment and closing costs leave the fund;
  - a home asset and a mortgage liability begin;
  - the budget's rent line (or a chosen line) stops;
  - property tax, insurance and maintenance start, using ssmodel's home model (FR-ACC in ssmodel, Q-HOME-1).
  Moving up (selling one home and buying another) is a sale followed by a purchase *(OQ-BLD-8 for rent-vs-buy)*.
- **FR-BLD-7** **Student loans:**
  - each loan has a balance, rate, kind (federal or private), required monthly payment, and optional forgiveness
    date and amount *(OQ-BLD-7)*;
  - a payoff strategy: minimum payments only, extra toward the highest rate first (avalanche), extra toward the
    smallest balance first (snowball), or extra to a chosen loan;
  - the student loan interest deduction applies through the tax engine.
  Outputs: payoff date and total interest for each strategy.
- **FR-BLD-8** **Mortgage paydown:**
  - ssmodel's mortgage model (balance, as-of month, rate, actual monthly principal and interest), with extra
    principal as a monthly amount and/or dated lump sums;
  - refinance as a dated change of rate, term and closing costs *(OQ-BLD-9)*.
  Outputs: payoff date, interest saved, and a comparison with investing the same extra amount.
- **FR-BLD-9** **Other debts** (auto loans, credit cards, HELOC, personal loans) use the same loan model and payoff
  strategies as student loans. Credit card debt can be modeled as a balance with a rate and a payment.
- **FR-BLD-10** **Vehicles and major purchases:** a one-time or "every N years" goal, for example replacing a car
  every 8 years. It is paid from savings, or partly with a loan that then enters the debt model *(OQ-BLD-16)*.
- **FR-BLD-11** **Children and dependents:**
  - childcare costs by age band (infant, preschool, after-school), ending at a chosen age;
  - the child tax credit and other dependent-related tax items through the tax engine *(OQ-TAX-1)*;
  - costs per child added at birth for planned children.

### 7.3 Allocation, outputs and the hand-off to retirement

- **FR-BLD-12** **One timeline:** each simulated path runs monthly or yearly *(OQ-BLD-1)* from the base date to the
  end of the last life. When each adult reaches their planned retirement date (or a searched one, *OQ-BLD-20*),
  their wages stop, and ssmodel's retirement logic applies from then on: Social Security claiming, RMDs,
  withdrawals and Medicare. The Building Years and Retiring Years engines share the same account balances, taxes
  and random draws.
- **FR-BLD-13** **Surplus and shortfall allocation:** each period the engine computes income minus taxes, expenses,
  required debt payments and fixed contributions.
  - **A surplus** goes to goals in **priority order** *(OQ-BLD-2)*. The default order is:
    1. the employer match;
    2. giving pledges due this year (FR-BLD-30) *(OQ-BLD-27)*;
    3. one month of emergency fund;
    4. debt above a rate threshold;
    5. the full emergency fund;
    6. the HSA;
    7. retirement savings up to the target percentage;
    8. must-have dated goals, in date order;
    9. nice-to-have dated goals, in date order;
    10. extra mortgage principal;
    11. taxable investing.

    This waterfall applies in years when at least one adult earns wages. Years with no wages follow FR-BLD-44.
  - **A shortfall** draws from cash, then the emergency fund, then taxable accounts, then other sources in a
    user-set order. It is flagged.
- **FR-BLD-14** **Outputs:**
  - **for each goal:** projected funded amount at the target date, probability of full funding (Monte Carlo), the
    date it is reached, the required contribution to be on track, and a status (on track, at risk, off track);
  - **for the household:** net worth over time (median and bands), savings rate, debt-free date, and when
    retirement becomes affordable.
- **FR-BLD-15** **Trade-offs:** levers in the Console, as in ssmodel Section 8.5, for:
  - each goal's target, date and contribution;
  - savings rates;
  - retirement dates;
  - wage growth.
  Moving a lever shows the effect on every goal and on retirement. Pinning a baseline (FR-UI-10) works across both
  phases.
- **FR-BLD-16** **Uncertainty:** Monte Carlo varies returns, inflation and mortality as in ssmodel (Section 4).
  Goal targets and wages are deterministic within a scenario *(OQ-BLD-3, OQ-BLD-19)*. Scenarios cover different
  choices, for example "house in 2029" vs "house in 2031".
- **FR-BLD-17** **Must-have vs. nice-to-have:** within the same priority, must-have goals are funded before
  nice-to-have ones. Reports show the probability that **all must-have goals** are fully funded, separately from
  the overall picture, for example "must-haves funded in 92% of outcomes".
- **FR-BLD-18** **Flexible dates:** a goal can have an earliest and latest date instead of one target date. The app
  then reports the **earliest affordable date**: the first date in the range at which the goal can be funded
  without dropping any must-have goal below its target probability *(OQ-BLD-22)*. Each simulated path uses one
  date per scenario; the date doesn't move path by path.

### 7.4 Further goal kinds

Each of these is mostly a preset over machinery the engine already has: a dated or recurring cash need, a wage
change, a loan, or a target ending balance. Each preset fills in sensible defaults, its own wording, and any tax
items that apply. Section 7.5 shows the phases each kind usually falls in. None is restricted to a phase unless it
depends on wages.

**Family**

- **FR-BLD-19** **K–12 tuition** (private or Christian school), per child: an annual cost from a start grade to an
  end grade, indexed by a tuition rate. 529 withdrawals can pay K–12 tuition up to the annual cap in rule data, and
  the SC 529 deduction applies to those contributions as SC rules allow *(OQ-BLD-23)*.
- **FR-BLD-20** **New child or adoption:** a one-time cost at a date (birth or adoption expenses), which also adds
  a dependent with that birth date (FR-HH-4), starting childcare costs (FR-BLD-11) and child-related tax items. For
  adoption, the adoption credit applies through rule data *(OQ-TAX-1)*.
- **FR-BLD-21** **Career break or one income:** one adult's wages drop by a percentage, or stop, between two
  dates, optionally with changed childcare costs. The goal reports whether the household stays funded through the
  break, and what saving beforehand would make it work. Social Security earnings records reflect the gap.
- **FR-BLD-22** **Helping adult children:** one-time gifts by date and child (a wedding, help with a first home, a
  first car), as a list. Gifts above the annual gift-tax exclusion are flagged as needing a gift tax return, with no
  tax computed *(OQ-BLD-24)*.
- **FR-BLD-23** **Caring for aging parents:** recurring support (monthly or yearly, indexed by medical inflation by
  default) between dates, or a one-time cost for a parent moving in (for example, a home modification).

**Home**

- **FR-BLD-24** **Home project:** a renovation or addition with a cost and date, paid from savings (in retirement,
  through withdrawals, FR-BLD-44) and optionally partly with a home equity loan, which then enters the debt model
  (FR-BLD-9). An optional increase in home value is added to the home asset *(OQ-BLD-25)*.
- **FR-BLD-25** **Home repair reserve:** a list of components with a replacement cost (today's dollars) and a life
  in years, for example roof 25, HVAC 15, water heater 12, appliances 12. The last-replaced year sets the first due
  date. The reserve is funded steadily and spent when items fall due, for as long as the home is owned, through
  retirement until a sale. A house-purchase goal (FR-BLD-6) MAY create a default reserve for the new home.
- **FR-BLD-26** **Second home or vacation property:** a second house purchase using FR-BLD-6's logic (down payment,
  mortgage, carrying costs), with no change to the rent line. A later sale is optional.

**Independence and the shape of retirement**

- **FR-BLD-27** **Financial independence:** a target date by which investable assets should support the household
  without wages. The goal reports the required assets (computed by the engine from the plan's spending after that
  date, not a fixed multiple) and the probability of reaching them. It includes a **bridge** check: enough
  accessible money (cash, taxable, Roth contributions) to cover the years before age 59½ and before Social Security
  starts *(OQ-BLD-26)*.
- **FR-BLD-28** **Phased retirement:** part-time wages for one adult between two dates before full retirement, using
  the wage-change machinery (FR-BLD-1). Retirement-plan contributions continue at a chosen rate.
- **FR-BLD-29** **Debt-free date:** a combined goal over chosen debts (default: all, including the mortgage) with a
  target date. It reports the projected date for each payoff strategy and the extra monthly payment needed to meet
  the target.

**Giving and legacy**

- **FR-BLD-30** **Giving pledge:** a fixed amount per year (or a total spread over N years) to a named recipient,
  for example a church building campaign or a missions commitment. Pledges are funded before other discretionary
  goals by default *(OQ-BLD-27)* and appear in the giving report (FR-BUD-22).
- **FR-BLD-31** **Legacy goal:** leave a target amount (today's dollars) to heirs or charity. This sets a
  **minimum ending balance** for the plan. Retirement drawdown and the recommendation treat it as a floor, building
  on ssmodel's objective (Section 7 of `requirements.md`) *(OQ-BLD-28)*.
- **FR-BLD-32** **Windfall giving:** a percentage of windfalls (bonuses, inheritances, home-sale gains, other
  one-time income) set aside for giving when they occur.
- **FR-BLD-33** **Gift bunching:** give several years' planned gifts in one year (directly, or to a donor-advised
  fund) so that itemizing beats the standard deduction that year. The tax engine compares bunching every N years
  with giving every year, using the itemized-deduction logic (FR-TAX-6) *(OQ-BLD-29)*.

**Education and experiences**

- **FR-BLD-34** **Adult education:** graduate school or retraining for an adult, with costs over a period, an
  optional wage drop during it, and an optional wage increase afterward. A 529 with the adult as beneficiary can
  fund it. Education credits apply if they're in scope *(OQ-TAX-1)*.
- **FR-BLD-35** **Trips and sabbaticals:** a one-time or "every N years" trip with a cost, for example an
  anniversary trip every 5 years, a big trip in the first year of retirement, or a sabbatical that combines a trip
  with a career break (FR-BLD-21).

**Children's own money**

- **FR-BLD-36** **Child-owned accounts:** custodial (UTMA/UGMA) accounts and a Roth IRA for a child with earned
  income, owned by the child. They're shown in the household's net worth but excluded from money available for the
  parents' goals and retirement. Contributions are budget lines or goal contributions. Kiddie-tax rules are
  *(OQ-BLD-30)*.

**Mainly in retirement**

- **FR-BLD-37** **Retirement travel phase:** extra spending for the first N years of retirement (the "go-go years"),
  as an annual amount that steps down or ends at chosen ages *(OQ-BLD-33)*.
- **FR-BLD-38** **Aging in place:** home modifications (a walk-in shower, a ramp, a first-floor bedroom) at a chosen
  age, as a home project (FR-BLD-24).
- **FR-BLD-39** **Last vehicle purchases:** the vehicle goal (FR-BLD-10) with an end age after which no replacement
  is bought.
- **FR-BLD-40** **Long-term care reserve:** a target amount set aside by a chosen age for possible care costs. It
  stays invested in its funding account and is spent only if the user models a care event as an expense. Modeling
  care as a random event remains out of scope (ssmodel Q-IMP-8).
- **FR-BLD-41** **Downsizing or relocating:** sell the home and buy a smaller one, or move to rent or a retirement
  community, at a chosen date. This uses ssmodel's sale plan (Q-HOME-1), presented as a goal with its own outputs:
  net proceeds and the change in carrying costs. A move to another state changes residence (FR-HH-6).
- **FR-BLD-42** **Service years:** a period of reduced or no income for mission or volunteer service, for example
  overseas service in early retirement, with any extra costs. This uses the career-break machinery (FR-BLD-21) when
  wages stop, or a travel-phase style spending change when already retired.

### 7.5 Goals across the timeline

- **FR-BLD-43** **Any phase:** a goal's dates can fall in Building Years, Retiring Years, or both. Goals are listed
  and reported together on one timeline, whatever phase they fall in. The phase only changes how a goal is funded
  (FR-BLD-44, FR-BLD-45).

  | Usually in | Goal kinds |
  |---|---|
  | **Working years** | college, K–12 tuition, new child or adoption, house purchase, student loans, career break, adult education, financial independence, phased retirement, child-owned accounts |
  | **Retirement** | legacy, travel phase, aging in place, last vehicle purchases, long-term care reserve, downsizing or relocating, service years |
  | **Either or both** | emergency fund, home project, home repair reserve, second home, vehicles, helping adult children, caring for parents, debt-free date, mortgage paydown, giving pledge, windfall giving, gift bunching, trips and sabbaticals, custom |

- **FR-BLD-44** **Funding in retirement:**
  - A goal's cash need in a year with no wages is added to that year's spending.
  - If the goal has its own funding account (for example a repair reserve or a travel fund), that account pays
    first.
  - Anything beyond that comes from ssmodel's withdrawal strategy (Section 6 of `requirements.md`), with the
    resulting taxes, Social Security taxation and IRMAA effects computed as for any other spending.
  - Goals don't receive allocations from a surplus in retirement. A surplus (income above spending, for example from
    RMDs) goes where ssmodel sends it today.
- **FR-BLD-45** **Saving ahead for retirement-phase goals:** a goal dated in retirement can still be saved for
  during the working years. For example, a renovation at 66 can be funded by a reserve built from age 58. The
  waterfall (FR-BLD-13) funds it at its priority until retirement. After that, the reserve is spent as in FR-BLD-44.
- **FR-BLD-46** **Must-haves in retirement:**
  - Must-have goals in retirement count as required spending. A path that can't pay them counts as a failure in
    ssmodel's success measure (FR-REC).
  - Nice-to-have goals are reported separately, as the probability that each one is paid in full. Whether they can
    be skipped on bad paths is *(OQ-BLD-31)*.
- **FR-BLD-47** **ssmodel's one-time expenses:** ssmodel's one-time expense items, its home sale plan and its
  inheritance-funded items become goals where a goal kind fits *(OQ-BLD-32)*. FR-MIG-2 maps them when importing a
  household YAML, and golden results stay unchanged (NFR-TEST-8).

---

## 8. Retiring Years (FR-RET)

ssmodel's requirements carry forward, with these changes:

- **FR-RET-1** People are generic (FR-HH). Wording changes from Primary/Spouse and Husband/Wife to the people's
  names, or Person 1 and Person 2.
- **FR-RET-2** **Joint claiming:** when two adults are not yet claiming, the recommendation searches pairs of
  claiming dates, quarterly per person *(OQ-RET-1)*. Spousal benefits work in both directions. A single adult gets
  a one-person search. FR-REC-5 and Q-REC-2 (claiming date of the Primary only) are replaced.
- **FR-RET-3** **Distance from claiming:** for an adult more than N years from age 62 *(OQ-RET-2)*, the claiming
  date is an assumption the user sets (default: full retirement age), shown as indicative. It isn't recommended.
- **FR-RET-4** **Trust fund:** the uncertain trust-fund cut moves forward from ssmodel's v2 (Q-TF-1), because it
  matters most for younger users *(OQ-RET-3)*.
- **FR-RET-5** **Inheritances:** any number of expected inheritances from any benefactors. Q-INH-1 (one living
  parent) is replaced. The section is hidden unless the user turns it on *(OQ-RET-4)*.
- **FR-RET-6** **Health coverage before 65:** employer coverage (from the paycheck or budget), COBRA, or an ACA
  marketplace plan with the premium tax credit from rule data. Q-EXP-5 (COBRA only) is replaced *(OQ-TAX-1)*.
- **FR-RET-7** **Pensions:** defined-benefit pensions as a monthly amount with a start date, COLA and survivor
  percentage, using ssmodel's annuity model *(OQ-RET-6)*.
- **FR-RET-8** **Retirement age search:** "the earliest retirement date for each adult with at least X% success" as
  an output, searched the same way as claiming dates *(OQ-BLD-20)*.
- **FR-RET-9** **Goals in retirement:** goals dated in retirement are funded through the withdrawal strategy as in
  FR-BLD-44, and must-have goals count toward success (FR-BLD-46). The Retiring Years Console shows them alongside
  spending.

---

## 9. Taxes (FR-TAX, continued)

ssmodel's FR-TAX-1 to FR-TAX-7 carry forward. Added:

- **FR-TAX-8** Filing statuses: married filing jointly, single and head of household (FR-HH-5), each with its own
  brackets, standard deduction, LTCG breakpoints, Social Security taxation thresholds and IRMAA tiers in rule data.
- **FR-TAX-9** **State tax interface:**
  - The engine calls a state-tax function chosen by residence, never `sc.ts` directly.
  - Each state has its own rule table in `data/rules/` (with `effectiveYear` and `sourceUrl`), tests and a worked
    example.
  - SC is the only state at launch *(D4)*. States without an income tax return zero and are cheap to add
    *(OQ-TAX-3, OQ-TAX-4)*.
- **FR-TAX-10** **Working-years federal items:**
  - payroll tax (Social Security up to the wage base, Medicare, Additional Medicare);
  - pre-tax deductions (traditional 401(k), HSA, Section 125 premiums);
  - the child tax credit;
  - the student loan interest deduction;
  - SC's 529 deduction.
  Other credits are *(OQ-TAX-1)*.
- **FR-TAX-11** **Moving between states:** part-year residence is simplified *(OQ-TAX-2)*.
- **FR-TAX-12** **Estimated tax for the budget year:** the engine estimates the year's federal and state tax from
  the budget and shows it next to withholding (FR-BUD-25).

---

## 10. Engine and performance (NFR-SIM, continued)

- **NFR-SIM-3** **Long horizons:** a path covers from the base date to the end of the last life, possibly 70+ years
  for a young household. Targets (machine: the development PC from ssmodel's benchmarks):
  - deterministic recompute of the current scenario: **≤ 100 ms**, so levers feel live;
  - preview Monte Carlo (500 paths): **≤ 2 s**;
  - full Monte Carlo for one scenario (5,000 paths): **≤ 10 s**.
  If these are missed after cutting work, the Rust/WASM port (NFR-ARCH-6) is reconsidered.
- **NFR-SIM-4** **Joint claiming search:** narrow the claiming-date pairs with the deterministic recompute, then run
  Monte Carlo on a short list (default 20) *(OQ-RET-1)*.
- **NFR-SIM-5** **Budget engine:** expanding and totaling a year's budget (a few hundred lines) and comparing it with
  a year of actuals MUST take under 50 ms, so grid edits feel instant.

---

## 11. User interface (FR-UI, continued)

ssmodel's FR-UI-1 to FR-UI-17 and NFR-UI-1 (desktop, minimum width 1280 px) carry forward. Added:

- **FR-UI-18** **Top-level navigation** follows the timeline *(OQ-UI-1)*:
  - **Home**;
  - **Past:** ledger pages and reports, by year;
  - **This Year:** budget vs. actual, forecast and cash flow;
  - **Next Year:** budget editor;
  - **Building Years:** wages, savings and the Console for the working years;
  - **Retiring Years:** ssmodel's Console, Results and Compare;
  - **Goals:** every goal on one timeline, whatever phase it falls in *(D8)*;
  - **Setup:** household, accounts' planning attributes, assumptions.
- **FR-UI-19** **Home dashboard** *(OQ-UI-2)*:
  - net worth and its trend;
  - this year's budget status (spent vs. budget to date, forecast surplus or shortfall);
  - each goal's status;
  - retirement readiness (success probability, earliest retirement age);
  - items needing review (imports, needs-review transactions, stale balances, rule tables needing an update).
- **FR-UI-20** **Life-stage-aware:** sections that don't apply yet are collapsed and explained, not hidden in a way
  that confuses. For example, inheritances, RMDs and Medicare for a 30-year-old *(OQ-UI-3)*.
- **FR-UI-21** **Explain a number** (FR-UI-14) extends to budget totals (which lines and occurrences) and to goal
  projections (contributions, growth, withdrawals).
- **FR-UI-22** **Tooltips:** the ssmodel rule that every input label, editable column heading and lever has a 5–40
  word tooltip carries over to all new pages.

---

## 12. Storage and files (FR-STO; replaces ssmodel FR-FILE-1 to FR-FILE-9)

- **FR-STO-1** File commands: **New, Open…, Close, Save a copy…**, and **recent files** (handles kept in
  IndexedDB, with permission requested again on reopen). The installed app opens `.plens` files from the operating
  system (File Handling API).
- **FR-STO-2** **Working copy:** on open, the file's bytes are copied into OPFS and SQLite opens the copy. Every
  committed change is durable in the copy immediately.
- **FR-STO-3** **Autosave to the user's file:** after a short pause in editing (default 5 s), on close, and when
  the app is hidden, the whole database is written back to the user's file *(OQ-STO-1)*. The file stays the source
  of truth.
  - On reopen, if the working copy is newer than the file (for example after a crash), the user is offered the
    newer version.
  - Unapplied what-ifs stay a session overlay, marked as such, as in ssmodel.
- **FR-STO-4** **One writer:**
  - A Web Lock per file prevents two tabs from writing the same file. A second tab opens read-only or is refused.
  - The file records the device that has it open, with a heartbeat. Opening it on another device (for example
    through a synced folder) warns before editing *(OQ-STO-5)*.
- **FR-STO-5** **Encryption** *(OQ-STO-2)*:
  - The change log's payloads are encrypted with AES-GCM, using a key derived from the file password with scrypt.
    This is Checquery's scheme, ported to Web Crypto plus a JS scrypt implementation, and stays compatible with
    existing files.
  - The password can be changed.
  - A **recovery key** is offered at creation *(OQ-STO-3)*.
  - A forgotten password with no recovery key means the data is lost, and the app says so plainly.
- **FR-STO-6** **Backups:** rolling copies in OPFS (default: the last 10 closes), plus an optional **backup
  folder** chosen once (directory handle in IndexedDB). The app writes a dated copy there on close, at most once a
  day *(OQ-STO-4)*.
- **FR-STO-7** **Versions:**
  - The file records its schema version.
  - Older versions migrate forward on open: Checquery's change-log migrations, plus the planning document's
    `schemaVersion` migrations from ssmodel.
  - Files from a newer version are refused with a clear message.
  - The original file is never modified by a migration until the user confirms.
- **FR-STO-8** **Long-range plan storage:** the household's planning inputs (household, scenarios, assumptions,
  goals) are stored as one versioned JSON document in a table, validated by Zod. Links to ledger entities (account
  IDs) are by ID *(OQ-STO-6)*. Budget lines are change-log entities (FR-BUD-5).
- **FR-STO-9** **YAML** stays as an import/export format for the planning document, for test fixtures, golden files
  and worked examples. It is not the storage format.
- **FR-STO-10** Browsers without the File System Access API or OPFS get the "Chromium-based browser required"
  message (ssmodel FR-FILE-7), with no fallback *(D5)*.

---

## 13. Product (FR-PRD)

- **FR-PRD-1** **Hosting:** a static site over HTTPS (for example GitHub Pages or Cloudflare Pages) *(OQ-PRD-2)*.
  ssmodel's Q-ARCH-7 (local only) is replaced. The app makes no other network requests (NFR-ARCH-1). Household data
  never leaves the device except in files the user saves.
- **FR-PRD-2** **Releases:** versioned, with release notes shown in the app after an update. New builds wait for the
  user to reload (NFR-ARCH-7).
- **FR-PRD-3** **Annual rule updates:** `docs/rule-data.md` becomes a yearly release checklist covering SSA (COLA,
  wage base, bend points), IRS (brackets, limits, deductions), CMS (Medicare, IRMAA) and each supported state. A
  release with the new year's tables SHOULD ship by mid-January *(OQ-PRD-3)*. The status bar shows each table's year,
  and the warnings panel flags projected values.
- **FR-PRD-4** **Onboarding:**
  1. Create a file and a password.
  2. Life stage questions (adults, ages, dependents, state, working or retired).
  3. Choose a default chart of accounts.
  4. Enter starting balances, or import statements.
  5. Get a budget suggestion.
  6. Set up goals.
  Each step can be skipped and returned to.
- **FR-PRD-5** **Sample household:** a synthetic household for each life stage, so people can explore before
  entering their own data. These also serve as e2e fixtures. They are never real data (ssmodel's `private/` rule
  carries forward).
- **FR-PRD-6** **Help:** in-app help pages and tooltips. A "copy diagnostics" button copies app version, rule table
  years, browser version and recent errors, never household data. There is no telemetry.
- **FR-PRD-7** **First run:** the educational disclaimer is shown on first run and is always visible in the status
  bar.

---

## 14. Migration (FR-MIG)

- **FR-MIG-1** **Open a `.checquery` file:** asks for its password, decrypts and replays it, and writes a new
  `.plens` file chosen by the user. The original is never modified. After that, the `.plens` file is the household's
  file *(OQ-STO-7)*.
- **FR-MIG-2** **Import an ssmodel household YAML** into the planning document, mapping:
  - Primary and Spouse → Person 1 and Person 2;
  - the plan's accounts → ledger accounts, matched by the user or created;
  - expense items → planning groups.
  The current household's golden results MUST be unchanged after the generic-model migration (NFR-TEST-8).
- **FR-MIG-3** **Accounts and vendors export/import** (Checquery's pending export-import task): JSON, all or
  nothing, with line-numbered errors. This is also how a chart of accounts moves between households.

---

## 15. Open questions

Each question has options and a lean. The leans are suggestions to push back on.

### Product and scope

- **OQ-PRD-1 Name check.** Should "ProvisionLens" (name and domain) be checked for conflicts before friends use it?
  *Lean: a quick check before the first release outside the family; a fuller check before any public release.*
- **OQ-PRD-2 Distribution and licence.** (a) Private repo, free for invited users. (b) Open source. (c) Paid later.
  *Lean: (a) for now. Keep the repo private and host the static build at an unlisted URL. Revisit before inviting
  anyone outside family and friends.*
- **OQ-PRD-3 Rule-update promise.** What happens if a year's tables are late? (a) Keep using last year's, projected
  forward, with a warning. (b) Block planning until updated. *Lean: (a), as ssmodel already does for projected 2027
  values.*
- **OQ-PRD-4 Stewardship features.** What does "Biblical Stewardship" mean in the product? (a) Name and tagline
  only. (b) Giving as a first-class category with goals and reports (FR-BUD-22). (c) Also guidance content
  (Scripture references, generosity and contentment prompts, debt-freedom framing). *Lean: (b) now, (c) as optional
  content later. Decide the tone carefully, since the audience will vary.*
- **OQ-PRD-5 Support.** Who answers questions, and how? *Lean: you, by email, with "copy diagnostics" (FR-PRD-6).
  Keep a FAQ in the help pages.*
- **OQ-PRD-6 Youngest life stage.** Students with no income? *Lean: from the first full-time job. Students can still
  use the ledger and budget.*
- **OQ-PRD-7 Release order.** What must exist for the first friend to use it? (a) Everything in this document. (b)
  Ledger, import and budget first (Past, This Year, Next Year). Building Years next, Retiring Years already exists.
  (c) The generic plan first, then ledger and budget. *Lean: (b). Ledger plus budget is useful to everyone at once,
  and Building Years needs the budget to feed it.*

### Household

- **OQ-HH-1 Unmarried partners.** Two adults sharing finances who file separately. *Lean: out for now. One file per
  tax household. Revisit if a friend needs it.*
- **OQ-HH-2 Marriage or divorce during the plan.** *Lean: out. Model a future marriage as a separate scenario file.*
- **OQ-HH-3 Planned children.** Dependents with future birth dates? *Lean: yes. This is cheap and matters for young
  couples' college and childcare goals.*
- **OQ-HH-4 Supporting parents or adult children.** *Lean: as budget lines and goals. No dependent tax treatment
  unless asked for.*
- **OQ-HH-5 Married filing separately.** *Lean: out (rare, complex).*
- **OQ-HH-6 Sex field.** Life tables need male or female. *Lean: keep it required, labeled "for life-expectancy
  tables", with an option to use a blended table.*

### Ledger

- **OQ-LED-1 Money representation.** (a) Ledger and budget in integer cents, planning in float dollars, converted at
  one boundary. (b) Integer cents everywhere. *Lean: (a). The engine's float math and its rounding rules are tested
  and correct.*
- **OQ-LED-2 Stored currency format.** Checquery stores `$#,###.##` strings in actions. (a) Keep it for
  compatibility. (b) Integer cents in new actions, with a migration. *Lean: (b) with a log migration, since a display
  format makes a poor storage format. Do it once, during the port.*
- **OQ-LED-3 Keep the change log?** Without a server or multiple users, plain tables would be simpler. *Lean: keep
  it. It gives history, undo, auditability and a path to merging copies, and it's already built and tested.*
- **OQ-LED-4 Undo for ledger edits.** *Lean: yes, within a session, as compensating actions. This matches ssmodel's
  FR-UI-13.*
- **OQ-LED-5 Investment holdings.** (a) Balances only, with revaluations. (b) Holdings, lots and prices. *Lean: (a).
  Holdings are a large feature that the plan doesn't need.*
- **OQ-LED-6 Paychecks.** (a) Gross with split deductions. (b) Net only. (c) Either. *Lean: (c), with templates that
  make (a) easy. (a) gives better tax estimates and savings-rate figures.*
- **OQ-LED-7 Date for budget actuals.** The posted date (when money changed hands) or the cleared date (when it
  reached the bank, Checquery's register date)? *Lean: posted date. Month boundaries should follow when spending
  happened.*
- **OQ-LED-8 Statement reconciliation screen** beyond balance assertions. *Lean: later.*
- **OQ-LED-9 Receipts and attachments.** *Lean: out. They'd bloat the file.*

### Import

- **OQ-IMP-1 Formats first.** (a) CSV with mapping profiles. (b) OFX/QFX. (c) QIF from Quicken. *Lean: (a), then
  (b). (c) only if someone migrating from Quicken asks.*
- **OQ-IMP-2 Categorization.** (a) Rules only. (b) Rules plus history-based suggestions. *Lean: (b). Suggestions are
  always flagged for review.*
- **OQ-IMP-3 Direct bank connections** (aggregators). *Lean: no. They need a server and send data to third parties,
  which contradicts D2 and NFR-ARCH-1.*
- **OQ-IMP-4 Importing from other apps** (YNAB, Monarch, spreadsheets). *Lean: through CSV mapping. No dedicated
  importers unless a friend needs one.*

### Budget

- **OQ-BUD-1 Budgeting style.** (a) Plan vs. actual: set expectations and track variances. (b) Zero-based: every
  dollar of income is assigned. (c) Envelope: unspent amounts roll over, and spending is limited to what's in the
  envelope. *Lean: (a) as the base, with an optional "assign every dollar" check (FR-BUD-14) and per-line rollover
  (OQ-BUD-10). Full envelope accounting changes how the ledger works.*
- **OQ-BUD-2 Line granularity.** (a) Leaf accounts only. (b) Any category level. For example, budget "Food" without
  splitting groceries and dining. *Lean: (b). If a category has a line, its children can't have lines too. Actuals
  roll up.*
- **OQ-BUD-3 Vendor-level lines.** Track Netflix separately within Subscriptions? *Lean: yes, optional. The rest of
  the account goes to "other" (FR-BUD-16).*
- **OQ-BUD-4 Budget year.** Calendar year, or a custom start month? *Lean: calendar, to match taxes and the plan.*
- **OQ-BUD-5 Versions.** (a) One budget per year, with an original snapshot. (b) Several named budgets per year
  (for example, "with new job"). *Lean: (a). What-if budgets belong in plan scenarios.*
- **OQ-BUD-6 Seasonal entry.** (a) 12 explicit amounts. (b) An annual total times named weights. (c) Both. *Lean:
  (c). Profiles can be derived from last year's actuals.*
- **OQ-BUD-7 Weekend and holiday shifting.** *Lean: weekend shifting as a per-line option (earlier or later).
  Holidays are out.*
- **OQ-BUD-8 Every-N-years items** (a car registration every 2 years, a roof every 25). *Lean: allowed in the budget
  when they fall due. The plan repeats them (FR-BUD-23).*
- **OQ-BUD-9 Sinking funds.** (a) Virtual earmarks inside a cash account. (b) Real ASSET sub-accounts with transfers.
  (c) Both. *Lean: (a) first. It's lighter, and many people don't want extra accounts. (b) works already through
  goals.*
- **OQ-BUD-10 Rollover.** Unspent amounts carry to the next month or year? *Lean: per-line option, off by default,
  on for earmarked irregular lines.*
- **OQ-BUD-11 Loan payments.** Split principal and interest automatically from the loan's amortization? *Lean: yes.
  The interest goes to an EXPENSE account and the principal to the LIABILITY account. The user enters only the
  payment.*
- **OQ-BUD-12 Taxes in the budget.** (a) The user enters withholding. (b) The engine computes taxes as lines. *Lean:
  (a), with the engine's estimate beside it (FR-BUD-25). Withholding is what actually hits the bank.*
- **OQ-BUD-13 Budget from history.** (a) Averages and last year's same-month amounts. (b) Detecting recurring
  patterns (frequency, day). *Lean: (a) first, (b) later. Pattern detection is useful but fiddly.*
- **OQ-BUD-14 Starting mid-year.** A friend starts in June. *Lean: a full-year budget, with past months showing
  imported actuals if available, or marked "no data".*
- **OQ-BUD-15 Overspending alerts.** *Lean: in-app indicators only. Push notifications would need a server.*
- **OQ-BUD-16 Percentage lines.** Percentage of gross or net, budgeted or actual income? *Lean: the user picks gross
  or net. The budget uses budgeted income. Tracking compares against actual income received (useful for giving).*
- **OQ-BUD-17 Saving in the budget.** Do goal contributions appear as budget lines, or only in Building Years?
  *Lean: as budget lines to ASSET accounts linked to goals. One number, entered once (FR-BUD-24).*
- **OQ-BUD-18 Two budgets in flight.** In November, the user edits next year's draft while this year is still
  active. *Lean: allowed. Next year's draft starts from this year's forecast (FR-BUD-18).*

### Building Years

- **OQ-BLD-1 Time step.** (a) Yearly, as ssmodel. (b) Monthly throughout. (c) Monthly for the budget year and the
  first few years, then yearly. *Lean: (a) for the simulation, with monthly amortization inside each year for loans,
  and the budget year from the budget engine. Measure before considering (b).*
- **OQ-BLD-2 Allocation.** (a) A user-ordered priority list with a recommended default. (b) An optimizer. *Lean:
  (a). It's explainable and matches how people think. (b) maybe later for "the best order".*
- **OQ-BLD-3 Uncertain goal targets** (house prices, college costs). *Lean: deterministic within a scenario. Use
  scenarios and levers for ranges, and Monte Carlo for markets and inflation only.*
- **OQ-BLD-4 College cost data.** (a) User-entered. (b) Presets from published averages (for example, College
  Board), as rule data with a source URL, updated yearly. *Lean: (b) with user override.*
- **OQ-BLD-5 Financial aid.** *Lean: out. The user enters expected aid or scholarships as a reduction.*
- **OQ-BLD-6 Money left in a 529.** Model the 529-to-Roth rollover (lifetime cap, account-age rule)? *Lean: later.
  At first, leftover funds stay invested and are reported.*
- **OQ-BLD-7 Federal student loan plans.** (a) A user-entered payment, plus optional forgiveness date and amount.
  (b) Modeled income-driven plans. *Lean: (a). Federal plan rules changed in 2025–26 and are still settling. (b) only
  with rule data and a clear source.*
- **OQ-BLD-8 Rent vs. buy.** *Lean: later, as a scenario comparison over the house goal.*
- **OQ-BLD-9 Refinancing.** *Lean: as a dated change (rate, term, costs). No rate forecasting.*
- **OQ-BLD-10 Employer match.** How general? *Lean: two tiers plus a non-elective percentage. No true-up, no
  per-paycheck limits.*
- **OQ-BLD-11 Vesting.** *Lean: ignore. Assume vested.*
- **OQ-BLD-12 Backdoor and mega-backdoor Roth.** *Lean: out at first. Show a warning when Roth IRA contributions
  exceed eligibility.*
- **OQ-BLD-13 Self-employment.** Self-employment tax, SEP and solo 401(k), the QBI deduction. *Lean: out at first.
  Decide early whether any first user needs it, since it changes payroll and contribution logic.*
- **OQ-BLD-14 Stock compensation** (RSUs, ESPP). *Lean: out. RSUs can be entered as bonuses.*
- **OQ-BLD-15 Insurance needs** (life, disability). *Lean: out. Premiums are budget lines. Maybe later: a simple
  "what if a working adult dies in year X" scenario, which the engine's mortality model nearly supports already.*
- **OQ-BLD-16 Vehicle financing.** *Lean: a vehicle goal with an optional loan share. The loan enters the debt
  model.*
- **OQ-BLD-17 Emergency fund target.** *Lean: months of essential plus housing expenses from the budget, default 6.
  It can also be a fixed amount.*
- **OQ-BLD-18 Glide paths.** Allocation becoming more conservative with age (target-date style)? *Lean: an optional
  preset glide path per account (moderate to conservative by retirement), otherwise fixed returns as today.*
- **OQ-BLD-19 Wage uncertainty.** Job loss, or random wage growth, in Monte Carlo? *Lean: deterministic at first.
  "Job loss in year X" as a scenario.*
- **OQ-BLD-20 Retirement date.** Input only, or also searched? *Lean: input, plus "earliest date with ≥ X% success"
  as an output (FR-RET-8).*
- **OQ-BLD-21 Goal conflicts.** When the surplus can't fund everything, should the app suggest changes (later date,
  lower target)? *Lean: show what each goal would need. Suggestions later.*
- **OQ-BLD-22 Earliest affordable date.** How is it found? (a) Try each year in the range with the deterministic
  recompute, then confirm the chosen year with Monte Carlo. (b) Monte Carlo for every year. *Lean: (a), the same
  approach as the joint claiming search (NFR-SIM-4).*
- **OQ-BLD-23 K–12 and 529.** Model 529 withdrawals for K–12 tuition, including SC's treatment of them? *Lean: yes,
  with the cap and SC rules as rule data with sources. Verify current federal and SC rules before building, since
  both changed recently.*
- **OQ-BLD-24 Gift and estate tax.** *Lean: flag gifts above the annual exclusion and stop there. Estate tax is out
  of scope for this audience.*
- **OQ-BLD-25 Home value after projects.** Add a value increase to the home? *Lean: an optional percentage of cost,
  default 0, since many projects don't pay back.*
- **OQ-BLD-26 Financial independence target.** (a) A rule of thumb (25 × spending). (b) Computed from the plan's own
  spending, taxes and Social Security after the target date, with a success probability. *Lean: (b). Show the rule of
  thumb beside it for reference.*
- **OQ-BLD-27 Pledge priority.** Should pledges come before the emergency fund and debt payoff? *Lean: right after
  the employer match by default, since a pledge is a commitment. The user can move it.*
- **OQ-BLD-28 Legacy floor vs. objective.** (a) A hard floor: paths that end below it count as failures. (b) A soft
  target, reported as a probability. *Lean: (b) by default, with (a) as an option. A hard floor makes the success
  rate fall sharply.*
- **OQ-BLD-29 Gift bunching.** Model a donor-advised fund as an account, or only the timing of deductions? *Lean:
  timing only. The fund's balance isn't the household's money once given.*
- **OQ-BLD-30 Child-owned accounts.** Model kiddie tax and the effect on financial aid? *Lean: out. Child-owned
  accounts are tracked and projected only, not taxed in the household's return.*
- **OQ-BLD-31 Skipping nice-to-haves on bad paths.** In retirement, should the simulation skip or shrink nice-to-have
  goals on paths where the portfolio has fallen a lot (a spending guardrail)? (a) Never: goals are paid or the path
  fails. (b) Skip nice-to-haves below a portfolio threshold. (c) Scale them down proportionally. *Lean: (b) as an
  option, off by default. It makes plans more realistic but harder to explain, so report how often goals were
  skipped.*
- **OQ-BLD-32 ssmodel's one-time expenses.** (a) Convert them all to goals. (b) Keep one-time expense items and add
  goals beside them. *Lean: (a), with "custom" as the catch-all. Two ways of entering the same thing confuse people.
  Keep ssmodel's recurring expense items as budget-derived spending.*
- **OQ-BLD-33 Spending shape in retirement.** Is the "go-go years" pattern a goal (FR-BLD-37), or a general
  retirement spending curve in assumptions (spending falling with age, then health costs rising)? *Lean: a goal for
  travel and similar extras, plus an optional real-spending decline per year in assumptions. Health costs already
  rise through medical inflation.*

### Retiring Years

- **OQ-RET-1 Joint claiming search.** (a) A deterministic prefilter, then Monte Carlo on the top 20. (b) Coarse to
  fine on a 2-D grid. (c) A full grid with fewer paths. *Lean: (a). It reuses NFR-UI-2's fast recompute.*
- **OQ-RET-2 Claiming advice for younger users.** *Lean: recommend only within 10 years of age 62. Before that,
  claiming is an assumption (FR-RET-3).*
- **OQ-RET-3 Trust-fund cut.** (a) None. (b) The cut scheduled in the Trustees Report, from its depletion year. (c)
  A user-set percentage and year. (d) Random. *Lean: (b) as the default for users under 55, with (a) and (c) as
  options. Defer (d).*
- **OQ-RET-4 Inheritances.** Keep the full ssmodel model for everyone? *Lean: keep it, hidden by default, and
  generalized to several benefactors.*
- **OQ-RET-5 Divorced-spouse and survivor-of-ex benefits.** *Lean: still out.*
- **OQ-RET-6 Defined-benefit pensions** (for example, SC Retirement System teachers). *Lean: in, using the annuity
  model (FR-RET-7). No accrual formulas. The user enters the projected benefit.*

### Taxes

- **OQ-TAX-1 Which credits and deductions at first.** Candidates: child tax credit, dependent care credit, student
  loan interest, education credits (AOTC/LLC), saver's credit, EITC, the ACA premium tax credit, the adoption
  credit. *Lean: child tax
  credit, student loan interest and the premium tax credit at first. AOTC next. The rest when someone needs them.*
- **OQ-TAX-2 Moving between states.** (a) Residence changes on January 1 of the year after the move. (b) Real
  part-year apportionment. *Lean: (a).*
- **OQ-TAX-3 Order of new states.** *Lean: states without income tax first (nearly free), then where the first users
  live.*
- **OQ-TAX-4 State-tax interface.** (a) Code per state. (b) A parameterized model (brackets, standard deduction,
  retirement and Social Security exclusions, age deductions) with per-state code hooks. *Lean: (b). Most states fit
  a parameterized model with a few quirks.*
- **OQ-TAX-5 Local taxes.** *Lean: out. Property tax stays a home cost.*

### Storage

- **OQ-STO-1 Autosave.** (a) Autosave everything. (b) Explicit Save, as in ssmodel. (c) Autosave the ledger,
  explicit Save for plans. *Lean: (a), with what-ifs as a session overlay until applied.*
- **OQ-STO-2 Encryption.** Required, on by default, or off by default? *Lean: on by default, and can be turned off
  with a clear warning. Unencrypted files are useful for test fixtures.*
- **OQ-STO-3 Recovery key.** *Lean: a random key, shown once as words to print or store, which also wraps the file
  key. Changing the password doesn't invalidate it.*
- **OQ-STO-4 Backups.** How many, where, and how often? *Lean: the last 10 in OPFS, and at most one a day in the
  backup folder, keeping 30 days plus monthly copies.*
- **OQ-STO-5 Two computers.** (a) A warning only. (b) Merge diverged copies using the change log's timestamps and
  origins. *Lean: (a) at first. Design the log so that (b) stays possible.*
- **OQ-STO-6 Where each kind of data lives.** (a) Everything as change-log entities. (b) The ledger and budget as
  entities, the long-range plan as one JSON document. (c) Everything except the ledger as a document. *Lean: (b).
  Budget lines are record-like and tied to accounts. Plan scenarios are deep, nested and already validated as one
  document.*
- **OQ-STO-7 `.checquery` files.** Keep opening them forever, or one-time conversion only? *Lean: conversion only
  (FR-MIG-1). Remove it after the household's own switch, plus a release or two.*

### User interface

- **OQ-UI-1 Navigation model.** (a) Timeline (Past, This Year, Next Year, Building, Retiring). (b) Functional
  (Ledger, Budget, Goals, Retirement). (c) Timeline plus a Goals page that spans phases. *Lean: (c). Keep the timeline
  rebrand.md suggests, but give goals their own page, since they cross the working/retired boundary. Ledger pages
  sit under Past, and the command palette reaches everything.*
- **OQ-UI-2 Home dashboard.** What's on it, and can it be customized? *Lean: the fixed set in FR-UI-19, with
  show/hide like ssmodel's layout settings (FR-UI-17).*
- **OQ-UI-3 Life stage.** Collapse sections that don't apply, or hide them entirely? *Lean: collapse, with a
  one-line explanation.*
- **OQ-UI-4 One Console or two.** Building Years and Retiring Years in one Console with tabs, or separate ones?
  *Lean: one Console with a phase selector. Both are one simulation.*

### Delivery

- **OQ-DEL-1 Repository.** (a) Rename this repo and copy Checquery code in. (b) A new repo. *Lean: (a). Keep
  Checquery's repo as the archive of its history.*
- **OQ-DEL-2 Requirement IDs.** Renumber everything into one scheme, or keep ssmodel's IDs and add areas? *Lean:
  keep and add (this document's approach). Code comments already cite the IDs.*
- **OQ-DEL-3 Where Checquery's tests go.** Its Solid component tests can't move. *Lean: port its domain and storage
  tests to `bun test`, and replace the page tests with Playwright e2e on synthetic households.*
- **OQ-DEL-4 Goal requirement IDs.** Goals now span both phases but use the `FR-BLD` prefix. Rename the goal
  requirements to `FR-GOAL` before the draft is accepted? *Lean: yes, once the goal list settles. Nothing cites these
  IDs in code yet, so renaming is cheap now and expensive later.*

---

## 16. Decision log

| ID | Topic | Decision | Requirements |
|---|---|---|---|
| D1 | Tech stack | ssmodel's (React, shadcn, Recharts, TanStack, Zustand, Zod, Vite on Bun, Biome, TS 7) | Section 3 |
| D2 | Architecture | No server; PWA opening a local SQLite `.plens` file | Section 3, Section 12 |
| D3 | Audience | Product for family and friends, many not near retirement; generic household and life stage | Sections 1.3, 4, 7, 8 |
| D4 | States | Added one at a time, SC only at launch | FR-HH-6, FR-TAX-9 |
| D5 | Browsers | Desktop Chromium only, for now | FR-STO-10 |
| D6 | Budget model | Lines attach to Checquery accounts; rollups follow the category tree; frequency, duration, seasonal and one-time patterns | Section 6 |
| D7 | Building Years scope | College, house, student loans, mortgage paydown, retirement savings, and other goals; further kinds in Section 7.4 | Section 7 |
| D8 | Goals across phases | Goals can fall in Building Years, Retiring Years or both; one goal model, funded by the waterfall while working and by withdrawals in retirement | Section 7.5, FR-RET-9 |

---

## 17. Testing and acceptance (NFR-TEST, continued)

ssmodel's NFR-TEST-1 to NFR-TEST-7 carry forward. Added:

- **NFR-TEST-8** **Golden continuity:** after the generic-household migration, the current ssmodel household file
  produces the same golden results as before, within floating-point tolerance. Any difference is explained in the
  commit, as ssmodel's NFR-TEST-2 requires.
- **NFR-TEST-9** **Ledger parity:** opening the real `.checquery` file (locally, never in fixtures) gives the same
  Balance Sheet and Income Statement totals as the Checquery server for the same dates. A synthetic `.checquery`
  fixture covers the same path in CI.
- **NFR-TEST-10** **Budget calendar:** unit tests for frequency expansion, covering:
  - biweekly pay in 26- and 27-paycheck years;
  - day 31 and February;
  - weekend shifting;
  - steps within the year;
  - occurrence-count durations;
  - seasonal weights that sum to the annual total, to the cent.
- **NFR-TEST-11** **Rule citations:** every new federal or state rule (contribution limits, credits, the 529
  deduction, payroll tax) has unit tests citing its source, as in ssmodel's CLAUDE.md.
- **NFR-TEST-12** **Life-stage households:** synthetic households for a single 25-year-old with student loans, a
  young family saving for a house and college, a mid-career couple paying down a mortgage, a near-retiree couple
  (like today's fixture), and a widowed retiree. Each has e2e coverage of its main pages and a golden summary.
- **NFR-TEST-13** **Reference engine:** the differential reference engine (NFR-TEST-7) extends to Building Years:
  wages, contributions, the allocation waterfall and loan amortization.
- **NFR-TEST-14** **Storage:** e2e tests for:
  - autosave and reopen;
  - crash recovery from the working copy;
  - a second tab refused by the lock;
  - a wrong password;
  - the recovery key;
  - backup-folder writes.
  The File System Access API mock (`test/e2e/fsaMock.ts`) is extended for these.
