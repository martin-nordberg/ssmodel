# Requirements: ProvisionLens

Status: **draft 0.2 (2026-11-23)**, for discussion. It combines ssmodel ([requirements.md](requirements.md)) and
Checquery, following the decisions in [rebrand-assessment.md](rebrand-assessment.md). Many questions are open on
purpose (Section 17). Each one has options and a lean; the lean is a starting point for discussion, not a decision.
Answers move into the decision log (Section 18) and into the numbered requirements, the same way ssmodel's
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
  `BUD` budget, `BLD` Building Years, `RET` Retiring Years changes, `ROLE` account roles, `RPT` reports, `HLP` help,
  `PRD` product, `MIG` migration. Continued areas (`FR-TAX`, `FR-UI`, `NFR-UI`, `NFR-SIM`, `NFR-TEST`) continue
  ssmodel's numbering.
- Report catalog entries are `RPT-<area>-n` (Section 15). Functional sections cross-reference them.
- Open questions are `OQ-<area>-n`. Requirements that depend on one cite it, e.g. *(OQ-BUD-2)*.
- Decisions are `D<n>` (Section 18).
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

Added in draft 0.2:
- **D9** One account concept across ledger, budget and plan. Every account carries a **role** that tells the app what
  it is for planning, budgeting and taxes (Section 5.2).
- **D10** Checquery's look and feel migrates to ssmodel's. Checquery's breadcrumb-only navigation is replaced by an
  app shell with a sidebar (Section 11).

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

## 5. Ledger and accounts: the past (FR-LED, FR-ROLE)

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
  These pages and the new ledger reports are listed in the report catalog (Section 15.2, RPT-LED).
- **FR-LED-4** Each change is stamped with an Origin. Without a server, an Origin is a **device/user name** set in
  the app's settings, replacing Checquery's user plus IP address.

### 5.2 Accounts and roles (FR-ROLE)

There is **one account concept** across ledger, budget and plan *(D9)*. An account is a Checquery ledger account.
Budget lines attach to it (FR-BUD-2), goals are funded from it (FR-BLD-2), and the planning engines start from its
balance (FR-LED-6). Nothing in the budget or the plan keeps a separate list of accounts.

The **category tree** stays the user's own way to organize and report: names and nesting are free. A **role** tells
the app what an account *is*, so budgeting, taxes and planning never depend on an account's name or where it sits
in the tree.

- **FR-ROLE-1** **Every account has exactly one role** from the role catalog (FR-ROLE-4) *(OQ-ROLE-1)*.
  - Each account type has a generic role ("Other asset", "Other expense", and so on). It is the default, so a role
    is never blank.
  - Accounts with a generic role still count in net worth, the budget and reports. The planning engines treat them
    by type defaults: generic assets don't grow and can't be withdrawn from; generic expenses use their planning
    group's indexing.
  - The Net Worth account has a fixed role.
- **FR-ROLE-2** **The catalog belongs to the app.** Roles are defined in code and versioned with the app, not created
  by the user *(OQ-ROLE-2)*. Files migrate when the catalog changes *(OQ-ROLE-10)*. Each role defines:
  - the **account type** it applies to;
  - its **cardinality** (FR-ROLE-3);
  - its **attributes**, the role-specific planning fields (FR-ROLE-5);
  - for INCOME and EXPENSE roles, a **planning group** and default **indexing** (FR-LED-7);
  - its **tax meaning**: how its amounts enter the tax engine (wages, a deduction, a credit base, tax withheld, or
    none);
  - its **budget behavior**: which patterns it offers (loan payment only for loan roles) and what it counts toward
    (for example, "gross income" for percentage lines, FR-BUD-22);
  - its **engine behavior**: tax treatment, withdrawal eligibility and RMD rules, reusing ssmodel's account types
    (ssmodel Section 3.4).
- **FR-ROLE-3** **Cardinality:**
  - **one per household:** exactly one account, for example federal income tax;
  - **one per person:** for example Social Security tax withheld, Medicare tax withheld, Social Security benefits
    received;
  - **many:** for example checking accounts, traditional IRAs, 401(k)s, credit cards, and wage accounts (one per
    job).
  Which roles are required depends on the household. For example, each adult with wages needs a Social Security
  tax account. A missing required role or a second account in a "one" role is reported in the role map
  (FR-ROLE-10) and the warnings panel *(OQ-ROLE-5)*.
- **FR-ROLE-4** **Roles are only as fine as the engines need.** A role exists only where budgeting, taxes or planning
  treat accounts differently. Groceries and dining both take a planning-group role (essential or discretionary);
  the category tree carries the finer detail *(OQ-ROLE-9)*. What money is *for* (an emergency fund, a house fund)
  is a goal, not a role *(OQ-ROLE-8)*. The initial catalog (names illustrative):

  | Type | Roles |
  |---|---|
  | **Asset: cash** | checking; savings; money market or CD |
  | **Asset: investments** | taxable brokerage; traditional IRA; Roth IRA; traditional employer plan (401(k), 403(b), 457(b), TSP); Roth employer plan; inherited traditional IRA; inherited Roth IRA; HSA; 529 plan; custodial account (UTMA/UGMA); child's Roth IRA |
  | **Asset: property** | primary home; other real estate (second home); vehicle; money owed to the household; other asset |
  | **Liability** | mortgage; home equity loan or HELOC; federal student loan; private student loan; auto loan; credit card; personal or family loan; other liability |
  | **Income** | wages and salary (per job, owned by a person); bonus; employer retirement contributions *(OQ-ROLE-6)*; interest; dividends; realized capital gains; Social Security benefits (per person); pension; annuity; gifts received; inheritance received; tax refund; other taxable income; other non-taxable income |
  | **Expense: taxes** | federal income tax (one); state income tax (one) *(OQ-ROLE-5)*; Social Security tax (per person); Medicare tax (per person); property tax (linked to a home) |
  | **Expense: housing** | rent; mortgage interest (linked to a mortgage); home insurance; HOA dues; home maintenance and repairs; utilities |
  | **Expense: healthcare** | health insurance premiums (pre-tax or after-tax); Medicare premiums (per person); medical out-of-pocket |
  | **Expense: family and education** | childcare; tuition and education |
  | **Expense: giving** | charitable giving (deductible); gifts to people (not deductible) |
  | **Expense: interest** | student loan interest (linked to a loan); other interest |
  | **Expense: general** | essential living; discretionary; other expense |
  | **Equity** | Net Worth (fixed) |

- **FR-ROLE-5** **Role attributes** replace the planning attributes of draft 0.1 *(OQ-ROLE-7)*:
  - **owner:** Person 1, Person 2, joint, or a dependent for child-owned roles. Required for retirement accounts and
    per-person roles;
  - **investment roles:** return model and fee (FR-ACC-1 in ssmodel), cost basis for taxable accounts, inherited-IRA
    facts (FR-ACC-2 in ssmodel), optional glide path *(OQ-BLD-18)*;
  - **employer plan roles:** the job (wage account) it belongs to, contribution settings and match (FR-BLD-3);
  - **loan roles:** rate, payment, term, kind, the asset it's secured by, and optional forgiveness (FR-BLD-7);
  - **home roles:** cost basis, appreciation, property tax, insurance and maintenance (ssmodel's home model);
  - **wage roles:** the person, the employer's name and the paycheck template (FR-LED-10);
  - **links** between accounts: mortgage interest to its mortgage, property tax to its home, an employer plan to its
    wages. Links let the engines and reports pair them, for example interest paid per loan.
- **FR-ROLE-6** **Categories suggest roles.** A category MAY carry a default role, which new accounts created under it
  receive. The default chart of accounts (FR-LED-8) sets roles on all its accounts and categories.
- **FR-ROLE-7** **Consumers read roles, not names.** The budget, goals, tax and retirement engines select accounts
  by role and attributes only. Examples:
  - "gross income" is every wage, bonus and employer contribution account;
  - withholding is the tax roles;
  - the emergency fund goal suggests cash accounts as its funding accounts;
  - the itemized deduction (FR-TAX-6) adds deductible giving, mortgage interest, property tax and medical
    out-of-pocket.
- **FR-ROLE-8** **Reports by role.** Besides the category tree, reports can group by role and by planning group, for
  example a tax view of the income statement (FR-RPT-5).
- **FR-ROLE-9** **Changing a role** is allowed at any time and leaves past transactions untouched. Before applying it,
  the app lists what depends on the account (budget lines, goals, paycheck templates, links) and what will change.
  For example, a loan-payment budget line on an account that is no longer a loan. Incompatible items are flagged,
  never deleted silently.
- **FR-ROLE-10** **Role map** (a Setup page):
  - each role with the accounts that fill it;
  - missing required roles and duplicates of "one" roles;
  - accounts with a generic role whose name suggests a specific one ("IRA", "401k", "mortgage");
  - missing attributes, for example a loan without a rate.
  The role map is also the role-assignment step when converting a `.checquery` file (FR-MIG-1): the app suggests
  roles from names and categories, and the user confirms them.
- **FR-ROLE-11** **Planned accounts.** Goals and plan events may need accounts that don't exist yet: the mortgage
  from a future house purchase, a 529 for a planned child, a Roth 401(k) at a future job. A planned account exists in
  the plan only, with a role, attributes and a zero balance. It never appears in the ledger. When the real account
  is opened, the user links it and the plan uses the real account from then on *(OQ-ROLE-3)*.
- **FR-ROLE-12** **One real account, two roles.** A 401(k) holding both traditional and Roth money is recorded as two
  ledger accounts, one per role, usually under one category named for the plan *(OQ-ROLE-4)*.

### 5.3 New for planning

- **FR-LED-5** The planning engines see an account through its role and role attributes (FR-ROLE-5). An account with
  a generic role is ignored by them, apart from net worth, budget and reports.
- **FR-LED-6** Plan starting balances come from ledger balances as of the base date: the latest balance assertion
  or computed balance. They are shown with their as-of date, and the user can override them per scenario.
- **FR-LED-7** Each INCOME and EXPENSE role has a **planning group** (essential, discretionary, housing, healthcare,
  giving, taxes, debt interest, or other) and a default **indexing** (inflation, medical, none, or a rate). The
  indexing can be overridden per account. These tell the long-range engine how each line behaves after the budget
  year (FR-BUD-23).
- **FR-LED-8** A new file starts from a **default chart of accounts**: categories and accounts for a typical
  household, with roles already set (FR-ROLE-6). The user can rename, delete or add. The onboarding answers choose
  among a few variants (FR-HLP-3).
- **FR-LED-9** Investment accounts are tracked by balance. Market changes are recorded as revaluation entries
  against Net Worth, typically from monthly statements, as Checquery does for home values *(OQ-LED-5)*.
- **FR-LED-10** A **paycheck** can be entered as one split transaction: gross pay as income, with entries for taxes
  withheld, retirement contributions, HSA and insurance premiums, and net pay to checking. Paycheck templates make
  this quick *(OQ-LED-6)*.

### 5.4 Importing transactions (FR-IMP)

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
  *(OQ-BUD-15)*. Budget reports are listed in the report catalog (Section 15.2, RPT-BUD).

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
  - one or more **funding accounts** (ASSET accounts in the ledger, or planned accounts, FR-ROLE-11), whose current
    balances are its starting point;
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
  The charts and tables are listed in the report catalog (Section 15.2, RPT-BLD and RPT-LIFE).
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

ssmodel's outputs (FR-OUT-1 to FR-OUT-9) carry forward and are listed in the report catalog (Section 15.2, RPT-RET).

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

ssmodel's FR-UI-1 to FR-UI-18 and NFR-UI-1 (desktop, minimum width 1280 px) carry forward. Checquery's look and feel
migrates to ssmodel's *(D10)*: its pages are rewritten (FR-LED-3) with ssmodel's components, density and visual style
(ssmodel FR-UI-18). Checquery's `info-architecture.md` stays a reference for what each page contains, not for
navigation. Its breadcrumb menus worked for about a dozen pages; this app has several times that many.

### 11.1 Information architecture

- **FR-UI-19** **Top-level navigation** follows the timeline *(OQ-UI-1)*:

  | Section | Pages |
  |---|---|
  | **Home** | dashboard (FR-UI-34), getting-started checklist (FR-HLP-4), review queue (RPT-LED-18) |
  | **Past** | registers for primary accounts, Income Log, Expense Log, Balance Sheet, Income Statement, the other ledger reports (RPT-LED), transaction search, import |
  | **This Year** | budget vs. actual, year-end forecast, cash flow, sinking funds |
  | **Next Year** | budget editor, budget summary |
  | **Goals** | every goal on one timeline, whatever phase it falls in *(D8)*, and a page per goal |
  | **Building Years** | Console, wages and savings, debt payoff, results |
  | **Retiring Years** | ssmodel's Console, Setup, Results and Compare |
  | **Setup** | household; accounts, categories and vendors *(OQ-UI-12)*; role map (FR-ROLE-10); paycheck templates; import profiles; assumptions; file settings (password, recovery key, backups, file info) |
  | **Help** | help pages, glossary, release notes, about (Section 16) |

- **FR-UI-20** **App shell** *(OQ-UI-5)*:
  - a toolbar with file commands, the command palette, settings and help;
  - a **left sidebar** with the sections of FR-UI-19 and their pages. It collapses to icons, and the current page is
    highlighted;
  - the page area;
  - ssmodel's status bar, plus autosave state, lock state (FR-STO-4) and whether the file is encrypted.
- **FR-UI-21** **Within a section**, tabs switch between closely related pages, as in ssmodel's Retiring Years views
  (Console, Setup, Results, Compare).
- **FR-UI-22** **Breadcrumbs** appear only as a trail for drill-downs, for example "Past › Income Statement 2026 ›
  Groceries › Register". They are not the main navigation *(OQ-UI-7)*.
- **FR-UI-23** **Addressable pages.** Every page and its main parameters (account, period, scenario, goal) have a route
  inside the app. Back and forward, reload, and opening a page in a second window (read-only, FR-STO-4) work
  *(OQ-UI-6, OQ-UI-8)*.
- **FR-UI-24** **Cross-links** connect related things in both directions:
  - an account to its register, its budget lines and the goals it funds;
  - a vendor to its transactions;
  - a goal to its funding accounts and budget lines;
  - a report amount to the transactions behind it (FR-RPT-3).
- **FR-UI-25** **Scenario scope.** Scenario tabs appear only on Building Years, Retiring Years and Goals. Past and This
  Year show recorded facts and are the same in every scenario. Next Year has one budget *(OQ-BUD-5)*.
- **FR-UI-26** **Search.** The command palette (ssmodel FR-UI-12) also finds accounts, categories, vendors, goals,
  pages, help topics, and transactions by text or amount.
- **FR-UI-27** **Page templates.** Every page uses one of a few templates, so the app reads as one system:

  | Template | Layout | Used for |
  |---|---|---|
  | **List or tree** | tree or table with inline add and edit, details in a side panel | accounts and categories, vendors, goals, role map |
  | **Register** | keyboard-first transaction grid with a running balance | registers, Income and Expense Logs, transaction search |
  | **Editor** | grid or form, with an inspector panel for the selected row | budget editor, Setup panels |
  | **Report** | filters bar, then chart, then table (FR-RPT-1) | everything in Section 15 |
  | **Console** | levers, KPI tiles, main chart, detail strip | Building Years and Retiring Years |
  | **Dashboard** | fixed grid of tiles that link to their pages | Home |

### 11.2 Look and feel

- **FR-UI-28** **One visual system.** ssmodel's visual style (ssmodel FR-UI-18: compact, dense, tabular numerals,
  color for meaning), shadcn components, light/dark/system themes and both densities apply to every page, including
  the rewritten Checquery pages.
- **FR-UI-29** **Color means the same thing everywhere:**
  - actual vs. projected: solid for recorded values, a median line with bands for projections, and a "today" marker
    where they meet;
  - favorable vs. unfavorable variance;
  - goal status: on track, at risk, off track;
  - warnings and errors;
  - optionally one hue per timeline phase, used quietly in the sidebar and timeline charts *(OQ-UI-9)*.
  Chart series take colors from one palette, and the same account or category keeps the same color across charts.
- **FR-UI-30** **Numbers and dates** are formatted by one module for the whole app: currency (with the user's
  display setting, ssmodel FR-UI-16), percentages and dates. Negative amounts look the same in the ledger and in
  plans.
- **FR-UI-31** **Data entry** is keyboard-first. Checquery's register behaviors carry over: tab order, date
  shortcuts, vendor autocomplete that fills the vendor's default account, and the inline calculator. ssmodel's input
  parsing (FR-UI-4) applies everywhere *(OQ-UI-13)*.
- **FR-UI-32** **Brand.** The ProvisionLens name, logo and app icon replace ssmodel's. The tagline appears on Home
  (no file open) and About. Working pages carry no decorative imagery *(OQ-UI-11)*.
- **FR-UI-33** **Voice.** Plain language, addressed to the user, without unexplained jargon. Terms of art link to the
  glossary (FR-HLP-9). Messages say what happened and what to do next.
- **NFR-UI-3** **Accessibility:** WCAG 2.2 AA as the target *(OQ-UI-10)*:
  - every action reachable by keyboard, with visible focus;
  - contrast met in both themes;
  - labels on all inputs;
  - a table equivalent for every chart (ssmodel FR-OUT-8).

### 11.3 Pages and behavior

- **FR-UI-34** **Home dashboard** *(OQ-UI-2)*:
  - net worth and its trend;
  - this year's budget status (spent vs. budget to date, forecast surplus or shortfall);
  - each goal's status;
  - retirement readiness (success probability, earliest retirement age);
  - items needing review (RPT-LED-18), plus role map gaps (FR-ROLE-10) and rule tables needing an update.
- **FR-UI-35** **Life-stage-aware:** sections that don't apply yet are collapsed and explained, not hidden in a way
  that confuses. For example, inheritances, RMDs and Medicare for a 30-year-old *(OQ-UI-3)*.
- **FR-UI-36** **Explain a number** (FR-UI-14) extends to budget totals (which lines and occurrences) and to goal
  projections (contributions, growth, withdrawals).
- **FR-UI-37** **Tooltips:** the ssmodel rule that every input label, editable column heading and lever has a 5–40
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
- **FR-PRD-4** **Onboarding** is specified in Section 16 (FR-HLP-3).
- **FR-PRD-5** **Sample households** are specified in Section 16 (FR-HLP-1, FR-HLP-2).
- **FR-PRD-6** **Help and diagnostics** are specified in Section 16 (FR-HLP-10, FR-HLP-12). There is no telemetry.
- **FR-PRD-7** **First run:** the educational disclaimer is shown on first run and is always visible in the status
  bar.

---

## 14. Migration (FR-MIG)

- **FR-MIG-1** **Open a `.checquery` file:** asks for its password, decrypts and replays it, and writes a new
  `.plens` file chosen by the user. The original is never modified. Accounts get suggested roles, which the user
  confirms in the role map (FR-ROLE-10). After that, the `.plens` file is the household's file *(OQ-STO-7)*.
- **FR-MIG-2** **Import an ssmodel household YAML** into the planning document, mapping:
  - Primary and Spouse → Person 1 and Person 2;
  - the plan's accounts → ledger accounts, matched by the user or created;
  - expense items → expense accounts with planning-group roles (FR-ROLE-4).
  The current household's golden results MUST be unchanged after the generic-model migration (NFR-TEST-8).
- **FR-MIG-3** **Accounts and vendors export/import** (Checquery's pending export-import task): JSON, all or
  nothing, with line-numbered errors. This is also how a chart of accounts moves between households.

---

## 15. Reports and charts (FR-RPT)

Reports are listed in one catalog (15.2), and the functional sections point to it. Each entry has a status:
- **Base:** required in the first release that includes its area *(OQ-RPT-1)*;
- **Candidate:** to decide before that release;
- **Later:** after the first release.

### 15.1 Common behavior

- **FR-RPT-1** **Report template** (FR-UI-27): a filters bar, then the chart, then the table. Chart and table come from
  the same data and stay in sync.
- **FR-RPT-2** **Periods and comparisons:**
  - periods: year, quarter, month, year to date, trailing 12 months, or a custom range;
  - comparisons: previous period, same period last year, the budget (original or current, FR-BUD-15), or a pinned
    baseline or other scenario for projections;
  - the default period is *(OQ-RPT-7)*.
- **FR-RPT-3** **Drill-down.** Every amount that comes from the ledger opens the transactions behind it in a
  filtered register. Every projected amount opens "explain a number" (FR-UI-36).
- **FR-RPT-4** **Actual and projected together.** Charts that span past and future follow FR-UI-29: actuals solid,
  projections as a median line with bands, and a "today" marker. Charts use one library *(OQ-RPT-9)*.
- **FR-RPT-5** **Grouping:** by the category tree (default), by role, by planning group, or by vendor. Levels expand
  and collapse, and zero rows can be hidden.
- **FR-RPT-6** **Output:** CSV export of the table, printing (or saving as PDF) through a print stylesheet
  *(OQ-RPT-10)*, and a table equivalent for every chart (ssmodel FR-OUT-7, FR-OUT-8).
- **FR-RPT-7** **Saved views.** A report's filters can be saved under a name and pinned to Home or the sidebar
  *(OQ-RPT-3)*. There is no report builder at first *(OQ-RPT-2)*.
- **FR-RPT-8** **Real and nominal.** Projected reports follow the real/nominal display setting (ssmodel FR-UI-16).
  Ledger reports are always nominal.
- **NFR-RPT-1** **Speed.** Any ledger report over 10 years of a typical household's data (about 30,000 transactions)
  MUST render in under 500 ms.

### 15.2 Catalog

**Ledger (Past)**

| ID | Report | Form | Status |
|---|---|---|---|
| RPT-LED-1 | **Balance Sheet** (Checquery), plus comparison columns, for example the end of each of the last 5 years | table | Base |
| RPT-LED-2 | **Income Statement**, summary and details (Checquery), plus multi-period columns (12 months, or N years) | table | Base |
| RPT-LED-3 | **Net worth over time**: assets and liabilities stacked, net worth as a line | chart | Base |
| RPT-LED-4 | **Account balance history**, with balance assertions marked | chart | Base |
| RPT-LED-5 | **Spending by category** for a period, with drill-down through the tree *(OQ-RPT-4)* | chart, table | Base |
| RPT-LED-6 | **Category trend**: chosen categories by month over 12–36 months, with the average | chart | Base |
| RPT-LED-7 | **Income vs. spending by month**, with the net as a line | chart | Base |
| RPT-LED-8 | **Year over year**: each category this year against the last N years, with the change | table | Base |
| RPT-LED-9 | **Monthly averages**: average and median monthly amount per category over a chosen span. Also seeds the budget (FR-BUD-12) | table | Base |
| RPT-LED-10 | **Vendor report**: top vendors, and one vendor's history | table, chart | Base |
| RPT-LED-11 | **Transaction search**: date, account, vendor, amount range, text, needs-review and cleared filters; results as a register; savable | register | Base |
| RPT-LED-12 | **Giving statement**: giving by recipient and year, deductible or not (FR-BUD-22) | table | Base |
| RPT-LED-13 | **Tax summary**: the year's totals by tax role (wages, interest, dividends, withholding, deductible giving, mortgage interest, property tax, medical, student loan interest, HSA contributions) *(OQ-RPT-6)* | table | Candidate |
| RPT-LED-14 | **Cash flow statement**: income, spending, saving, principal paid, and transfers between asset accounts | table | Candidate |
| RPT-LED-15 | **Savings rate**: saving plus principal paid as a share of gross and of net income, by month and year | chart | Candidate |
| RPT-LED-16 | **Debt summary**: balance, interest paid by year and payoff progress per liability | table, chart | Candidate |
| RPT-LED-17 | **Investment change**: per account, contributions, withdrawals and market change by period, with a return estimate *(OQ-RPT-8)* | table | Candidate |
| RPT-LED-18 | **Review queue**: needs-review transactions, uncleared items older than N days, failed or stale balance assertions | list | Base |
| RPT-LED-19 | **Money flow**: income through to spending groups and saving *(OQ-RPT-5)* | Sankey | Candidate |
| RPT-LED-20 | **Recurring charges**: detected subscriptions and repeating payments, with changes in amount | table | Later |
| RPT-LED-21 | **Large or unusual transactions** compared with the account's history | list | Later |

**Budget (This Year, Next Year)**

| ID | Report | Form | Status |
|---|---|---|---|
| RPT-BUD-1 | **Budget vs. actual** (FR-BUD-17) | table, chart | Base |
| RPT-BUD-2 | **Year-end forecast** (FR-BUD-18) | table | Base |
| RPT-BUD-3 | **Cash flow projection**: month-end balances of chosen cash accounts against the floor (FR-BUD-19) | chart | Base |
| RPT-BUD-4 | **Budget summary**: the year by category and month, printable on one page | table | Base |
| RPT-BUD-5 | **Unbudgeted spending**: accounts with actuals but no line (FR-BUD-16) | table | Base |
| RPT-BUD-6 | **Giving vs. target** (FR-BUD-22) | chart | Base |
| RPT-BUD-7 | **Draft vs. last year**: next year's draft against this year's forecast and last year's actuals | table | Base |
| RPT-BUD-8 | **Sinking funds**: earmarked balances, set aside vs. spent (FR-BUD-20, *OQ-BUD-9*) | table | Base |
| RPT-BUD-9 | **Spending pace**: cumulative actual against cumulative budget through the month or year | chart | Candidate |
| RPT-BUD-10 | **Upcoming**: budgeted bills and paychecks over the next few weeks | list, calendar | Candidate |
| RPT-BUD-11 | **Budget history**: budget and actual per category over several years | chart | Later |

**Goals and Building Years**

| ID | Report | Form | Status |
|---|---|---|---|
| RPT-BLD-1 | **Goal timeline**: every goal on one timeline across phases, colored by status (the Goals page) | chart | Base |
| RPT-BLD-2 | **Goal detail**: projected funding with bands, target, probability and required contribution (FR-BLD-14) | chart, table | Base |
| RPT-BLD-3 | **Allocation by year**: where each year's surplus goes, stacked by waterfall step (FR-BLD-13) | chart | Base |
| RPT-BLD-4 | **Debt payoff**: balance per loan over time, and strategies compared by payoff date and interest (FR-BLD-7, FR-BLD-9, FR-BLD-29) | chart, table | Base |
| RPT-BLD-5 | **Mortgage amortization**: schedule with extra principal, interest saved, and the invest-instead comparison (FR-BLD-8) | table, chart | Base |
| RPT-BLD-6 | **College funding**: per child, projected cost against 529 balance, and the gap (FR-BLD-5) | chart | Base |
| RPT-BLD-7 | **Must-haves funded**: the probability that all must-have goals are funded (FR-BLD-17) | tile, chart | Base |
| RPT-BLD-8 | **Contributions and limits**: projected contributions per account and how much of each limit is used | table | Candidate |
| RPT-BLD-9 | **Financial independence progress**: investable assets against the requirement, and the bridge check (FR-BLD-27) | chart | Candidate |

**Retiring Years** (ssmodel's outputs carry forward)

| ID | Report | Form | Status |
|---|---|---|---|
| RPT-RET-1 | **Recommendation card, claim-age curve, balance fan, year-by-year table, withdrawal schedule, sensitivity, percentile paths** (ssmodel FR-OUT-1 to FR-OUT-9) | as in ssmodel | Base |
| RPT-RET-2 | **Joint claiming map**: success or objective for each pair of claiming dates (FR-RET-2) | heat map | Candidate |
| RPT-RET-3 | **Earliest retirement date** for a range of success thresholds (FR-RET-8) | chart | Candidate |

**Whole life (across phases)**

| ID | Report | Form | Status |
|---|---|---|---|
| RPT-LIFE-1 | **Net worth, past and future**: ledger net worth joined to the projected fan at "today", with goal and retirement milestones. The app's signature chart | chart | Base |
| RPT-LIFE-2 | **Income sources over life**: wages, Social Security, pensions, withdrawals (extends ssmodel's income stack) | chart | Base |
| RPT-LIFE-3 | **Taxes over life**, by kind (extends ssmodel's taxes chart) | chart | Base |
| RPT-LIFE-4 | **Scenario comparison**: ssmodel's Compare extended to goals and the Building Years (ssmodel FR-UI-2) | table, chart | Base |
| RPT-LIFE-5 | **Spending over life** by planning group, actual then projected | chart | Candidate |
| RPT-LIFE-6 | **Giving over life**, actual and planned *(OQ-PRD-4)* | chart | Candidate |

The Home dashboard's tiles (FR-UI-34) are small versions of these reports and link to them.

---

## 16. Help and getting started (FR-HLP)

Many users will never have kept a ledger or used a planning tool. Help has three layers: getting started, help in
place, and reference pages.

### 16.1 Getting started

- **FR-HLP-1** **Sample households:** synthetic households covering a range of ages, marital status and wealth.
  Each is a complete `.plens` file with 2 to 3 years of ledger history, this year's budget with actuals to date, a
  draft for next year, goals, and a plan ready to run *(OQ-HLP-4)*:

  | ID | Household | Stage | Means | Shows |
  |---|---|---|---|---|
  | S1 | Single, 24, first job, renting, student loans | starting out | modest income, few assets | budget, student loan payoff, emergency fund |
  | S2 | Married, 31 and 29, one child and one planned, renting | young family | middle income | house goal, college, new child, childcare |
  | S3 | Single parent, 38, two children, modest home | mid-career | lower-middle income | head of household, child tax credit, tight cash flow |
  | S4 | Married, 46 and 44, two teenagers, mortgage | mid-career | upper-middle income | college, mortgage paydown, catch-up saving |
  | S5 | Married, 55 and 53, high income, large 401(k)s, second home | peak earning | affluent | giving pledge, gift bunching, financial independence, Roth choices |
  | S6 | Married, 62 and 60, near retirement | near-retiree | middle to affluent | joint claiming, inheritance, Retiring Years |
  | S7 | Widowed, 76, home paid off, Social Security and a small IRA | retired | modest | single filer, RMDs, aging in place, care reserve |
  | S8 | Married, 70 and 68, SC teacher's pension | retired | middle income | pension, travel phase, legacy |

  Samples are generated by a script from seeded parameters, so they are reproducible and can be refreshed when
  rules or the schema change *(OQ-HLP-3, OQ-HLP-7)*. They are never derived from real data (ssmodel's `private/`
  rule carries forward). They double as the life-stage test households (NFR-TEST-12).
- **FR-HLP-2** **Trying a sample.** Home (no file open) offers "Try a sample". The sample opens as a temporary copy in
  OPFS, with no password, marked "Sample: changes aren't saved". "Save a copy…" turns it into a real file.
- **FR-HLP-3** **Onboarding** (replaces draft 0.1's FR-PRD-4):
  1. Create a file and a password.
  2. Life-stage questions: adults, ages, dependents, state, working or retired.
  3. Choose a chart of accounts. The answers pick a variant with roles set (FR-LED-8, FR-ROLE-6).
  4. Enter starting balances, or import statements.
  5. Get a budget suggestion.
  6. Pick suggested goals for the life stage.
  Each step can be skipped and returned to.
- **FR-HLP-4** **Getting-started checklist** on Home, like ssmodel's completeness checklist. It tracks setup tasks:
  accounts with roles and starting balances, a first import, a budget, goals, each adult's earnings record, and
  retirement dates. Each item links to the page that completes it. The checklist hides when done or dismissed
  *(OQ-HLP-1)*.
- **FR-HLP-5** **Empty states.** A page with no data explains what belongs there and why it matters, offers the
  action that fills it (import, add, start from a template), and links to its help page.
- **FR-HLP-6** **Plain ledger entry.** Double-entry stays the model, but beginners need not see debits and credits.
  Registers can show signed amounts with plain labels ("spent", "received", "payment", "charge"), and transfers as
  "from" and "to" *(OQ-HLP-6)*.

### 16.2 Help in place

- **FR-HLP-7** **Tooltips and explanations:** tooltips on every input (FR-UI-37) and "explain a number" (FR-UI-36).
- **FR-HLP-8** **Page help.** Every page has a help button (and F1) that opens that page's help in a side panel
  without leaving the page.
- **FR-HLP-9** **Glossary terms.** Terms such as PIA, RMD, IRMAA, sinking fund, role and planning group are marked
  where they appear, show a short definition on hover, and link to the glossary.

### 16.3 Reference help

- **FR-HLP-10** **Help pages** are bundled with the app and work offline (cached by the service worker, NFR-ARCH-7)
  *(OQ-HLP-2)*. They are written in Markdown in the repo, built into the app, and searchable by title and text.
  Contents:
  - **getting started:** a tour of the timeline, the first file, importing, the first budget;
  - **concepts:** double-entry for non-accountants, accounts and roles, categories, budget patterns, goals and
    priorities, how the simulation works, success probability and percentiles, real and nominal dollars;
  - **how-to guides:** check a balance against a statement, set up a paycheck, plan a house purchase, compare
    scenarios, move to a new computer, back up and restore;
  - **reference:** each page, each goal kind, the role catalog, the report catalog, rule tables and their sources;
  - **FAQ**, privacy (data never leaves the device), the disclaimer, and release notes *(OQ-HLP-5)*.
- **FR-HLP-11** **Help stays current.** A page's help is part of that page's definition of done. Help names screens
  and buttons exactly as the UI does, and tests check that every page's help link resolves (NFR-TEST-18).
- **FR-HLP-12** **Support.** A "copy diagnostics" button copies the app version, rule table years, browser version
  and recent errors, never household data *(OQ-PRD-5)*. There is no telemetry.

---

## 17. Open questions

Each question has options (where there is a choice) and a lean. The leans are suggestions to push back on. Record
the decision under *Answer*.

### Product and scope

- **OQ-PRD-1 Name check.** Should "ProvisionLens" (name and domain) be checked for conflicts before friends use it?
  - *Lean*: a quick check before the first release outside the family; a fuller check before any public release.
  - *Answer*:
- **OQ-PRD-2 Distribution and licence.**
  - *Options*:
    1. Private repo, free for invited users.
    2. Open source.
    3. Paid later.
  - *Lean*: Option 1 for now. Keep the repo private and host the static build at an unlisted URL. Revisit before
    inviting anyone outside family and friends.
  - *Answer*:
- **OQ-PRD-3 Rule-update promise.** What happens if a year's tables are late?
  - *Options*:
    1. Keep using last year's, projected forward, with a warning.
    2. Block planning until updated.
  - *Lean*: Option 1, as ssmodel already does for projected 2027 values.
  - *Answer*:
- **OQ-PRD-4 Stewardship features.** What does "Biblical Stewardship" mean in the product?
  - *Options*:
    1. Name and tagline only.
    2. Giving as a first-class category with goals and reports (FR-BUD-22).
    3. Also guidance content (Scripture references, generosity and contentment prompts, debt-freedom framing).
  - *Lean*: Option 2 now, option 3 as optional content later. Decide the tone carefully, since the audience will vary.
  - *Answer*:
- **OQ-PRD-5 Support.** Who answers questions, and how?
  - *Lean*: you, by email, with "copy diagnostics" (FR-PRD-6). Keep a FAQ in the help pages.
  - *Answer*:
- **OQ-PRD-6 Youngest life stage.** Students with no income?
  - *Lean*: from the first full-time job. Students can still use the ledger and budget.
  - *Answer*:
- **OQ-PRD-7 Release order.** What must exist for the first friend to use it?
  - *Options*:
    1. Everything in this document.
    2. Ledger, import and budget first (Past, This Year, Next Year). Building Years next, Retiring Years already exists.
    3. The generic plan first, then ledger and budget.
  - *Lean*: Option 2. Ledger plus budget is useful to everyone at once, and Building Years needs the budget to feed it.
  - *Answer*:

### Household

- **OQ-HH-1 Unmarried partners.** Two adults sharing finances who file separately.
  - *Lean*: out for now. One file per tax household. Revisit if a friend needs it.
  - *Answer*:
- **OQ-HH-2 Marriage or divorce during the plan.**
  - *Lean*: out. Model a future marriage as a separate scenario file.
  - *Answer*:
- **OQ-HH-3 Planned children.** Dependents with future birth dates?
  - *Lean*: yes. This is cheap and matters for young couples' college and childcare goals.
  - *Answer*:
- **OQ-HH-4 Supporting parents or adult children.**
  - *Lean*: as budget lines and goals. No dependent tax treatment unless asked for.
  - *Answer*:
- **OQ-HH-5 Married filing separately.**
  - *Lean*: out (rare, complex).
  - *Answer*:
- **OQ-HH-6 Sex field.** Life tables need male or female.
  - *Lean*: keep it required, labeled "for life-expectancy tables", with an option to use a blended table.
  - *Answer*:

### Ledger

- **OQ-LED-1 Money representation.**
  - *Options*:
    1. Ledger and budget in integer cents, planning in float dollars, converted at one boundary.
    2. Integer cents everywhere.
  - *Lean*: Option 1. The engine's float math and its rounding rules are tested and correct.
  - *Answer*:
- **OQ-LED-2 Stored currency format.** Checquery stores `$#,###.##` strings in actions.
  - *Options*:
    1. Keep it for compatibility.
    2. Integer cents in new actions, with a migration.
  - *Lean*: Option 2 with a log migration, since a display format makes a poor storage format. Do it once, during the
    port.
  - *Answer*:
- **OQ-LED-3 Keep the change log?** Without a server or multiple users, plain tables would be simpler.
  - *Lean*: keep it. It gives history, undo, auditability and a path to merging copies, and it's already built and
    tested.
  - *Answer*:
- **OQ-LED-4 Undo for ledger edits.**
  - *Lean*: yes, within a session, as compensating actions. This matches ssmodel's FR-UI-13.
  - *Answer*:
- **OQ-LED-5 Investment holdings.**
  - *Options*:
    1. Balances only, with revaluations.
    2. Holdings, lots and prices.
  - *Lean*: Option 1. Holdings are a large feature that the plan doesn't need.
  - *Answer*:
- **OQ-LED-6 Paychecks.**
  - *Options*:
    1. Gross with split deductions.
    2. Net only.
    3. Either.
  - *Lean*: Option 3, with templates that make option 1 easy. Option 1 gives better tax estimates and savings-rate
    figures.
  - *Answer*:
- **OQ-LED-7 Date for budget actuals.** The posted date (when money changed hands) or the cleared date (when it reached
  the bank, Checquery's register date)?
  - *Lean*: posted date. Month boundaries should follow when spending happened.
  - *Answer*:
- **OQ-LED-8 Statement reconciliation screen** beyond balance assertions.
  - *Lean*: later.
  - *Answer*:
- **OQ-LED-9 Receipts and attachments.**
  - *Lean*: out. They'd bloat the file.
  - *Answer*:

### Accounts and roles

- **OQ-ROLE-1 Is a role required?**
  - *Options*:
    1. Required for every account, with a generic role per type as the default.
    2. Optional: an account without a role is ignored by planning.
  - *Lean*: Option 1. A role is never blank, and the role map points out generic roles that look wrong.
  - *Answer*:
- **OQ-ROLE-2 Who defines roles?**
  - *Options*:
    1. A fixed catalog in the app.
    2. The fixed catalog plus user-defined roles that borrow a built-in role's behavior under a new name.
  - *Lean*: Option 1. Roles exist for the engines; a new name with old behavior adds nothing the category tree
    doesn't already give.
  - *Answer*:
- **OQ-ROLE-3 Accounts that don't exist yet** (a future mortgage, a 529 for a planned child).
  - *Options*:
    1. Planned accounts that live only in the plan, linked to a real account once opened.
    2. Real ledger accounts with a zero balance, created now.
    3. No accounts: goals track their own balances internally.
  - *Lean*: Option 1. The ledger stays a record of what exists, and scenarios can differ in which accounts they plan.
  - *Answer*:
- **OQ-ROLE-4 A 401(k) with traditional and Roth money.**
  - *Options*:
    1. Two ledger accounts, one per role.
    2. One account with a Roth share attribute.
  - *Lean*: Option 1. Statements usually report the sources separately, and the tax treatment must be exact.
  - *Answer*:
- **OQ-ROLE-5 Tax account granularity.**
  - *Options*:
    1. Federal income tax one per household; state income tax one per household; Social Security and Medicare tax
       one per person each.
    2. As option 1, with one state income tax account per state lived in.
    3. One combined payroll (FICA) account per person.
  - *Lean*: Option 1. Social Security tax per person checks the earnings record and the wage base, and Medicare tax
    separately covers Additional Medicare. A move between states is rare enough to use one account with dated
    residence.
  - *Answer*:
- **OQ-ROLE-6 Employer contributions in the ledger.**
  - *Options*:
    1. Recorded as income (an employer contributions role) into the plan account, as part of the paycheck template.
    2. Not recorded separately; they show up in the account's revaluations.
  - *Lean*: Option 1. Savings rate and the plan need the match, and the income role is excluded from take-home pay.
  - *Answer*:
- **OQ-ROLE-7 Where role attributes live.**
  - *Options*:
    1. On the account entity in the change log.
    2. In the planning document, keyed by account ID.
    3. Facts (owner, loan terms, basis, links) on the account; assumptions (returns, fees, glide paths) in plan
       scenarios.
  - *Lean*: Option 3. It matches ssmodel's split between facts and plan (ssmodel Section 8.1), and scenarios can vary
    the assumptions.
  - *Answer*:
- **OQ-ROLE-8 Emergency fund: a role or a goal?**
  - *Options*:
    1. An "emergency fund" cash role on a dedicated account.
    2. Any cash account, with the emergency fund goal (FR-BLD-4) or an earmark (FR-BUD-20) saying how much is set
       aside.
  - *Lean*: Option 2. Roles say what an account is; goals say what money is for.
  - *Answer*:
- **OQ-ROLE-9 How fine are expense roles?**
  - *Options*:
    1. Planning-group roles plus the specific roles taxes and engines need (FR-ROLE-4).
    2. Finer roles (groceries, transportation, utilities) for templates and benchmarks.
  - *Lean*: Option 1. Finer detail belongs in the category tree, which the user controls.
  - *Answer*:
- **OQ-ROLE-10 Changing the catalog.** When a release adds or splits a role, how do files catch up?
  - *Lean*: a file migration maps old roles to new ones, and the role map flags accounts to review.
  - *Answer*:

### Import

- **OQ-IMP-1 Formats first.**
  - *Options*:
    1. CSV with mapping profiles.
    2. OFX/QFX.
    3. QIF from Quicken.
  - *Lean*: Option 1, then option 2. Option 3 only if someone migrating from Quicken asks.
  - *Answer*:
- **OQ-IMP-2 Categorization.**
  - *Options*:
    1. Rules only.
    2. Rules plus history-based suggestions.
  - *Lean*: Option 2. Suggestions are always flagged for review.
  - *Answer*:
- **OQ-IMP-3 Direct bank connections** (aggregators).
  - *Lean*: no. They need a server and send data to third parties, which contradicts D2 and NFR-ARCH-1.
  - *Answer*:
- **OQ-IMP-4 Importing from other apps** (YNAB, Monarch, spreadsheets).
  - *Lean*: through CSV mapping. No dedicated importers unless a friend needs one.
  - *Answer*:

### Budget

- **OQ-BUD-1 Budgeting style.**
  - *Options*:
    1. Plan vs. actual: set expectations and track variances.
    2. Zero-based: every dollar of income is assigned.
    3. Envelope: unspent amounts roll over, and spending is limited to what's in the envelope.
  - *Lean*: Option 1 as the base, with an optional "assign every dollar" check (FR-BUD-14) and per-line rollover
    (OQ-BUD-10). Full envelope accounting changes how the ledger works.
  - *Answer*:
- **OQ-BUD-2 Line granularity.**
  - *Options*:
    1. Leaf accounts only.
    2. Any category level. For example, budget "Food" without splitting groceries and dining.
  - *Lean*: Option 2. If a category has a line, its children can't have lines too. Actuals roll up.
  - *Answer*:
- **OQ-BUD-3 Vendor-level lines.** Track Netflix separately within Subscriptions?
  - *Lean*: yes, optional. The rest of the account goes to "other" (FR-BUD-16).
  - *Answer*:
- **OQ-BUD-4 Budget year.** Calendar year, or a custom start month?
  - *Lean*: calendar, to match taxes and the plan.
  - *Answer*:
- **OQ-BUD-5 Versions.**
  - *Options*:
    1. One budget per year, with an original snapshot.
    2. Several named budgets per year (for example, "with new job").
  - *Lean*: Option 1. What-if budgets belong in plan scenarios.
  - *Answer*:
- **OQ-BUD-6 Seasonal entry.**
  - *Options*:
    1. 12 explicit amounts.
    2. An annual total times named weights.
    3. Both.
  - *Lean*: Option 3. Profiles can be derived from last year's actuals.
  - *Answer*:
- **OQ-BUD-7 Weekend and holiday shifting.**
  - *Lean*: weekend shifting as a per-line option (earlier or later). Holidays are out.
  - *Answer*:
- **OQ-BUD-8 Every-N-years items** (a car registration every 2 years, a roof every 25).
  - *Lean*: allowed in the budget when they fall due. The plan repeats them (FR-BUD-23).
  - *Answer*:
- **OQ-BUD-9 Sinking funds.**
  - *Options*:
    1. Virtual earmarks inside a cash account.
    2. Real ASSET sub-accounts with transfers.
    3. Both.
  - *Lean*: Option 1 first. It's lighter, and many people don't want extra accounts. Option 2 works already through
    goals.
  - *Answer*:
- **OQ-BUD-10 Rollover.** Unspent amounts carry to the next month or year?
  - *Lean*: per-line option, off by default, on for earmarked irregular lines.
  - *Answer*:
- **OQ-BUD-11 Loan payments.** Split principal and interest automatically from the loan's amortization?
  - *Lean*: yes. The interest goes to an EXPENSE account and the principal to the LIABILITY account. The user enters
    only the payment.
  - *Answer*:
- **OQ-BUD-12 Taxes in the budget.**
  - *Options*:
    1. The user enters withholding.
    2. The engine computes taxes as lines.
  - *Lean*: Option 1, with the engine's estimate beside it (FR-BUD-25). Withholding is what actually hits the bank.
  - *Answer*:
- **OQ-BUD-13 Budget from history.**
  - *Options*:
    1. Averages and last year's same-month amounts.
    2. Detecting recurring patterns (frequency, day).
  - *Lean*: Option 1 first, option 2 later. Pattern detection is useful but fiddly.
  - *Answer*:
- **OQ-BUD-14 Starting mid-year.** A friend starts in June.
  - *Lean*: a full-year budget, with past months showing imported actuals if available, or marked "no data".
  - *Answer*:
- **OQ-BUD-15 Overspending alerts.**
  - *Lean*: in-app indicators only. Push notifications would need a server.
  - *Answer*:
- **OQ-BUD-16 Percentage lines.** Percentage of gross or net, budgeted or actual income?
  - *Lean*: the user picks gross or net. The budget uses budgeted income. Tracking compares against actual income
    received (useful for giving).
  - *Answer*:
- **OQ-BUD-17 Saving in the budget.** Do goal contributions appear as budget lines, or only in Building Years?
  - *Lean*: as budget lines to ASSET accounts linked to goals. One number, entered once (FR-BUD-24).
  - *Answer*:
- **OQ-BUD-18 Two budgets in flight.** In November, the user edits next year's draft while this year is still active.
  - *Lean*: allowed. Next year's draft starts from this year's forecast (FR-BUD-18).
  - *Answer*:

### Building Years

- **OQ-BLD-1 Time step.**
  - *Options*:
    1. Yearly, as ssmodel.
    2. Monthly throughout.
    3. Monthly for the budget year and the first few years, then yearly.
  - *Lean*: Option 1 for the simulation, with monthly amortization inside each year for loans, and the budget year from
    the budget engine. Measure before considering option 2.
  - *Answer*:
- **OQ-BLD-2 Allocation.**
  - *Options*:
    1. A user-ordered priority list with a recommended default.
    2. An optimizer.
  - *Lean*: Option 1. It's explainable and matches how people think. Option 2 maybe later for "the best order".
  - *Answer*:
- **OQ-BLD-3 Uncertain goal targets** (house prices, college costs).
  - *Lean*: deterministic within a scenario. Use scenarios and levers for ranges, and Monte Carlo for markets and
    inflation only.
  - *Answer*:
- **OQ-BLD-4 College cost data.**
  - *Options*:
    1. User-entered.
    2. Presets from published averages (for example, College Board), as rule data with a source URL, updated yearly.
  - *Lean*: Option 2 with user override.
  - *Answer*:
- **OQ-BLD-5 Financial aid.**
  - *Lean*: out. The user enters expected aid or scholarships as a reduction.
  - *Answer*:
- **OQ-BLD-6 Money left in a 529.** Model the 529-to-Roth rollover (lifetime cap, account-age rule)?
  - *Lean*: later. At first, leftover funds stay invested and are reported.
  - *Answer*:
- **OQ-BLD-7 Federal student loan plans.**
  - *Options*:
    1. A user-entered payment, plus optional forgiveness date and amount.
    2. Modeled income-driven plans.
  - *Lean*: Option 1. Federal plan rules changed in 2025–26 and are still settling. Option 2 only with rule data and a
    clear source.
  - *Answer*:
- **OQ-BLD-8 Rent vs. buy.**
  - *Lean*: later, as a scenario comparison over the house goal.
  - *Answer*:
- **OQ-BLD-9 Refinancing.**
  - *Lean*: as a dated change (rate, term, costs). No rate forecasting.
  - *Answer*:
- **OQ-BLD-10 Employer match.** How general?
  - *Lean*: two tiers plus a non-elective percentage. No true-up, no per-paycheck limits.
  - *Answer*:
- **OQ-BLD-11 Vesting.**
  - *Lean*: ignore. Assume vested.
  - *Answer*:
- **OQ-BLD-12 Backdoor and mega-backdoor Roth.**
  - *Lean*: out at first. Show a warning when Roth IRA contributions exceed eligibility.
  - *Answer*:
- **OQ-BLD-13 Self-employment.** Self-employment tax, SEP and solo 401(k), the QBI deduction.
  - *Lean*: out at first. Decide early whether any first user needs it, since it changes payroll and contribution logic.
  - *Answer*:
- **OQ-BLD-14 Stock compensation** (RSUs, ESPP).
  - *Lean*: out. RSUs can be entered as bonuses.
  - *Answer*:
- **OQ-BLD-15 Insurance needs** (life, disability).
  - *Lean*: out. Premiums are budget lines. Maybe later: a simple "what if a working adult dies in year X" scenario,
    which the engine's mortality model nearly supports already.
  - *Answer*:
- **OQ-BLD-16 Vehicle financing.**
  - *Lean*: a vehicle goal with an optional loan share. The loan enters the debt model.
  - *Answer*:
- **OQ-BLD-17 Emergency fund target.**
  - *Lean*: months of essential plus housing expenses from the budget, default 6. It can also be a fixed amount.
  - *Answer*:
- **OQ-BLD-18 Glide paths.** Allocation becoming more conservative with age (target-date style)?
  - *Lean*: an optional preset glide path per account (moderate to conservative by retirement), otherwise fixed returns
    as today.
  - *Answer*:
- **OQ-BLD-19 Wage uncertainty.** Job loss, or random wage growth, in Monte Carlo?
  - *Lean*: deterministic at first. "Job loss in year X" as a scenario.
  - *Answer*:
- **OQ-BLD-20 Retirement date.** Input only, or also searched?
  - *Lean*: input, plus "earliest date with ≥ X% success" as an output (FR-RET-8).
  - *Answer*:
- **OQ-BLD-21 Goal conflicts.** When the surplus can't fund everything, should the app suggest changes (later date,
  lower target)?
  - *Lean*: show what each goal would need. Suggestions later.
  - *Answer*:
- **OQ-BLD-22 Earliest affordable date.** How is it found?
  - *Options*:
    1. Try each year in the range with the deterministic recompute, then confirm the chosen year with Monte Carlo.
    2. Monte Carlo for every year.
  - *Lean*: Option 1, the same approach as the joint claiming search (NFR-SIM-4).
  - *Answer*:
- **OQ-BLD-23 K–12 and 529.** Model 529 withdrawals for K–12 tuition, including SC's treatment of them?
  - *Lean*: yes, with the cap and SC rules as rule data with sources. Verify current federal and SC rules before
    building, since both changed recently.
  - *Answer*:
- **OQ-BLD-24 Gift and estate tax.**
  - *Lean*: flag gifts above the annual exclusion and stop there. Estate tax is out of scope for this audience.
  - *Answer*:
- **OQ-BLD-25 Home value after projects.** Add a value increase to the home?
  - *Lean*: an optional percentage of cost, default 0, since many projects don't pay back.
  - *Answer*:
- **OQ-BLD-26 Financial independence target.**
  - *Options*:
    1. A rule of thumb (25 × spending).
    2. Computed from the plan's own spending, taxes and Social Security after the target date, with a success
       probability.
  - *Lean*: Option 2. Show the rule of thumb beside it for reference.
  - *Answer*:
- **OQ-BLD-27 Pledge priority.** Should pledges come before the emergency fund and debt payoff?
  - *Lean*: right after the employer match by default, since a pledge is a commitment. The user can move it.
  - *Answer*:
- **OQ-BLD-28 Legacy floor vs. objective.**
  - *Options*:
    1. A hard floor: paths that end below it count as failures.
    2. A soft target, reported as a probability.
  - *Lean*: Option 2 by default, with option 1 available as a setting. A hard floor makes the success rate fall sharply.
  - *Answer*:
- **OQ-BLD-29 Gift bunching.** Model a donor-advised fund as an account, or only the timing of deductions?
  - *Lean*: timing only. The fund's balance isn't the household's money once given.
  - *Answer*:
- **OQ-BLD-30 Child-owned accounts.** Model kiddie tax and the effect on financial aid?
  - *Lean*: out. Child-owned accounts are tracked and projected only, not taxed in the household's return.
  - *Answer*:
- **OQ-BLD-31 Skipping nice-to-haves on bad paths.** In retirement, should the simulation skip or shrink nice-to-have
  goals on paths where the portfolio has fallen a lot (a spending guardrail)?
  - *Options*:
    1. Never: goals are paid or the path fails.
    2. Skip nice-to-haves below a portfolio threshold.
    3. Scale them down proportionally.
  - *Lean*: Option 2, available as a setting and off by default. It makes plans more realistic but harder to
    explain, so report how often goals were skipped.
  - *Answer*:
- **OQ-BLD-32 ssmodel's one-time expenses.**
  - *Options*:
    1. Convert them all to goals.
    2. Keep one-time expense items and add goals beside them.
  - *Lean*: Option 1, with "custom" as the catch-all. Two ways of entering the same thing confuse people. Keep ssmodel's
    recurring expense items as budget-derived spending.
  - *Answer*:
- **OQ-BLD-33 Spending shape in retirement.** Is the "go-go years" pattern a goal (FR-BLD-37), or a general retirement
  spending curve in assumptions (spending falling with age, then health costs rising)?
  - *Lean*: a goal for travel and similar extras, plus an optional real-spending decline per year in assumptions. Health
    costs already rise through medical inflation.
  - *Answer*:

### Retiring Years

- **OQ-RET-1 Joint claiming search.**
  - *Options*:
    1. A deterministic prefilter, then Monte Carlo on the top 20.
    2. Coarse to fine on a 2-D grid.
    3. A full grid with fewer paths.
  - *Lean*: Option 1. It reuses NFR-UI-2's fast recompute.
  - *Answer*:
- **OQ-RET-2 Claiming advice for younger users.**
  - *Lean*: recommend only within 10 years of age 62. Before that, claiming is an assumption (FR-RET-3).
  - *Answer*:
- **OQ-RET-3 Trust-fund cut.**
  - *Options*:
    1. None.
    2. The cut scheduled in the Trustees Report, from its depletion year.
    3. A user-set percentage and year.
    4. Random.
  - *Lean*: Option 2 as the default for users under 55, with options 1 and 3 also offered. Defer option 4.
  - *Answer*:
- **OQ-RET-4 Inheritances.** Keep the full ssmodel model for everyone?
  - *Lean*: keep it, hidden by default, and generalized to several benefactors.
  - *Answer*:
- **OQ-RET-5 Divorced-spouse and survivor-of-ex benefits.**
  - *Lean*: still out.
  - *Answer*:
- **OQ-RET-6 Defined-benefit pensions** (for example, SC Retirement System teachers).
  - *Lean*: in, using the annuity model (FR-RET-7). No accrual formulas. The user enters the projected benefit.
  - *Answer*:

### Taxes

- **OQ-TAX-1 Which credits and deductions at first.** Candidates: child tax credit, dependent care credit, student loan
  interest, education credits (AOTC/LLC), saver's credit, EITC, the ACA premium tax credit, the adoption credit.
  - *Lean*: child tax credit, student loan interest and the premium tax credit at first. AOTC next. The rest when
    someone needs them.
  - *Answer*:
- **OQ-TAX-2 Moving between states.**
  - *Options*:
    1. Residence changes on January 1 of the year after the move.
    2. Real part-year apportionment.
  - *Lean*: Option 1.
  - *Answer*:
- **OQ-TAX-3 Order of new states.**
  - *Lean*: states without income tax first (nearly free), then where the first users live.
  - *Answer*:
- **OQ-TAX-4 State-tax interface.**
  - *Options*:
    1. Code per state.
    2. A parameterized model (brackets, standard deduction, retirement and Social Security exclusions, age deductions)
       with per-state code hooks.
  - *Lean*: Option 2. Most states fit a parameterized model with a few quirks.
  - *Answer*:
- **OQ-TAX-5 Local taxes.**
  - *Lean*: out. Property tax stays a home cost.
  - *Answer*:

### Storage

- **OQ-STO-1 Autosave.**
  - *Options*:
    1. Autosave everything.
    2. Explicit Save, as in ssmodel.
    3. Autosave the ledger, explicit Save for plans.
  - *Lean*: Option 1, with what-ifs as a session overlay until applied.
  - *Answer*:
- **OQ-STO-2 Encryption.** Required, on by default, or off by default?
  - *Lean*: on by default, and can be turned off with a clear warning. Unencrypted files are useful for test fixtures.
  - *Answer*:
- **OQ-STO-3 Recovery key.**
  - *Lean*: a random key, shown once as words to print or store, which also wraps the file key. Changing the password
    doesn't invalidate it.
  - *Answer*:
- **OQ-STO-4 Backups.** How many, where, and how often?
  - *Lean*: the last 10 in OPFS, and at most one a day in the backup folder, keeping 30 days plus monthly copies.
  - *Answer*:
- **OQ-STO-5 Two computers.**
  - *Options*:
    1. A warning only.
    2. Merge diverged copies using the change log's timestamps and origins.
  - *Lean*: Option 1 at first. Design the log so that option 2 stays possible.
  - *Answer*:
- **OQ-STO-6 Where each kind of data lives.**
  - *Options*:
    1. Everything as change-log entities.
    2. The ledger and budget as entities, the long-range plan as one JSON document.
    3. Everything except the ledger as a document.
  - *Lean*: Option 2. Budget lines are record-like and tied to accounts. Plan scenarios are deep, nested and already
    validated as one document.
  - *Answer*:
- **OQ-STO-7 `.checquery` files.** Keep opening them forever, or one-time conversion only?
  - *Lean*: conversion only (FR-MIG-1). Remove it after the household's own switch, plus a release or two.
  - *Answer*:

### User interface

- **OQ-UI-1 Navigation model.**
  - *Options*:
    1. Timeline (Past, This Year, Next Year, Building, Retiring).
    2. Functional (Ledger, Budget, Goals, Retirement).
    3. Timeline plus a Goals page that spans phases.
  - *Lean*: Option 3. Keep the timeline rebrand.md suggests, but give goals their own page, since they cross the
    working/retired boundary. Ledger pages sit under Past, and the command palette reaches everything.
  - *Answer*:
- **OQ-UI-2 Home dashboard.** What's on it, and can it be customized?
  - *Lean*: the fixed set in FR-UI-34, with show/hide like ssmodel's layout settings (FR-UI-17).
  - *Answer*:
- **OQ-UI-3 Life stage.** Collapse sections that don't apply, or hide them entirely?
  - *Lean*: collapse, with a one-line explanation.
  - *Answer*:
- **OQ-UI-4 One Console or two.** Building Years and Retiring Years in one Console with tabs, or separate ones?
  - *Lean*: one Console with a phase selector. Both are one simulation.
  - *Answer*:

- **OQ-UI-5 Main navigation.**
  - *Options*:
    1. A left sidebar with sections and pages.
    2. Top tabs for sections, with a page list inside each.
    3. Checquery's breadcrumbs with hover menus.
  - *Lean*: Option 1. It holds nine sections and their pages, shows where you are, and collapses to icons at 1280 px.
  - *Answer*:
- **OQ-UI-6 Routing.**
  - *Options*:
    1. TanStack Router with hash history.
    2. A small hand-written hash router.
    3. No URLs: state-driven views, as both apps do today.
  - *Lean*: Option 1. Typed route parameters, from the same family as TanStack Table. Hash history suits static
    hosting and the file handler's launch at `/`.
  - *Answer*:
- **OQ-UI-7 Breadcrumbs.**
  - *Options*:
    1. Only as a drill-down trail.
    2. On every page, as secondary navigation.
    3. None.
  - *Lean*: Option 1.
  - *Answer*:
- **OQ-UI-8 A second window.** With the single-writer lock (FR-STO-4), can a second window show a report beside the
  register?
  - *Options*:
    1. No: a second window is refused.
    2. Yes, read-only, updated live from the writer window (BroadcastChannel).
  - *Lean*: Option 1 at first, option 2 later. Side-by-side viewing is useful on a large monitor.
  - *Answer*:
- **OQ-UI-9 Phase colors.**
  - *Options*:
    1. One quiet hue per timeline phase, in the sidebar and timeline charts.
    2. No phase colors; color only for status and series.
  - *Lean*: Option 1, kept subtle so it never competes with status colors.
  - *Answer*:
- **OQ-UI-10 Accessibility target.**
  - *Options*:
    1. WCAG 2.2 AA, with automated checks.
    2. Best effort.
  - *Lean*: Option 1. shadcn's Radix base makes it cheap if tested from the start.
  - *Answer*:
- **OQ-UI-11 Brand design.**
  - *Options*:
    1. A simple wordmark and icon made in-house.
    2. A designer before the first release to friends.
    3. A designer before any public release.
  - *Lean*: Option 1 now, option 3 later.
  - *Answer*:
- **OQ-UI-12 Where account management lives.**
  - *Options*:
    1. All under Setup.
    2. A top-level Accounts section with registers and editing.
    3. Registers for primary accounts in the sidebar under Past (Checquery's `isPrimary` shortcuts); editing the
       account tree, categories and vendors under Setup.
  - *Lean*: Option 3. Daily work (registers) is one click away; structural edits stay out of the way.
  - *Answer*:
- **OQ-UI-13 Register design.**
  - *Options*:
    1. Keep Checquery's register layout, restyled.
    2. Rebuild it on the shared TanStack grid, keeping Checquery's keyboard behaviors.
  - *Lean*: Option 2. One grid component for every table keeps behavior and look consistent.
  - *Answer*:

### Reports

- **OQ-RPT-1 First-release reports.**
  - *Options*:
    1. Every Base report in the areas released.
    2. A smaller first set, with the rest marked Candidate.
  - *Lean*: Option 1, following the release order (OQ-PRD-7). Decide each area's Candidates before its release.
  - *Answer*:
- **OQ-RPT-2 Custom reports.**
  - *Options*:
    1. Fixed reports with filters and saved views.
    2. Also a report builder (choose rows, columns, measure).
    3. Also a read-only SQL page for power users, since the data is in SQLite.
  - *Lean*: Option 1. Option 3 later as an "advanced" page; it costs little and suits some users.
  - *Answer*:
- **OQ-RPT-3 Where saved views are kept.**
  - *Options*:
    1. In the household file.
    2. In the browser.
  - *Lean*: Option 1. They belong to the household and should follow the file, unlike ssmodel's layout settings.
  - *Answer*:
- **OQ-RPT-4 Spending-by-category chart.**
  - *Options*:
    1. Horizontal bars.
    2. Donut.
    3. Treemap.
  - *Lean*: Option 1, with a treemap toggle. Donuts make amounts hard to compare.
  - *Answer*:
- **OQ-RPT-5 Money-flow (Sankey) chart.**
  - *Options*:
    1. In, at the top levels of the tree only.
    2. Out.
  - *Lean*: Option 1 as a Candidate. It's popular, but hard to read beyond a dozen flows.
  - *Answer*:
- **OQ-RPT-6 Tax summary depth.**
  - *Options*:
    1. Totals by tax role.
    2. Mapped to Form 1040 lines and schedules.
    3. An export for tax software.
  - *Lean*: Option 1. Form mapping changes every year and invites treating the app as tax software.
  - *Answer*:
- **OQ-RPT-7 Default report period.**
  - *Options*:
    1. The calendar year.
    2. The trailing 12 months.
  - *Lean*: Option 1, matching the budget and taxes, with the trailing 12 months one click away.
  - *Answer*:
- **OQ-RPT-8 Investment returns.**
  - *Options*:
    1. The split into contributions, withdrawals and market change only.
    2. Also a money-weighted return (XIRR) per account.
    3. Also a time-weighted return.
  - *Lean*: Option 1 first, then option 2. The ledger knows every cash flow, but valuations are only as frequent as
    statements, so time-weighted returns would be rough.
  - *Answer*:
- **OQ-RPT-9 Charting.** Recharts covers most charts. A treemap, Sankey or goal timeline may need more.
  - *Options*:
    1. Recharts plus custom SVG where needed.
    2. Add a second charting library.
  - *Lean*: Option 1. One library keeps charts consistent (FR-UI-29).
  - *Answer*:
- **OQ-RPT-10 Printing.**
  - *Options*:
    1. Browser printing with a print stylesheet.
    2. Generated PDFs.
  - *Lean*: Option 1. It works offline with no extra library, and "Save as PDF" covers PDFs.
  - *Answer*:

### Help

- **OQ-HLP-1 Guided tour.**
  - *Options*:
    1. Checklist and empty states only.
    2. Also an interactive step-by-step tour overlay.
  - *Lean*: Option 1. Tours are often skipped and break as the UI changes.
  - *Answer*:
- **OQ-HLP-2 Where help lives.**
  - *Options*:
    1. In the app only.
    2. In the app and on a public website.
    3. On a website, linked from the app.
  - *Lean*: Option 1. Help must work offline, and there's no website yet. Add option 2 for a public release.
  - *Answer*:
- **OQ-HLP-3 Making the samples.**
  - *Options*:
    1. A scripted generator with seeds.
    2. Files built by hand in the app.
    3. A generator plus hand-tuned details.
  - *Lean*: Option 3. A generator gives years of realistic transactions; hand tuning makes each sample tell its story.
  - *Answer*:
- **OQ-HLP-4 Which samples.**
  - *Options*:
    1. The eight in FR-HLP-1.
    2. Fewer, about four.
    3. Option 1, plus a sample generated from the user's onboarding answers.
  - *Lean*: Option 1. Option 3 is appealing but is a second generator to maintain.
  - *Answer*:
- **OQ-HLP-5 Stewardship content in help.** Follows OQ-PRD-4.
  - *Options*:
    1. None.
    2. A separate, optional Stewardship section.
    3. Woven throughout.
  - *Lean*: Option 2.
  - *Answer*:
- **OQ-HLP-6 Debits and credits.**
  - *Options*:
    1. Always plain signed amounts.
    2. A setting: plain (default) or accounting view.
    3. Always debits and credits, as Checquery shows them.
  - *Lean*: Option 2. Beginners get plain amounts; the household's bookkeeper keeps the accounting view.
  - *Answer*:
- **OQ-HLP-7 Sample dates.** Samples hold dated transactions, which age.
  - *Options*:
    1. Regenerate for each release so "this year" is current.
    2. Fixed years.
  - *Lean*: Option 1. A sample whose "this year" is stale makes the This Year pages look broken.
  - *Answer*:
- **OQ-HLP-8 Video help.**
  - *Lean*: out. It goes stale and doesn't work offline at a reasonable size.
  - *Answer*:

### Delivery

- **OQ-DEL-1 Repository.**
  - *Options*:
    1. Rename this repo and copy Checquery code in.
    2. A new repo.
  - *Lean*: Option 1. Keep Checquery's repo as the archive of its history.
  - *Answer*:
- **OQ-DEL-2 Requirement IDs.** Renumber everything into one scheme, or keep ssmodel's IDs and add areas?
  - *Lean*: keep and add (this document's approach). Code comments already cite the IDs.
  - *Answer*:
- **OQ-DEL-3 Where Checquery's tests go.** Its Solid component tests can't move.
  - *Lean*: port its domain and storage tests to `bun test`, and replace the page tests with Playwright e2e on synthetic
    households.
  - *Answer*:
- **OQ-DEL-4 Goal requirement IDs.** Goals now span both phases but use the `FR-BLD` prefix. Rename the goal
  requirements to `FR-GOAL` before the draft is accepted?
  - *Lean*: yes, once the goal list settles. Nothing cites these IDs in code yet, so renaming is cheap now and expensive
    later.
  - *Answer*:

---

## 18. Decision log

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
| D9 | Accounts | One account concept across ledger, budget and plan; each account carries a role | Section 5.2 |
| D10 | Look and feel | Checquery's look and feel migrates to ssmodel's; breadcrumb-only navigation replaced by an app shell with a sidebar | Section 11 |

---

## 19. Testing and acceptance (NFR-TEST, continued)

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
- **NFR-TEST-12** **Life-stage households:** the sample households (FR-HLP-1) are the life-stage test households.
  Each has e2e coverage of its main pages and a golden summary. Each regenerates identically from its seed and
  opens with no warnings.
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
- **NFR-TEST-15** **Roles:** unit tests for role validation (cardinality, required roles, items made incompatible by a
  role change). Renaming an account or moving it in the category tree leaves every plan and budget result
  unchanged, since engines read roles, not names (FR-ROLE-7).
- **NFR-TEST-16** **Ledger reports:** report totals are checked against hand-computed values on a small fixture,
  including drill-down totals matching the transactions listed.
- **NFR-TEST-17** **Report speed:** NFR-RPT-1 is checked on a generated 10-year household.
- **NFR-TEST-18** **Help and accessibility:** e2e checks that every page has a help link that resolves, and that
  automated accessibility checks (axe) pass on every page in both themes (NFR-UI-3).
