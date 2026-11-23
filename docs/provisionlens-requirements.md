# Requirements: ProvisionLens

Status: **draft 0.3 (2026-11-23)**, for discussion. It combines ssmodel ([requirements.md](requirements.md)) and
Checquery, following the decisions in [rebrand-assessment.md](rebrand-assessment.md). The first round of open
questions has been answered. The answers are in the decision log (Section 18) and in the numbered requirements, the
same way ssmodel's requirements were developed. Follow-up questions raised by the answers are in Section 17.

How this document relates to the existing ones:
- **ssmodel's `requirements.md`** stays authoritative for the retirement engine (Social Security, taxes, accounts,
  withdrawals, Monte Carlo, recommendation, Console) except where this document changes it. Those requirements keep
  their IDs.
- **Checquery's `tasks/done/*.md`** (`action-log.md`, `materialized-store.md`, `ledger-store.md`,
  `info-architecture.md`) stay authoritative for the ledger domain and storage design except where this document
  changes it. They move into this repo as architecture references.
- **This document replaces** ssmodel's file section (FR-FILE-1 to FR-FILE-9) with FR-STO, and Checquery's
  server-related design entirely.
- **Repository:** this repo is renamed and Checquery's code is copied in. Checquery's repo stays as the archive of
  its history *(D: OQ-DEL-1)*.

Conventions:
- **MUST / SHOULD / MAY** follow RFC 2119.
- New requirement areas use prefixes not used in ssmodel: `HH` household, `STO` storage, `LED` ledger, `IMP` import,
  `BUD` budget, `BLD` Building Years, `RET` Retiring Years changes, `ROLE` account roles, `RPT` reports, `HLP` help,
  `PRD` product, `MIG` migration. Continued areas (`FR-TAX`, `FR-UI`, `NFR-UI`, `NFR-SIM`, `NFR-TEST`) continue
  ssmodel's numbering. ssmodel's IDs are kept, not renumbered *(D: OQ-DEL-2)*.
- Report catalog entries are `RPT-<area>-n` (Section 15). Functional sections cross-reference them.
- Open questions are `OQ-<area>-n` (Section 17). A requirement that depends on an open question cites it, e.g.
  *(OQ-BLD-34)*. Once answered, a question moves to the decision log (Section 18), and requirements cite the
  decision, e.g. *(D: OQ-BUD-2)*.
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
  people in mid-career, and near-retirees like the original ssmodel household. The youngest life stage starts at the
  first full-time job; students can still use the ledger and budget *(D: OQ-PRD-6)*.
- **Name:** ProvisionLens. A quick conflict check is done; a fuller check comes before any public release
  *(D: OQ-PRD-1)*.
- **Positioning:** "Biblical Stewardship & Personal Finance Software". In features, this means giving as a
  first-class category with goals and reports (FR-BUD-22) now, and optional stewardship content later
  *(D: OQ-PRD-4)*.
- **Not advice:** an educational planning tool, not financial, tax or legal advice (ssmodel Section 13 carries
  forward).

### 1.4 Out of scope (initially)

- Any server, account sign-up, cloud sync or direct bank connection *(D2; D: OQ-IMP-3)*.
- Browsers other than desktop Chromium; phones and tablets *(D5)*.
- States other than SC at launch *(D4)*; local income taxes. Property taxes, including personal property taxes,
  are in (FR-TAX-13).
- Businesses other than a sole proprietorship, and rental property. Self-employment is in scope (Section 7.6)
  *(D: OQ-BLD-13)*.
- Stock compensation; RSUs can be entered as bonuses *(D: OQ-BLD-14)*.
- Receipts and attachments *(D: OQ-LED-9)*, and a statement reconciliation screen; balance assertions cover
  reconciliation *(D: OQ-LED-8)*.
- Video help *(D: OQ-HLP-8)*.
- Investment holdings and lot tracking *(D: OQ-LED-5)*.
- Multiple currencies; non-US households.
- Marriage, divorce and remarriage during the plan; a future marriage is a separate scenario file *(D: OQ-HH-2)*.
- Married filing separately *(D: OQ-HH-5)*.
- Insurance needs analysis *(D: OQ-BLD-15)*.
- Everything ssmodel's Section 1.3 lists as out of scope, unless reopened below, including divorced-spouse benefits
  *(D: OQ-RET-5)*. Defined-benefit pensions are reopened *(D: OQ-RET-6)*.

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
  app shell with top tabs (Section 11).

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
  reports come from it *(D: OQ-LED-3, D: OQ-STO-6)*.
- **NFR-ARCH-11** The domain schemas (Zod) are the source of truth for both ledger and planning types. Checquery's
  `@checquery/shared` domain moves into `src/` alongside ssmodel's `src/schema/`.
- **NFR-ARCH-12** Money:
  - The ledger and budget keep exact integer cents. Checquery's stored `$#,###.##` strings are migrated to integer
    cents once, during the port *(D: OQ-LED-2)*.
  - The planning engines keep float64 dollars, as ssmodel does (NFR-ENG-1).
  - Values convert at one boundary module, and nowhere else *(D: OQ-LED-1)*.

---

## 4. Household (FR-HH)

- **FR-HH-1** A household has **one or two adults** (Person 1, and optionally Person 2) and zero or more
  **dependents**. Each adult has:
  - a name;
  - a birth date;
  - a sex, labeled "for life-expectancy tables" and used only for them, with no blended table *(D: OQ-HH-6)*;
  - a Social Security status (FR-HH-3);
  - optionally, a planned retirement date (FR-BLD-12).
- **FR-HH-2** Two adults in a file are married. Unmarried partners use one file per tax household *(D: OQ-HH-1)*.
- **FR-HH-3** Social Security status for each adult is one of:
  - **not yet claiming:** earnings record (pasted from the SSA statement, FR-SS-2) plus projected wages from
    Building Years;
  - **claiming:** current monthly benefit and the month it started (today's Spouse model, FR-SS-3).
  Both, either or neither adult may be claiming.
- **FR-HH-4** Dependents: name, birth date (future dates allowed for planned children, *D: OQ-HH-3*), and whether they
  count as a qualifying child for tax purposes. Dependent status ends at an age set per dependent (default 18, or 24
  if a full-time student). Support for parents or adult children is budget lines and goals (FR-BLD-22, FR-BLD-23),
  with no dependent tax treatment *(D: OQ-HH-4)*.
- **FR-HH-5** Filing status for each tax year is derived:
  - **married filing jointly** while both married adults are alive;
  - **single** or **head of household** otherwise, depending on qualifying dependents;
  - married filing separately is not supported *(D: OQ-HH-5)*.
  The survivor rules (FR-TAX in ssmodel, Section 3.7) carry forward.
- **FR-HH-6** State of residence, with dated moves. Only SC has tax rules at launch *(D4)*. Another state can be
  chosen only once its rule table exists; until then the app explains this instead of computing wrong taxes.
- **FR-HH-7** The household has a **base date**: the first month the plan projects. It defaults to the month after
  the latest ledger data, or the start of next year when a budget for next year exists *(D: OQ-BLD-1)*.

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

- **FR-ROLE-1** **Every account has exactly one role** from the role catalog (FR-ROLE-4) *(D: OQ-ROLE-1)*.
  - Each account type has a generic role ("Other asset", "Other expense", and so on). It is the default, so a role
    is never blank.
  - Accounts with a generic role still count in net worth, the budget and reports. The planning engines treat them
    by type defaults: generic assets don't grow and can't be withdrawn from; generic expenses use their planning
    group's indexing.
  - The Net Worth account has a fixed role.
- **FR-ROLE-2** **The catalog belongs to the app.** Roles are defined in code and versioned with the app, not created
  by the user *(D: OQ-ROLE-2)*. Files migrate when the catalog changes *(D: OQ-ROLE-10)*. Each role defines:
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
  (FR-ROLE-10) and the warnings panel *(D: OQ-ROLE-5)*.
- **FR-ROLE-4** **Roles are only as fine as the engines need.** A role exists only where budgeting, taxes or planning
  treat accounts differently. Groceries and dining both take a planning-group role (essential or discretionary);
  the category tree carries the finer detail *(D: OQ-ROLE-9)*. What money is *for* (an emergency fund, a house fund)
  is a goal, not a role *(D: OQ-ROLE-8)*. The initial catalog (names illustrative):

  | Type | Roles |
  |---|---|
  | **Asset: cash** | checking; savings; money market or CD |
  | **Asset: investments** | taxable brokerage; traditional IRA; Roth IRA; traditional employer plan (401(k), 403(b), 457(b), TSP); Roth employer plan; SEP IRA; solo 401(k), traditional and Roth; inherited traditional IRA; inherited Roth IRA; HSA; 529 plan; custodial account (UTMA/UGMA); child's Roth IRA |
  | **Asset: property** | primary home; other real estate (second home); vehicle; money owed to the household; other asset |
  | **Liability** | mortgage; home equity loan or HELOC; federal student loan; private student loan; auto loan; credit card; personal or family loan; other liability |
  | **Income** | wages and salary (per job, owned by a person); bonus; self-employment income (per business, owned by a person); employer retirement contributions *(D: OQ-ROLE-6)*; interest; dividends; realized capital gains; Social Security benefits (per person); pension; annuity; gifts received; inheritance received; tax refund; other taxable income; other non-taxable income |
  | **Expense: taxes** | federal income tax (one); state income tax (one) *(D: OQ-ROLE-5)*; Social Security tax (per person); Medicare tax (per person); self-employment tax (per person); estimated tax payments, federal and state; property tax (linked to a home); personal property tax (linked to a vehicle or other property) |
  | **Expense: housing** | rent; mortgage interest (linked to a mortgage); home insurance; HOA dues; home maintenance and repairs; utilities |
  | **Expense: healthcare** | health insurance premiums (pre-tax or after-tax); Medicare premiums (per person); medical out-of-pocket |
  | **Expense: family and education** | childcare; tuition and education |
  | **Expense: giving** | charitable giving (deductible); gifts to people (not deductible) |
  | **Expense: interest** | student loan interest (linked to a loan); other interest |
  | **Expense: business** | business expense (linked to a self-employment income account); self-employed health insurance |
  | **Expense: general** | essential living; discretionary; other expense |
  | **Equity** | Net Worth (fixed) |

- **FR-ROLE-5** **Role attributes** replace the planning attributes of draft 0.1 *(D: OQ-ROLE-7)*:
  - **owner:** Person 1, Person 2, joint, or a dependent for child-owned roles. Required for retirement accounts and
    per-person roles;
  - **investment roles:** return model and fee (FR-ACC-1 in ssmodel), cost basis for taxable accounts, inherited-IRA
    facts (FR-ACC-2 in ssmodel), optional glide path *(D: OQ-BLD-18)*;
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
  is opened, the user links it and the plan uses the real account from then on *(D: OQ-ROLE-3)*.
- **FR-ROLE-12** **One real account, two roles.** A 401(k) holding both traditional and Roth money is recorded as two
  ledger accounts, one per role, usually under one category named for the plan *(D: OQ-ROLE-4)*.

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
  against Net Worth, typically from monthly statements, as Checquery does for home values *(D: OQ-LED-5)*.
- **FR-LED-10** A **paycheck** is entered as one split transaction: gross pay as income, with entries for taxes
  withheld, retirement contributions, HSA and insurance premiums, and net pay to checking. Net-only paychecks are not
  supported, since tax estimates, contributions and the savings rate need the gross *(D: OQ-LED-6)*. Paycheck templates
  make this quick, and an imported deposit that matches a template's net pay is offered as that paycheck.
- **FR-LED-11** **Undo and redo** for ledger edits within a session, recorded as compensating actions in the change
  log, matching ssmodel's FR-UI-13 *(D: OQ-LED-4)*.

### 5.4 Importing transactions (FR-IMP)

- **FR-IMP-1** Import bank and card exports into an account: **CSV** with a saved column mapping per institution
  first, then **OFX/QFX** where available. QIF is added only if someone moving from Quicken asks *(D: OQ-IMP-1)*.
  Other apps' exports (YNAB, Monarch, spreadsheets) come in through CSV mapping *(D: OQ-IMP-4)*.
- **FR-IMP-2** Duplicate detection: on OFX transaction IDs where present, otherwise on account, date, amount and
  description. Possible duplicates are shown for the user to confirm, never dropped silently.
- **FR-IMP-3** Categorization, in this order:
  1. user rules (text in payee or description → vendor and account);
  2. the vendor's default account;
  3. the account most often used for that vendor before *(D: OQ-IMP-2)*.
  Uncategorized or guessed transactions get the needs-review flag.
- **FR-IMP-4** The bank's date goes into the cleared date. The posted date takes it too unless the file gives a
  separate transaction date.
- **FR-IMP-5** Import is all or nothing per file. Errors name the line, as Checquery's export-import task requires.

---

## 6. Next year: budget (FR-BUD)

### 6.1 Structure

- **FR-BUD-1** A **budget** covers one calendar year *(D: OQ-BUD-4)* and is stored in the household file. Past
  budgets are kept for comparison. Each budget has a **status**: draft, active (the year is underway) or closed.
  Up to **three budgets** are open at once: this year's (active), next year's and the year after's (drafts)
  *(D: OQ-BUD-18)*. Each draft starts from the year before it: next year's from this year's forecast (FR-BUD-18),
  the year after's from next year's draft *(OQ-BUD-19)*.
- **FR-BUD-2** A budget is a set of **budget lines**. Each line attaches to one Checquery account *(D6)*:
  - an **INCOME** account (wages, interest, gifts received);
  - an **EXPENSE** account (groceries, utilities, giving);
  - an **ASSET** account, for planned saving and goal contributions (a 529, a house fund, a Roth IRA);
  - a **LIABILITY** account, for planned principal payments (mortgage, student loan).
  Lines may also attach to an account category. If a category has a line, the accounts and categories beneath it
  can't have lines, and their actuals roll up to it *(D: OQ-BUD-2)*.
- **FR-BUD-3** A line may name a **vendor** under its account, for example Netflix under Subscriptions *(D: OQ-BUD-3)*.
  This is for display and for matching actuals. It doesn't change the category rollup.
- **FR-BUD-4** Rollups (category subtotals, type totals, net) come from the **account category tree**. There is no
  separate budget category hierarchy. Renaming or moving an account or category in the ledger changes the budget's
  layout automatically.
- **FR-BUD-5** Budget lines are stored as entities in the change log (with id, origin and timestamp), like other
  Checquery entities *(D: OQ-STO-6)*. Amounts are integer cents *(D: OQ-LED-2)*.

### 6.2 Amount patterns

- **FR-BUD-6** Each line has one **pattern**, which describes when amounts occur and how large they are:

  | Pattern | Inputs | Examples |
  |---|---|---|
  | **Recurring** | amount per occurrence; frequency; anchor date; duration | paycheck every other Friday; rent on the 1st; quarterly water bill; annual insurance premium in March |
  | **Seasonal** | 12 monthly amounts, or an annual total with a seasonal profile | heating, higher December to February; lawn care, April to October; Christmas gifts in November and December |
  | **One-time** | date and amount | new roof in June; wedding in September; a car purchase |
  | **Irregular (spread)** | annual total; optional sinking-fund earmark | car repairs, medical co-pays, home maintenance |
  | **Percentage** | rate, and the base it applies to | giving 10% of gross income; 401(k) at 6% of salary; employer match |
  | **Loan payment** | the liability account | mortgage payment, split into principal and interest from the loan's amortization *(D: OQ-BUD-11)* |

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
  for an account *(D: OQ-BUD-6)*.
- **FR-BUD-11** **Calendar expansion:** the budget engine expands each line into dated occurrences for the year.
  - Biweekly pay gives 26 or 27 paychecks depending on the calendar, and months with three paychecks show up as such.
  - Day 31 means the last day of shorter months.
  - Weekend shifting (earlier or later) is a per-line option. Holidays are not considered *(D: OQ-BUD-7)*.

### 6.3 Building a budget

- **FR-BUD-12** A new budget starts from one of:
  - **last year's budget**, rolled forward: dates move to the new year, and amounts can be raised by an inflation
    rate;
  - **last year's actuals by account**, as averages or the same month last year. Detecting recurring patterns
    (frequency, day) comes later *(D: OQ-BUD-13)*;
  - a **template** for the household's life stage;
  - **blank**.
  The user then edits it line by line. A budget started mid-year still covers the full year; past months show
  imported actuals, or "no data" *(D: OQ-BUD-14)*.
- **FR-BUD-13** **Editing:**
  - a grid of lines (rows grouped by the category tree) against months, with year totals;
  - a pattern editor for the selected line;
  - spreadsheet-style editing and paste, as in ssmodel's grids (Section 8.3).
- **FR-BUD-14** **Checks while editing:**
  - Income minus expenses minus planned saving and principal is shown live, for each month and the year.
  - Unallocated surplus or a shortfall is flagged *(D: OQ-BUD-1)*.
  - Lines on inactive or deleted accounts are flagged.
- **FR-BUD-15** **Original and current:** when a budget becomes active, its original version is kept. Later edits
  change the current version, and reports can compare actuals with either *(D: OQ-BUD-5)*.

### 6.4 Tracking against actuals (this year)

- **FR-BUD-16** **Actuals** for a line are the entries posted to its account, by posted date *(D: OQ-LED-7)*, within
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
  share and is spent down by actuals. Earmarks are virtual, inside a cash account; real sinking-fund accounts work
  through goals *(D: OQ-BUD-9)*. Rollover of unspent amounts is a per-line option, off by default and on for earmarked
  irregular lines *(D: OQ-BUD-10)*.
- **FR-BUD-21** Indicators appear in the app only. There are no push notifications, since there's no server
  *(D: OQ-BUD-15)*. Budget reports are listed in the report catalog (Section 15.2, RPT-BUD).

### 6.5 Giving

- **FR-BUD-22** Giving is a first-class planning group. Giving lines can be a percentage of gross or net income
  *(D: OQ-BUD-16)*. Reports show giving against its target, by month and by year. Charitable lines feed the itemized
  deduction (FR-TAX-6) when itemizing applies.

### 6.6 Feeding the plan

- **FR-BUD-23** Next year's budget is **year 1 of the long-range plan**, and the year after's draft, when it exists,
  is year 2. For each planning group, the plan takes the
  budget's annual totals. For later years, it applies the group's indexing (FR-LED-7) and any line end dates.
  - One-time lines don't repeat.
  - Lines ending within the year stop.
  - "Every N years" lines repeat every N years *(D: OQ-BUD-8)*.
- **FR-BUD-24** Budget lines to ASSET and LIABILITY accounts that are linked to a goal (FR-BLD-2) become that goal's
  year-1 contributions or payments. The same number is never entered twice *(D: OQ-BUD-17)*.
- **FR-BUD-25** Taxes in the budget come from the user, usually from pay stubs. Next to them, the tax engine shows
  the **estimated tax for the year** and the likely refund or amount owed *(D: OQ-BUD-12)*.

### 6.7 Illustrative budget line

Field names are illustrative. The real schema follows Checquery's entity conventions. Amounts are integer cents.

```yaml
- id: bdln-0193
  budgetYear: 2027
  acctId: acct-utilities-electric     # an EXPENSE account
  vndrId: vndr-duke-energy             # optional
  pattern:
    kind: seasonal
    annual: 240000                     # integer cents
    profile: Heating                   # 12 named weights
  description: Electric, all-electric heat pump
- id: bdln-0194
  budgetYear: 2027
  acctId: acct-income-salary-p1
  pattern:
    kind: recurring
    amount: 325000
    frequency: { every: 2, unit: week }
    anchor: 2027-01-08
    steps: [{ from: 2027-04-01, amount: 338000 }]   # raise in April
- id: bdln-0195
  budgetYear: 2027
  acctId: acct-giving-church
  pattern: { kind: percentage, rate: 0.10, base: gross-income }
- id: bdln-0196
  budgetYear: 2027
  acctId: acct-house-fund              # an ASSET account linked to the house goal
  pattern: { kind: recurring, amount: 80000, frequency: { every: 1, unit: month }, day: 15 }
```

---

## 7. Building Years and goals (FR-BLD)

Building Years cover the years from the base date until the first adult retires. They run in the same simulation
as Retiring Years (FR-BLD-12).

**Goals are not limited to Building Years** *(D8)*. A goal can fall in the working years, in retirement, or span
both. Examples: a home renovation at 68, a repair reserve that lasts as long as the home, travel in the first years
of retirement, or a legacy at the end of life. The goal model is the same in every phase. Section 7.5 covers how
goals behave in retirement. Goal requirements keep the `FR-BLD` prefix until the goal list settles, then move to
`FR-GOAL` *(D: OQ-DEL-4, OQ-DEL-5)*.

### 7.1 Income and contributions

- **FR-BLD-1** **Wages** for each adult:
  - current annual gross pay, with real wage growth;
  - optional dated changes (job change, raise, a gap such as parental leave or going part-time);
  - bonuses as dated or recurring amounts.
  Projected wages also extend each adult's Social Security earnings record for the AIME/PIA calculation (FR-SS-2).
  Wages are deterministic within a scenario; a job loss is modeled as a dated change in a scenario *(D: OQ-BLD-19)*.
  Self-employment income is in Section 7.6.
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
  - **Employer match** as up to two tiers, for example 100% of the first 3% plus 50% of the next 2% *(D: OQ-BLD-10)*,
    with optional employer non-elective contributions.
  - **Limits from rule data:** IRS elective deferral limits, age-50 catch-up and the age-60–63 higher catch-up, the
    rule that requires Roth catch-up contributions for higher earners, IRA limits, HSA self and family limits, and
    the age-55 HSA catch-up. Contributions above a limit are capped, with a warning.
  - **Phase-outs:** IRA deductibility and Roth IRA eligibility phase-outs are applied. Backdoor and mega-backdoor
    Roth are out at first; Roth IRA contributions above eligibility are flagged *(D: OQ-BLD-12)*.
  - **Vesting** is ignored: employer contributions are assumed vested *(D: OQ-BLD-11)*.

### 7.2 Goal kinds in detail

- **FR-BLD-4** **Emergency fund:** the target is N months of essential expenses, taken from the budget's essential
  and housing groups (default 6) *(D: OQ-BLD-17)*. It is funded from a cash account. When spent, it is refilled at the
  goal's priority.
- **FR-BLD-5** **College**, one goal per child:
  - start year (default: the year the child turns 18) and number of years (default 4);
  - a cost basis: public in-state, public out-of-state, private, or custom, in today's dollars. Presets come from
    published averages (for example, College Board) as rule data with a source URL, updated yearly; the user can
    override them *(D: OQ-BLD-4)*;
  - a college-cost inflation spread over general inflation;
  - the share the parents intend to fund;
  - expected scholarships and aid as a reduction *(D: OQ-BLD-5)*;
  - funding from 529 accounts, with SC's state income tax deduction for 529 contributions applied through the SC
    rule table.
  Withdrawals pay qualified costs. Money left over stays invested and is reported, or moves to another child. The
  529-to-Roth rollover comes later *(D: OQ-BLD-6)*.
- **FR-BLD-6** **House purchase:**
  - target price in today's dollars, indexed by a home-price rate; purchase date;
  - down payment percentage, closing costs, and a funding account;
  - mortgage rate and term at purchase, and PMI below 20% down until it can be dropped.
  At purchase:
  - the down payment and closing costs leave the fund;
  - a home asset and a mortgage liability begin;
  - the budget's rent line (or a chosen line) stops;
  - property tax, insurance and maintenance start, using ssmodel's home model (FR-ACC in ssmodel, Q-HOME-1).
  Moving up (selling one home and buying another) is a sale followed by a purchase. Rent vs. buy is FR-BLD-52
  *(D: OQ-BLD-8)*.
- **FR-BLD-7** **Student loans:**
  - each loan has a balance, rate, kind (federal or private), required monthly payment, and optional forgiveness
    date and amount. Income-driven federal plans are not modeled *(D: OQ-BLD-7)*;
  - a payoff strategy: minimum payments only, extra toward the highest rate first (avalanche), extra toward the
    smallest balance first (snowball), or extra to a chosen loan;
  - the student loan interest deduction applies through the tax engine.
  Outputs: payoff date and total interest for each strategy.
- **FR-BLD-8** **Mortgage paydown:**
  - ssmodel's mortgage model (balance, as-of month, rate, actual monthly principal and interest), with extra
    principal as a monthly amount and/or dated lump sums;
  - refinance as a dated change of rate, term and closing costs *(D: OQ-BLD-9)*.
  Outputs: payoff date, interest saved, and a comparison with investing the same extra amount.
- **FR-BLD-9** **Other debts** (auto loans, credit cards, HELOC, personal loans) use the same loan model and payoff
  strategies as student loans. Credit card debt can be modeled as a balance with a rate and a payment.
- **FR-BLD-10** **Vehicles and major purchases:** a one-time or "every N years" goal, for example replacing a car
  every 8 years. It is paid from savings, or partly with a loan that then enters the debt model *(D: OQ-BLD-16)*.
  Vehicles carry personal property tax where the state levies it (FR-TAX-13).
- **FR-BLD-11** **Children and dependents:**
  - childcare costs by age band (infant, preschool, after-school), ending at a chosen age;
  - the child tax credit and other dependent-related tax items through the tax engine *(D: OQ-TAX-1)*;
  - costs per child added at birth for planned children.

### 7.3 Allocation, outputs and the hand-off to retirement

- **FR-BLD-12** **One timeline:** each simulated path runs yearly, with monthly loan amortization inside each year
  and the budget years taken from the budget engine *(D: OQ-BLD-1)*, from the base date to the end of the last life.
  When each adult reaches their planned retirement date (or a searched one, FR-RET-8, *D: OQ-BLD-20*),
  their wages stop, and ssmodel's retirement logic applies from then on: Social Security claiming, RMDs,
  withdrawals and Medicare. The Building Years and Retiring Years engines share the same account balances, taxes
  and random draws.
- **FR-BLD-13** **Surplus and shortfall allocation:** each period the engine computes income minus taxes, expenses,
  required debt payments and fixed contributions.
  - **A surplus** goes to goals in a **user-ordered priority list**, with this default order *(D: OQ-BLD-2)*:
    1. the employer match;
    2. giving pledges due this year (FR-BLD-30) *(D: OQ-BLD-27)*;
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
  When the surplus can't fund every goal, each goal shows what it would need. Suggested changes come later
  *(D: OQ-BLD-21)*. The charts and tables are listed in the report catalog (Section 15.2, RPT-BLD and RPT-LIFE).
- **FR-BLD-15** **Trade-offs:** levers in the Console, as in ssmodel Section 8.5, for:
  - each goal's target, date and contribution;
  - savings rates;
  - retirement dates;
  - wage growth.
  Moving a lever shows the effect on every goal and on retirement. Pinning a baseline (FR-UI-10) works across both
  phases.
- **FR-BLD-16** **Uncertainty:** Monte Carlo varies returns, inflation and mortality as in ssmodel (Section 4).
  Goal targets and wages are deterministic within a scenario *(D: OQ-BLD-3, D: OQ-BLD-19)*. Scenarios cover different
  choices, for example "house in 2029" vs "house in 2031".
- **FR-BLD-17** **Must-have vs. nice-to-have:** within the same priority, must-have goals are funded before
  nice-to-have ones. Reports show the probability that **all must-have goals** are fully funded, separately from
  the overall picture, for example "must-haves funded in 92% of outcomes".
- **FR-BLD-18** **Flexible dates:** a goal can have an earliest and latest date instead of one target date. The app
  then reports the **earliest affordable date**: the first date in the range at which the goal can be funded
  without dropping any must-have goal below its target probability *(D: OQ-BLD-22)*. Each simulated path uses one
  date per scenario; the date doesn't move path by path.

### 7.4 Further goal kinds

Each of these is mostly a preset over machinery the engine already has: a dated or recurring cash need, a wage
change, a loan, or a target ending balance. Each preset fills in sensible defaults, its own wording, and any tax
items that apply. Section 7.5 shows the phases each kind usually falls in. None is restricted to a phase unless it
depends on wages.

**Family**

- **FR-BLD-19** **K–12 tuition** (private or Christian school), per child: an annual cost from a start grade to an
  end grade, indexed by a tuition rate. 529 withdrawals can pay K–12 tuition up to the annual cap in rule data, and
  the SC 529 deduction applies to those contributions as SC rules allow *(D: OQ-BLD-23)*.
- **FR-BLD-20** **New child or adoption:** a one-time cost at a date (birth or adoption expenses), which also adds
  a dependent with that birth date (FR-HH-4), starting childcare costs (FR-BLD-11) and child-related tax items. The
  adoption credit is added when someone needs it *(D: OQ-TAX-1)*.
- **FR-BLD-21** **Career break or one income:** one adult's wages drop by a percentage, or stop, between two
  dates, optionally with changed childcare costs. The goal reports whether the household stays funded through the
  break, and what saving beforehand would make it work. Social Security earnings records reflect the gap.
- **FR-BLD-22** **Helping adult children:** one-time gifts by date and child (a wedding, help with a first home, a
  first car), as a list. Gifts above the annual gift-tax exclusion are flagged as needing a gift tax return, with no
  tax computed *(D: OQ-BLD-24)*.
- **FR-BLD-23** **Caring for aging parents:** recurring support (monthly or yearly, indexed by medical inflation by
  default) between dates, or a one-time cost for a parent moving in (for example, a home modification).

**Home**

- **FR-BLD-24** **Home project:** a renovation or addition with a cost and date, paid from savings (in retirement,
  through withdrawals, FR-BLD-44) and optionally partly with a home equity loan, which then enters the debt model
  (FR-BLD-9). An optional increase in home value, as a percentage of cost (default 0), is added to the home asset
  *(D: OQ-BLD-25)*.
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
  starts. The 25 × spending rule of thumb is shown beside it for reference *(D: OQ-BLD-26)*.
- **FR-BLD-28** **Phased retirement:** part-time wages for one adult between two dates before full retirement, using
  the wage-change machinery (FR-BLD-1). Retirement-plan contributions continue at a chosen rate.
- **FR-BLD-29** **Debt-free date:** a combined goal over chosen debts (default: all, including the mortgage) with a
  target date. It reports the projected date for each payoff strategy and the extra monthly payment needed to meet
  the target.

**Giving and legacy**

- **FR-BLD-30** **Giving pledge:** a fixed amount per year (or a total spread over N years) to a named recipient,
  for example a church building campaign or a missions commitment. Pledges are funded before other discretionary
  goals by default *(D: OQ-BLD-27)* and appear in the giving report (FR-BUD-22).
- **FR-BLD-31** **Legacy goal:** leave a target amount (today's dollars) to heirs or charity, building on ssmodel's
  objective (Section 7 of `requirements.md`). By default it's a soft target, reported as the probability of meeting
  it. As an option it's a hard floor: paths that end below it count as failures *(D: OQ-BLD-28)*.
- **FR-BLD-32** **Windfall giving:** a percentage of windfalls (bonuses, inheritances, home-sale gains, other
  one-time income) set aside for giving when they occur.
- **FR-BLD-33** **Gift bunching:** give several years' planned gifts in one year (directly, or to a donor-advised
  fund) so that itemizing beats the standard deduction that year. The tax engine compares bunching every N years
  with giving every year, using the itemized-deduction logic (FR-TAX-6). Only the timing of deductions is modeled;
  a donor-advised fund's balance is not the household's *(D: OQ-BLD-29)*.

**Education and experiences**

- **FR-BLD-34** **Adult education:** graduate school or retraining for an adult, with costs over a period, an
  optional wage drop during it, and an optional wage increase afterward. A 529 with the adult as beneficiary can
  fund it. The American Opportunity credit follows the first release; other education credits come when someone
  needs them *(D: OQ-TAX-1)*.
- **FR-BLD-35** **Trips and sabbaticals:** a one-time or "every N years" trip with a cost, for example an
  anniversary trip every 5 years, a big trip in the first year of retirement, or a sabbatical that combines a trip
  with a career break (FR-BLD-21).

**Children's own money**

- **FR-BLD-36** **Child-owned accounts:** custodial (UTMA/UGMA) accounts and a Roth IRA for a child with earned
  income, owned by the child. They're shown in the household's net worth but excluded from money available for the
  parents' goals and retirement. Contributions are budget lines or goal contributions. Kiddie tax and effects on
  financial aid are not modeled *(D: OQ-BLD-30)*.

**Mainly in retirement**

- **FR-BLD-37** **Retirement travel phase:** extra spending for the first N years of retirement (the "go-go years"),
  as an annual amount that steps down or ends at chosen ages. Assumptions also offer an optional real decline in
  spending per year of retirement *(D: OQ-BLD-33)*.
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
  - Nice-to-have goals are reported separately, as the probability that each one is paid in full.
  - As an option (off by default), nice-to-have goals are skipped on paths where the portfolio falls below a
    threshold. Reports then show how often each goal was skipped *(D: OQ-BLD-31)*.
- **FR-BLD-47** **ssmodel's one-time expenses:** ssmodel's one-time expense items, its home sale plan and its
  inheritance-funded items become goals where a goal kind fits *(D: OQ-BLD-32)*. FR-MIG-2 maps them when importing a
  household YAML, and golden results stay unchanged (NFR-TEST-8).

### 7.6 Self-employment

Self-employment is in scope from the start *(D: OQ-BLD-13)*: a sole proprietorship or single-member LLC owned by
one adult, alongside or instead of wages. Partnerships, S corporations *(OQ-BLD-35)*, employees and rental property
stay out.

- **FR-BLD-48** **Self-employment income:**
  - In the ledger, business income and expenses are INCOME and EXPENSE accounts with self-employment roles
    (FR-ROLE-4), so actual net profit comes from the books *(OQ-BLD-36)*.
  - In the plan, each business has a projected annual net profit with real growth and optional dated changes, like
    wages (FR-BLD-1).
  - Net earnings from self-employment extend the owner's Social Security earnings record.
- **FR-BLD-49** **Self-employment tax:** Social Security and Medicare tax on net earnings from self-employment, with
  the Social Security wage base shared with any W-2 wages, Additional Medicare, and the deduction for half of the
  tax. Rates and thresholds come from rule data with IRS sources (NFR-TEST-11).
- **FR-BLD-50** **Retirement plans for the self-employed:** SEP IRA and solo 401(k) (employee deferrals, traditional
  or Roth, plus employer contributions based on net earnings). Limits come from rule data. The elective deferral limit
  is shared with any employer plan the same person has (FR-BLD-3).
- **FR-BLD-51** **Other self-employment items:**
  - the qualified business income deduction *(OQ-BLD-34)*;
  - the self-employed health insurance deduction;
  - quarterly estimated tax payments as budget lines instead of withholding, with the engine's estimate beside them
    *(OQ-BLD-37)*;
  - business use of home and vehicle entered as business expenses, not computed.

### 7.7 Rent vs. buy

- **FR-BLD-52** **Rent vs. buy** compares continuing to rent with buying a home over a chosen horizon
  *(D: OQ-BLD-8)*:
  - **renting:** rent indexed by a rent growth rate; the down payment, closing costs and any monthly saving
    compared with owning stay invested;
  - **buying:** the house purchase model (FR-BLD-6): down payment, closing costs, mortgage, PMI, property tax,
    insurance, maintenance and appreciation, with selling costs at the horizon;
  - taxes through the tax engine, so mortgage interest and property tax count only when itemizing beats the
    standard deduction.
  Outputs: net worth under each choice over time, the break-even year, and sensitivity to home appreciation, rent
  growth and returns *(OQ-BLD-38)*. Reported as RPT-BLD-10.

---

## 8. Retiring Years (FR-RET)

ssmodel's requirements carry forward, with these changes:

- **FR-RET-1** People are generic (FR-HH). Wording changes from Primary/Spouse and Husband/Wife to the people's
  names, or Person 1 and Person 2.
- **FR-RET-2** **Joint claiming:** when two adults are not yet claiming, the recommendation searches pairs of
  claiming dates, quarterly per person *(D: OQ-RET-1)*. Spousal benefits work in both directions. A single adult gets
  a one-person search. FR-REC-5 and Q-REC-2 (claiming date of the Primary only) are replaced.
- **FR-RET-3** **Distance from claiming:** for an adult more than 10 years from age 62 *(D: OQ-RET-2)*, the claiming
  date is an assumption the user sets (default: full retirement age), shown as indicative. It isn't recommended.
- **FR-RET-4** **Trust fund:** the uncertain trust-fund cut moves forward from ssmodel's v2 (Q-TF-1), because it
  matters most for younger users. The default is the cut scheduled in the Trustees Report from its depletion year,
  for users under 55. No cut and a user-set percentage and year are options. Random cuts are deferred *(D: OQ-RET-3)*.
- **FR-RET-5** **Inheritances:** any number of expected inheritances from any benefactors. Q-INH-1 (one living
  parent) is replaced. The section is hidden unless the user turns it on *(D: OQ-RET-4)*.
- **FR-RET-6** **Health coverage before 65:** employer coverage (from the paycheck or budget), COBRA, or an ACA
  marketplace plan with the premium tax credit from rule data. Q-EXP-5 (COBRA only) is replaced *(D: OQ-TAX-1)*.
- **FR-RET-7** **Pensions:** defined-benefit pensions as a monthly amount with a start date, COLA and survivor
  percentage, using ssmodel's annuity model *(D: OQ-RET-6)*.
- **FR-RET-8** **Retirement age search:** "the earliest retirement date for each adult with at least X% success" as
  an output, searched the same way as claiming dates *(D: OQ-BLD-20)*.
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
  - SC is the only state at launch *(D4)*. States follow in this order: NC, GA, FL, NY, VA, PA, then others as
    users need them *(D: OQ-TAX-3)*.
  - The state model is parameterized (brackets, standard deduction, retirement and Social Security exclusions, age
    deductions), with per-state code hooks for quirks *(D: OQ-TAX-4)*.
- **FR-TAX-10** **Working-years federal items:**
  - payroll tax (Social Security up to the wage base, Medicare, Additional Medicare);
  - pre-tax deductions (traditional 401(k), HSA, Section 125 premiums);
  - the child tax credit;
  - the student loan interest deduction;
  - SC's 529 deduction;
  - self-employment tax, the qualified business income deduction and the self-employed health insurance deduction
    (Section 7.6).
  The premium tax credit (FR-RET-6) is also included. The American Opportunity credit comes next; other credits
  (dependent care, saver's, EITC, adoption) come when someone needs them *(D: OQ-TAX-1)*.
- **FR-TAX-11** **Moving between states:** residence changes on January 1 of the year after the move. Part-year
  apportionment is not modeled *(D: OQ-TAX-2)*.
- **FR-TAX-12** **Estimated tax for the budget year:** the engine estimates the year's federal and state tax from
  the budget and shows it next to withholding (FR-BUD-25).
- **FR-TAX-13** **Property taxes** *(D: OQ-TAX-5)*:
  - real property tax on each home, as in ssmodel's home model;
  - personal property tax on vehicles and other property, in states that levy it. The state rule table says whether
    the state levies it, and the user enters the amount from the bill *(OQ-TAX-6)*;
  - both are tracked through their roles in the ledger (FR-ROLE-4) and feed the state and local tax deduction when
    itemizing (FR-TAX-6), in budgets and in plans.
  Other local taxes, such as city income taxes, are out.

---

## 10. Engine and performance (NFR-SIM, continued)

- **NFR-SIM-3** **Long horizons:** a path covers from the base date to the end of the last life, possibly 70+ years
  for a young household. Targets (machine: the development PC from ssmodel's benchmarks):
  - deterministic recompute of the current scenario: **≤ 100 ms**, so levers feel live;
  - preview Monte Carlo (500 paths): **≤ 2 s**;
  - full Monte Carlo for one scenario (5,000 paths): **≤ 10 s**.
  If these are missed after cutting work, the Rust/WASM port (NFR-ARCH-6) is reconsidered.
- **NFR-SIM-4** **Joint claiming search:** narrow the claiming-date pairs with the deterministic recompute, then run
  Monte Carlo on a short list (default 20) *(D: OQ-RET-1)*.
- **NFR-SIM-5** **Budget engine:** expanding and totaling a year's budget (a few hundred lines) and comparing it with
  a year of actuals MUST take under 50 ms, so grid edits feel instant.

---

## 11. User interface (FR-UI, continued)

ssmodel's FR-UI-1 to FR-UI-18 and NFR-UI-1 (desktop, minimum width 1280 px) carry forward. Checquery's look and feel
migrates to ssmodel's *(D10)*: its pages are rewritten (FR-LED-3) with ssmodel's components, density and visual style
(ssmodel FR-UI-18). Checquery's `info-architecture.md` stays a reference for what each page contains, not for
navigation. Its breadcrumb menus worked for about a dozen pages; this app has several times that many.

### 11.1 Information architecture

- **FR-UI-19** **Top-level navigation** follows the timeline *(D: OQ-UI-1)*:

  | Section | Pages |
  |---|---|
  | **Home** | dashboard (FR-UI-34), getting-started checklist (FR-HLP-4), review queue (RPT-LED-18) |
  | **Past** | registers for primary accounts (Checquery's primary-account shortcuts), registers for other accounts by search or list, Income Log, Expense Log, Balance Sheet, Income Statement, the other ledger reports (RPT-LED), transaction search, import |
  | **This Year** | budget vs. actual, year-end forecast, cash flow, sinking funds |
  | **Next Year** | budget editor and budget summary, for next year and the year after (FR-BUD-1) |
  | **Goals** | every goal on one timeline, whatever phase it falls in *(D8)*, and a page per goal |
  | **Building Years** | the Console set to the working years, wages and savings, debt payoff, rent vs. buy, results |
  | **Retiring Years** | the Console set to retirement; ssmodel's Setup, Results and Compare |
  | **Setup** | household; accounts, categories and vendors *(D: OQ-UI-12)*; role map (FR-ROLE-10); paycheck templates; import profiles; assumptions; file settings (password, recovery key, backups, file info) |
  | **Help** | help pages, glossary, release notes, about (Section 16) |

- **FR-UI-20** **App shell** *(D: OQ-UI-5)*:
  - a toolbar with file commands, the command palette, settings and help;
  - a row of **top tabs**, one per section of FR-UI-19. A sidebar is not used: ssmodel's pages already use the left
    side for the lever column and the Setup section list;
  - the section's pages as a second row of tabs (FR-UI-21) *(OQ-UI-14)*;
  - the page area;
  - ssmodel's status bar, plus autosave state, lock state (FR-STO-4) and whether the file is encrypted.
- **FR-UI-21** **Within a section**, a second row of tabs switches between its pages, as in ssmodel's Retiring Years
  views (Console, Setup, Results, Compare). Building Years and Retiring Years share one Console, with a phase
  selector, since both are one simulation *(D: OQ-UI-4)*.
- **FR-UI-22** **Breadcrumbs** appear only as a trail for drill-downs, for example "Past › Income Statement 2026 ›
  Groceries › Register". They are not the main navigation *(D: OQ-UI-7)*.
- **FR-UI-23** **Addressable pages.** Every page and its main parameters (account, period, scenario, goal) have a route
  inside the app, using TanStack Router with hash history *(D: OQ-UI-6)*. Back and forward, reload, and opening a page
  in a second window work. A second window is read-only and follows the first window's changes live (FR-STO-4)
  *(D: OQ-UI-8)*.
- **FR-UI-24** **Cross-links** connect related things in both directions:
  - an account to its register, its budget lines and the goals it funds;
  - a vendor to its transactions;
  - a goal to its funding accounts and budget lines;
  - a report amount to the transactions behind it (FR-RPT-3).
- **FR-UI-25** **Scenario scope.** Scenario tabs appear only on Building Years, Retiring Years and Goals. Past and This
  Year show recorded facts and are the same in every scenario. Next Year has one budget *(D: OQ-BUD-5)*.
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
  - one quiet hue per timeline phase, used in the section tabs and timeline charts, never competing with status
    colors *(D: OQ-UI-9)*.
  Chart series take colors from one palette, and the same account or category keeps the same color across charts.
- **FR-UI-30** **Numbers and dates** are formatted by one module for the whole app: currency (with the user's
  display setting, ssmodel FR-UI-16), percentages and dates. Negative amounts look the same in the ledger and in
  plans.
- **FR-UI-31** **Data entry** is keyboard-first. Checquery's register behaviors carry over: tab order, date
  shortcuts, vendor autocomplete that fills the vendor's default account, and the inline calculator. ssmodel's input
  parsing (FR-UI-4) applies everywhere. Registers are built on the shared TanStack grid *(D: OQ-UI-13)*.
- **FR-UI-32** **Brand.** The ProvisionLens name, logo and app icon replace ssmodel's. The tagline appears on Home
  (no file open) and About. Working pages carry no decorative imagery. The wordmark and icon are made in-house for
  now, with a designer before any public release *(D: OQ-UI-11)*.
- **FR-UI-33** **Voice.** Plain language, addressed to the user, without unexplained jargon. Terms of art link to the
  glossary (FR-HLP-9). Messages say what happened and what to do next.
- **NFR-UI-3** **Accessibility:** WCAG 2.2 AA as the target *(D: OQ-UI-10)*:
  - every action reachable by keyboard, with visible focus;
  - contrast met in both themes;
  - labels on all inputs;
  - a table equivalent for every chart (ssmodel FR-OUT-8).

### 11.3 Pages and behavior

- **FR-UI-34** **Home dashboard**: a fixed set of tiles, each of which can be shown or hidden, like ssmodel's layout
  settings (FR-UI-17) *(D: OQ-UI-2)*:
  - net worth and its trend;
  - this year's budget status (spent vs. budget to date, forecast surplus or shortfall);
  - each goal's status;
  - retirement readiness (success probability, earliest retirement age);
  - items needing review (RPT-LED-18), plus role map gaps (FR-ROLE-10) and rule tables needing an update.
- **FR-UI-35** **Life-stage-aware:** sections that don't apply yet are collapsed and explained, not hidden in a way
  that confuses. For example, inheritances, RMDs and Medicare for a 30-year-old. Each collapsed section has a
  one-line explanation *(D: OQ-UI-3)*.
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
  the app is hidden, the whole database is written back to the user's file *(D: OQ-STO-1)*. The file stays the source
  of truth.
  - On reopen, if the working copy is newer than the file (for example after a crash), the user is offered the
    newer version.
  - Unapplied what-ifs stay a session overlay, marked as such, as in ssmodel.
- **FR-STO-4** **One writer:**
  - A Web Lock per file prevents two tabs from writing the same file. A second tab or window opens read-only and
    follows the writer's changes live through a BroadcastChannel *(D: OQ-UI-8)*.
  - The file records the device that has it open, with a heartbeat. Opening it on another device (for example
    through a synced folder) warns before editing. Merging diverged copies is not supported, but the change log keeps
    the timestamps and origins that a later merge would need *(D: OQ-STO-5)*.
- **FR-STO-5** **Encryption** is on by default and can be turned off, with a clear warning. Unencrypted files are
  useful for test fixtures *(D: OQ-STO-2)*:
  - The change log's payloads are encrypted with AES-GCM, using a key derived from the file password with scrypt.
    This is Checquery's scheme, ported to Web Crypto plus a JS scrypt implementation, and stays compatible with
    existing files.
  - The password can be changed.
  - A **recovery key** is created with the file: a random key, shown once as words to print or store, which also
    wraps the file key. Changing the password doesn't invalidate it *(D: OQ-STO-3)*.
  - A forgotten password with no recovery key means the data is lost, and the app says so plainly.
- **FR-STO-6** **Backups:** rolling copies in OPFS (default: the last 10 closes), plus an optional **backup
  folder** chosen once (directory handle in IndexedDB). The app writes a dated copy there on close, at most once a
  day, keeping 30 days of copies plus one per month *(D: OQ-STO-4)*.
- **FR-STO-7** **Versions:**
  - The file records its schema version.
  - Older versions migrate forward on open: Checquery's change-log migrations, plus the planning document's
    `schemaVersion` migrations from ssmodel.
  - Files from a newer version are refused with a clear message.
  - The original file is never modified by a migration until the user confirms.
- **FR-STO-8** **Long-range plan storage:** the household's planning inputs (household, scenarios, assumptions,
  goals) are stored as one versioned JSON document in a table, validated by Zod. Links to ledger entities (account
  IDs) are by ID *(D: OQ-STO-6)*. Budget lines are change-log entities (FR-BUD-5).
- **FR-STO-9** **YAML** stays as an import/export format for the planning document, for test fixtures, golden files
  and worked examples. It is not the storage format.
- **FR-STO-10** Browsers without the File System Access API or OPFS get the "Chromium-based browser required"
  message (ssmodel FR-FILE-7), with no fallback *(D5)*.

---

## 13. Product (FR-PRD)

- **FR-PRD-1** **Hosting:** a static site over HTTPS (for example GitHub Pages or Cloudflare Pages), at an unlisted
  URL. The repo stays private, and the app is free for invited users; this is revisited before inviting anyone
  beyond family and friends *(D: OQ-PRD-2)*.
  ssmodel's Q-ARCH-7 (local only) is replaced. The app makes no other network requests (NFR-ARCH-1). Household data
  never leaves the device except in files the user saves.
- **FR-PRD-2** **Releases:** versioned, with release notes shown in the app after an update. New builds wait for the
  user to reload (NFR-ARCH-7).
- **FR-PRD-3** **Annual rule updates:** `docs/rule-data.md` becomes a yearly release checklist covering SSA (COLA,
  wage base, bend points), IRS (brackets, limits, deductions), CMS (Medicare, IRMAA) and each supported state. A
  release with the new year's tables SHOULD ship by mid-January. If a table is late, last year's is projected
  forward with a warning *(D: OQ-PRD-3)*. The status bar shows each table's year,
  and the warnings panel flags projected values.
- **FR-PRD-4** **Onboarding** is specified in Section 16 (FR-HLP-3).
- **FR-PRD-5** **Sample households** are specified in Section 16 (FR-HLP-1, FR-HLP-2).
- **FR-PRD-6** **Help and diagnostics** are specified in Section 16 (FR-HLP-10, FR-HLP-12). There is no telemetry.
- **FR-PRD-7** **First run:** the educational disclaimer is shown on first run and is always visible in the status
  bar.
- **FR-PRD-8** **First release to friends** includes everything in this document *(D: OQ-PRD-7)*. The household can
  use parts as they are built, in the order suggested in [rebrand-assessment.md](rebrand-assessment.md).

---

## 14. Migration (FR-MIG)

- **FR-MIG-1** **Convert the household's `.checquery` file**, once *(D: OQ-STO-7)*. Only one such file exists, so this
  is a one-time tool, removed after the conversion:
  - it asks for the file's password, decrypts and replays it, and writes a new `.plens` file chosen by the user;
  - the original is never modified;
  - accounts get suggested roles, which the user confirms in the role map (FR-ROLE-10).
  If conversion proves too complicated (for example, assigning roles), it is dropped, and the household's data is
  re-entered or moved with the accounts and vendors export (FR-MIG-3) plus transaction import (FR-IMP).
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
- **Base:** required in the first release *(D: OQ-RPT-1, D: OQ-PRD-7)*;
- **Candidate:** to decide before the first release *(OQ-RPT-11)*;
- **Later:** after the first release.

### 15.1 Common behavior

- **FR-RPT-1** **Report template** (FR-UI-27): a filters bar, then the chart, then the table. Chart and table come from
  the same data and stay in sync.
- **FR-RPT-2** **Periods and comparisons:**
  - periods: year, quarter, month, year to date, trailing 12 months, or a custom range;
  - comparisons: previous period, same period last year, the budget (original or current, FR-BUD-15), or a pinned
    baseline or other scenario for projections;
  - the default period is the calendar year, with the trailing 12 months one click away *(D: OQ-RPT-7)*.
- **FR-RPT-3** **Drill-down.** Every amount that comes from the ledger opens the transactions behind it in a
  filtered register. Every projected amount opens "explain a number" (FR-UI-36).
- **FR-RPT-4** **Actual and projected together.** Charts that span past and future follow FR-UI-29: actuals solid,
  projections as a median line with bands, and a "today" marker. Charts use Recharts, plus custom SVG where it falls
  short *(D: OQ-RPT-9)*.
- **FR-RPT-5** **Grouping:** by the category tree (default), by role, by planning group, or by vendor. Levels expand
  and collapse, and zero rows can be hidden.
- **FR-RPT-6** **Output:** CSV export of the table, printing (or saving as PDF) through a print stylesheet
  (no PDF library) *(D: OQ-RPT-10)*, and a table equivalent for every chart (ssmodel FR-OUT-7, FR-OUT-8).
- **FR-RPT-7** **Saved views.** A report's filters can be saved under a name and pinned to Home or to its section's
  page tabs. Saved views are stored in the household file *(D: OQ-RPT-3)*. There is no report builder. A read-only
  SQL page for power users may come later *(D: OQ-RPT-2)*.
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
| RPT-LED-5 | **Spending by category** for a period, with drill-down through the tree; horizontal bars, with a treemap toggle *(D: OQ-RPT-4)* | chart, table | Base |
| RPT-LED-6 | **Category trend**: chosen categories by month over 12–36 months, with the average | chart | Base |
| RPT-LED-7 | **Income vs. spending by month**, with the net as a line | chart | Base |
| RPT-LED-8 | **Year over year**: each category this year against the last N years, with the change | table | Base |
| RPT-LED-9 | **Monthly averages**: average and median monthly amount per category over a chosen span. Also seeds the budget (FR-BUD-12) | table | Base |
| RPT-LED-10 | **Vendor report**: top vendors, and one vendor's history | table, chart | Base |
| RPT-LED-11 | **Transaction search**: date, account, vendor, amount range, text, needs-review and cleared filters; results as a register; savable | register | Base |
| RPT-LED-12 | **Giving statement**: giving by recipient and year, deductible or not (FR-BUD-22) | table | Base |
| RPT-LED-13 | **Tax summary**: the year's totals by tax role (wages, interest, dividends, withholding, deductible giving, mortgage interest, property tax, medical, student loan interest, HSA contributions), not mapped to tax-form lines *(D: OQ-RPT-6)* | table | Candidate |
| RPT-LED-14 | **Cash flow statement**: income, spending, saving, principal paid, and transfers between asset accounts | table | Candidate |
| RPT-LED-15 | **Savings rate**: saving plus principal paid as a share of gross and of net income, by month and year | chart | Candidate |
| RPT-LED-16 | **Debt summary**: balance, interest paid by year and payoff progress per liability | table, chart | Candidate |
| RPT-LED-17 | **Investment change**: per account, contributions, withdrawals and market change by period, with a money-weighted return (XIRR) added later *(D: OQ-RPT-8)* | table | Candidate |
| RPT-LED-18 | **Review queue**: needs-review transactions, uncleared items older than N days, failed or stale balance assertions | list | Base |
| RPT-LED-19 | **Money flow**: income through to spending groups and saving, top levels only *(D: OQ-RPT-5)* | Sankey | Candidate |
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
| RPT-BUD-8 | **Sinking funds**: earmarked balances, set aside vs. spent (FR-BUD-20, *D: OQ-BUD-9*) | table | Base |
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
| RPT-BLD-10 | **Rent vs. buy**: net worth under each choice over time, break-even year, and sensitivity (FR-BLD-52) | chart, table | Base |
| RPT-BLD-11 | **Self-employment**: net profit by business and year, self-employment tax, and estimated payments against the engine's estimate (Section 7.6) | table | Base |

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
| RPT-LIFE-6 | **Giving over life**, actual and planned *(D: OQ-PRD-4)* | chart | Candidate |

The Home dashboard's tiles (FR-UI-34) are small versions of these reports and link to them.

---

## 16. Help and getting started (FR-HLP)

Many users will never have kept a ledger or used a planning tool. Help has three layers: getting started, help in
place, and reference pages.

### 16.1 Getting started

- **FR-HLP-1** **Sample households:** synthetic households covering a range of ages, marital status and wealth. Each is
  a complete `.plens` file with 2 to 3 years of ledger history, this year's budget with actuals to date, a draft for
  next year, goals, and a plan ready to run. There are eight *(D: OQ-HLP-4)*:  | ID | Household | Stage | Means | Shows
  | |---|---|---|---|---| | S1 | Single, 24, first job, renting, student loans | starting out | modest income, few
  assets | budget, student loan payoff, emergency fund | | S2 | Married, 31 and 29, one child and one planned, renting |
  young family | middle income | house goal, college, new child, childcare | | S3 | Single parent, 38, two children,
  modest home | mid-career | lower-middle income | head of household, child tax credit, tight cash flow | | S4 |
  Married, 46 and 44, two teenagers, mortgage; one is self-employed | mid-career | upper-middle income | college,
  mortgage paydown, catch-up saving, self-employment (SEP IRA, estimated taxes) | | S5 | Married, 55 and 53, high
  income, large 401(k)s, second home | peak earning | affluent | giving pledge, gift bunching, financial independence,
  Roth choices | | S6 | Married, 62 and 60, near retirement | near-retiree | middle to affluent | joint claiming,
  inheritance, Retiring Years | | S7 | Widowed, 76, home paid off, Social Security and a small IRA | retired | modest |
  single filer, RMDs, aging in place, care reserve | | S8 | Married, 70 and 68, SC teacher's pension | retired | middle
  income | pension, travel phase, legacy |  Samples are generated by a script from seeded parameters, so they are
  reproducible and can be refreshed when rules or the schema change, with hand-tuned details so each tells its story
  *(D: OQ-HLP-3)*. They are regenerated for each release, so their "this year" is current *(D: OQ-HLP-7)*. They are
  never derived from real data (ssmodel's `private/` rule carries forward). They double as the life-stage test
  households (NFR-TEST-12).
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
  There is no step-by-step tour overlay *(D: OQ-HLP-1)*.
- **FR-HLP-5** **Empty states.** A page with no data explains what belongs there and why it matters, offers the
  action that fills it (import, add, start from a template), and links to its help page.
- **FR-HLP-6** **Plain ledger entry.** Double-entry stays the model, but beginners need not see debits and credits.
  A setting chooses the plain view (the default) or the accounting view. The plain view shows signed amounts with
  plain labels ("spent", "received", "payment", "charge"), and transfers as "from" and "to" *(D: OQ-HLP-6)*.

### 16.2 Help in place

- **FR-HLP-7** **Tooltips and explanations:** tooltips on every input (FR-UI-37) and "explain a number" (FR-UI-36).
- **FR-HLP-8** **Page help.** Every page has a help button (and F1) that opens that page's help in a side panel
  without leaving the page.
- **FR-HLP-9** **Glossary terms.** Terms such as PIA, RMD, IRMAA, sinking fund, role and planning group are marked
  where they appear, show a short definition on hover, and link to the glossary.

### 16.3 Reference help

- **FR-HLP-10** **Help pages** are bundled with the app and work offline (cached by the service worker, NFR-ARCH-7) and
  exist only in the app for now; a public website may be added for a public release *(D: OQ-HLP-2)*. They are written in
  Markdown in the repo, built into the app, and searchable by title and text. Contents:
  - **getting started:** a tour of the timeline, the first file, importing, the first budget;
  - **concepts:** double-entry for non-accountants, accounts and roles, categories, budget patterns, goals and
    priorities, how the simulation works, success probability and percentiles, real and nominal dollars;
  - **how-to guides:** check a balance against a statement, set up a paycheck, plan a house purchase, compare
    scenarios, move to a new computer, back up and restore;
  - **reference:** each page, each goal kind, the role catalog, the report catalog, rule tables and their sources;
  - **FAQ**, privacy (data never leaves the device), the disclaimer, and release notes;
  - an optional, separate **Stewardship** section *(D: OQ-HLP-5)*.
- **FR-HLP-11** **Help stays current.** A page's help is part of that page's definition of done. Help names screens
  and buttons exactly as the UI does, and tests check that every page's help link resolves (NFR-TEST-18).
- **FR-HLP-12** **Support.** A "copy diagnostics" button copies the app version, rule table years, browser version
  and recent errors, never household data. Questions go to the developer by email, and the help pages keep a FAQ
  *(D: OQ-PRD-5)*. There is no telemetry.

---

## 17. Open questions

Follow-up questions raised by the round 1 answers. Each has options (where there is a choice) and a lean. The leans
are suggestions to push back on. Record the decision under *Answer*. Answered questions move to the decision log
(Section 18).

### Budget

- **OQ-BUD-19 The year-after budget.** With three budgets open (FR-BUD-1), how detailed is the year after next?
  - *Options*:
    1. The same as next year's: full patterns and calendar.
    2. Annual totals per line only.
  - *Lean*: Option 1. It reuses the same editor and engine, and starts as a copy of next year's draft, so the extra
    detail costs the user nothing until they change it.
  - *Answer*:

### Building Years

- **OQ-BLD-34 Qualified business income deduction depth.**
  - *Options*:
    1. Simple: 20% of qualified business income below the income threshold, with a warning above it.
    2. The full rules above the threshold, including the specified-service and W-2 wage limits.
  - *Lean*: Option 1. Small sole proprietors are usually below the threshold. Revisit if a user isn't.
  - *Answer*:
- **OQ-BLD-35 S corporations.**
  - *Options*:
    1. Out.
    2. In: owner salary through payroll plus distributions.
  - *Lean*: Option 1, unless a first user has one.
  - *Answer*:
- **OQ-BLD-36 Business books.**
  - *Options*:
    1. Business income and expenses in the household file, as accounts with business roles.
    2. A separate file per business, with only net profit in the household file.
  - *Lean*: Option 1. Simple for a sole proprietor; business accounts can sit under their own category.
  - *Answer*:
- **OQ-BLD-37 Estimated tax payments.**
  - *Options*:
    1. User-entered quarterly amounts, with the engine's estimate beside them.
    2. Option 1, plus suggested safe-harbor amounts (based on last year's tax).
  - *Lean*: Option 2. The safe-harbor rule is simple and saves users a calculation.
  - *Answer*:
- **OQ-BLD-38 Rent vs. buy form.**
  - *Options*:
    1. A pair of scenarios generated from the house goal, run through the full engine and Monte Carlo.
    2. A standalone calculator.
  - *Lean*: Option 1. Taxes, goals and retirement effects come for free, and the comparison uses the same numbers as
    the plan.
  - *Answer*:

### Taxes

- **OQ-TAX-6 Personal property tax amounts.**
  - *Options*:
    1. The user enters the annual amount per vehicle from the bill; the plan indexes it.
    2. Rule data per state and county (assessment ratios, millage), computed from vehicle values.
  - *Lean*: Option 1. County rates vary too much to maintain; the bill is at hand.
  - *Answer*:

### User interface

- **OQ-UI-14 Rows of tabs.** Top tabs for sections, a second row for pages, and ssmodel's scenario tabs could make
  three rows on scenario pages.
  - *Options*:
    1. Three compact rows on scenario pages only.
    2. Scenario selector as a dropdown in the page header.
    3. Section tabs with dropdown menus for their pages, leaving two rows.
  - *Lean*: Option 1, then review it in a prototype. Scenario tabs carry ssmodel's clone, rename and reorder
    actions, which a dropdown would hide.
  - *Answer*:

### Reports

- **OQ-RPT-11 Candidate reports.** With everything in the first release (D: OQ-PRD-7), which Candidates are in?
  RPT-LED-13 tax summary, RPT-LED-14 cash flow statement, RPT-LED-15 savings rate, RPT-LED-16 debt summary,
  RPT-LED-17 investment change, RPT-LED-19 money flow, RPT-BUD-9 spending pace, RPT-BUD-10 upcoming, RPT-BLD-8
  contributions and limits, RPT-BLD-9 financial independence progress, RPT-RET-2 joint claiming map, RPT-RET-3
  earliest retirement date, RPT-LIFE-5 spending over life, RPT-LIFE-6 giving over life.
  - *Lean*: all except RPT-LED-19 (money flow) and RPT-RET-2 (joint claiming map), which can follow. The rest are
    small views over data the app already computes.
  - *Answer*:

### Delivery

- **OQ-DEL-5 When to rename goal requirements to `FR-GOAL`** (D: OQ-DEL-4).
  - *Options*:
    1. Now, in the next draft.
    2. After the next review round.
  - *Lean*: Option 1. The goal list grew only by rent vs. buy in this round, so it is settled enough, and nothing in
    code cites the IDs yet.
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
| D10 | Look and feel | Checquery's look and feel migrates to ssmodel's; breadcrumb-only navigation replaced by an app shell with top tabs | Section 11 |

### 18.1 Answered questions (round 1, 2026-11-23)

Answers of "ok" accepted the lean. **Bold** marks answers that differ from or add to the lean. The full questions
with their options and leans are in draft 0.2 (commit `2ba45fe`).

**Product and scope**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-PRD-1 | Name check | Quick check done; fuller check before any public release | §1.3 |
| OQ-PRD-2 | Distribution and licence | Private repo, free for invited users, unlisted URL; revisit before inviting others | FR-PRD-1 |
| OQ-PRD-3 | Rule-update promise | Late tables: last year's projected forward, with a warning | FR-PRD-3 |
| OQ-PRD-4 | Stewardship features | Giving as a first-class category now; optional stewardship content later | §1.3, RPT-LIFE-6 |
| OQ-PRD-5 | Support | The developer, by email, with "copy diagnostics"; FAQ in help | FR-HLP-12 |
| OQ-PRD-6 | Youngest life stage | From the first full-time job; students can use ledger and budget | §1.3 |
| OQ-PRD-7 | Release order | **Everything in this document** before the first friend uses it (lean was ledger and budget first) | FR-PRD-8, §15 |

**Household**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-HH-1 | Unmarried partners | Out; one file per tax household | FR-HH-2 |
| OQ-HH-2 | Marriage or divorce during the plan | Out; a future marriage is a separate scenario file | §1.4 |
| OQ-HH-3 | Planned children | Yes, dependents with future birth dates | FR-HH-4 |
| OQ-HH-4 | Supporting parents or adult children | Budget lines and goals; no dependent tax treatment | FR-HH-4 |
| OQ-HH-5 | Married filing separately | Out | §1.4, FR-HH-5 |
| OQ-HH-6 | Sex field | Required, labeled "for life-expectancy tables"; **no blended table** | FR-HH-1 |

**Ledger**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-LED-1 | Money representation | Integer cents in ledger and budget, float dollars in planning, one boundary | NFR-ARCH-12 |
| OQ-LED-2 | Stored currency format | Integer cents in new actions; migrate the log once during the port | NFR-ARCH-12, FR-BUD-5 |
| OQ-LED-3 | Keep the change log? | Keep the change log | NFR-ARCH-10 |
| OQ-LED-4 | Undo for ledger edits | Yes, within a session, as compensating actions | FR-LED-11 |
| OQ-LED-5 | Investment holdings | Balances only, with revaluations | §1.4, FR-LED-9 |
| OQ-LED-6 | Paychecks | **Gross with split deductions only** (lean was either gross or net) | FR-LED-10 |
| OQ-LED-7 | Date for budget actuals | Posted date | FR-BUD-16 |
| OQ-LED-8 | Statement reconciliation screen | **Probably never**; balance assertions suffice | §1.4 |
| OQ-LED-9 | Receipts and attachments | **Never** | §1.4 |

**Accounts and roles**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-ROLE-1 | Is a role required? | Required, with a generic default role per type | FR-ROLE-1 |
| OQ-ROLE-2 | Who defines roles? | A fixed catalog in the app | FR-ROLE-2 |
| OQ-ROLE-3 | Accounts that don't exist yet | Planned accounts in the plan only, linked to real accounts once opened | FR-ROLE-11 |
| OQ-ROLE-4 | A 401(k) with traditional and Roth money | Two ledger accounts, one per role | FR-ROLE-12 |
| OQ-ROLE-5 | Tax account granularity | Federal and state income tax one per household; Social Security and Medicare tax one per person each | FR-ROLE-3, FR-ROLE-4 |
| OQ-ROLE-6 | Employer contributions in the ledger | Recorded as income (employer contributions role) through the paycheck template | FR-ROLE-4 |
| OQ-ROLE-7 | Where role attributes live | Facts on the account; assumptions (returns, fees, glide paths) in plan scenarios | FR-ROLE-5 |
| OQ-ROLE-8 | Emergency fund: a role or a goal? | A goal or earmark on any cash account, not a role | FR-ROLE-4 |
| OQ-ROLE-9 | How fine are expense roles? | Planning-group roles plus the specific roles taxes and engines need | FR-ROLE-4 |
| OQ-ROLE-10 | Changing the catalog | File migrations map old roles to new; the role map flags accounts to review | FR-ROLE-2 |

**Import**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-IMP-1 | Formats first | CSV first, then OFX/QFX; QIF only if asked | FR-IMP-1 |
| OQ-IMP-2 | Categorization | Rules plus history-based suggestions, always flagged for review | FR-IMP-3 |
| OQ-IMP-3 | Direct bank connections | No direct bank connections | §1.4 |
| OQ-IMP-4 | Importing from other apps | Through CSV mapping; no dedicated importers | FR-IMP-1 |

**Budget**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-BUD-1 | Budgeting style | Plan vs. actual, with an optional "assign every dollar" check and per-line rollover | FR-BUD-14 |
| OQ-BUD-2 | Line granularity | Any category level; a category with a line blocks lines beneath it | FR-BUD-2 |
| OQ-BUD-3 | Vendor-level lines | Yes, optional; the rest of the account goes to "other" | FR-BUD-3 |
| OQ-BUD-4 | Budget year | Calendar year | FR-BUD-1 |
| OQ-BUD-5 | Versions | One budget per year, with an original snapshot | FR-BUD-15, FR-UI-25 |
| OQ-BUD-6 | Seasonal entry | Both 12 amounts and annual total with weights | FR-BUD-10 |
| OQ-BUD-7 | Weekend and holiday shifting | Weekend shifting per line; no holidays | FR-BUD-11 |
| OQ-BUD-8 | Every-N-years items | Allowed in the year they fall due; the plan repeats them | FR-BUD-23 |
| OQ-BUD-9 | Sinking funds | Virtual earmarks first | FR-BUD-20, RPT-BUD-8 |
| OQ-BUD-10 | Rollover | Per-line option, off by default, on for earmarked irregular lines | FR-BUD-20 |
| OQ-BUD-11 | Loan payments | Yes, automatic principal and interest split | FR-BUD-6 |
| OQ-BUD-12 | Taxes in the budget | User-entered withholding, with the engine's estimate beside it | FR-BUD-25 |
| OQ-BUD-13 | Budget from history | Averages and same month last year first; pattern detection later | FR-BUD-12 |
| OQ-BUD-14 | Starting mid-year | Full-year budget; past months show actuals or "no data" | FR-BUD-12 |
| OQ-BUD-15 | Overspending alerts | In-app indicators only | FR-BUD-21 |
| OQ-BUD-16 | Percentage lines | User picks gross or net; budget uses budgeted income, tracking uses actual | FR-BUD-22 |
| OQ-BUD-17 | Saving in the budget | Budget lines to ASSET accounts linked to goals | FR-BUD-24 |
| OQ-BUD-18 | Two budgets in flight | **Three budgets open**: this year, next year and the year after | FR-BUD-1 |

**Building Years**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-BLD-1 | Time step | Yearly, with monthly amortization inside each year | FR-HH-7, FR-BLD-12 |
| OQ-BLD-2 | Allocation | User-ordered priority list with a recommended default | FR-BLD-13 |
| OQ-BLD-3 | Uncertain goal targets | Deterministic targets within a scenario | FR-BLD-16 |
| OQ-BLD-4 | College cost data | Presets from published averages as rule data, with user override | FR-BLD-5 |
| OQ-BLD-5 | Financial aid | Out; aid entered as a reduction | FR-BLD-5 |
| OQ-BLD-6 | Money left in a 529 | Later; leftovers stay invested and are reported | FR-BLD-5 |
| OQ-BLD-7 | Federal student loan plans | User-entered payment and optional forgiveness; no income-driven plan modeling | FR-BLD-7 |
| OQ-BLD-8 | Rent vs. buy | **Include rent vs. buy now** (lean was later) | FR-BLD-6, FR-BLD-52 |
| OQ-BLD-9 | Refinancing | A dated change of rate, term and costs | FR-BLD-8 |
| OQ-BLD-10 | Employer match | Two tiers plus non-elective; no true-up | FR-BLD-3 |
| OQ-BLD-11 | Vesting | Ignore; assume vested | FR-BLD-3 |
| OQ-BLD-12 | Backdoor and mega-backdoor Roth | Out at first; flag ineligible Roth IRA contributions | FR-BLD-3 |
| OQ-BLD-13 | Self-employment | **Include self-employment from the start** (lean was out) | §1.4, §7.6 |
| OQ-BLD-14 | Stock compensation | Out; RSUs as bonuses | §1.4 |
| OQ-BLD-15 | Insurance needs | Out; premiums are budget lines | §1.4 |
| OQ-BLD-16 | Vehicle financing | Vehicle goal with optional loan share | FR-BLD-10 |
| OQ-BLD-17 | Emergency fund target | Months of essential plus housing expenses, default 6, or a fixed amount | FR-BLD-4 |
| OQ-BLD-18 | Glide paths | Optional preset glide path per account | FR-ROLE-5 |
| OQ-BLD-19 | Wage uncertainty | Deterministic; job loss as a scenario | FR-BLD-1, FR-BLD-16 |
| OQ-BLD-20 | Retirement date | Input, plus earliest date with at least X% success as an output | FR-BLD-12, FR-RET-8 |
| OQ-BLD-21 | Goal conflicts | Show what each goal would need; suggestions later | FR-BLD-14 |
| OQ-BLD-22 | Earliest affordable date | Deterministic search over years, Monte Carlo to confirm | FR-BLD-18 |
| OQ-BLD-23 | K–12 and 529 | Yes, with cap and SC rules as rule data; verify current rules first | FR-BLD-19 |
| OQ-BLD-24 | Gift and estate tax | Flag gifts above the annual exclusion; no estate tax | FR-BLD-22 |
| OQ-BLD-25 | Home value after projects | Optional percentage of cost, default 0 | FR-BLD-24 |
| OQ-BLD-26 | Financial independence target | Computed from the plan, with the rule of thumb beside it | FR-BLD-27 |
| OQ-BLD-27 | Pledge priority | Right after the employer match by default | FR-BLD-13, FR-BLD-30 |
| OQ-BLD-28 | Legacy floor vs. objective | Soft target by default, hard floor as an option | FR-BLD-31 |
| OQ-BLD-29 | Gift bunching | Timing of deductions only | FR-BLD-33 |
| OQ-BLD-30 | Child-owned accounts | Out; tracked and projected only | FR-BLD-36 |
| OQ-BLD-31 | Skipping nice-to-haves on bad paths | Skip below a threshold, as an option, off by default | FR-BLD-46 |
| OQ-BLD-32 | ssmodel's one-time expenses | Convert all to goals | FR-BLD-47 |
| OQ-BLD-33 | Spending shape in retirement | A goal, plus an optional real-spending decline in assumptions | FR-BLD-37 |

**Retiring Years**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-RET-1 | Joint claiming search | Deterministic prefilter, then Monte Carlo on the top 20 | FR-RET-2, NFR-SIM-4 |
| OQ-RET-2 | Claiming advice for younger users | Recommend only within 10 years of age 62 | FR-RET-3 |
| OQ-RET-3 | Trust-fund cut | Trustees Report cut by default under 55; none and user-set as options; random deferred | FR-RET-4 |
| OQ-RET-4 | Inheritances | Keep, hidden by default, several benefactors | FR-RET-5 |
| OQ-RET-5 | Divorced-spouse and survivor-of-ex benefits | Still out | §1.4 |
| OQ-RET-6 | Defined-benefit pensions | In, as annuities; no accrual formulas | §1.4, FR-RET-7 |

**Taxes**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-TAX-1 | Which credits and deductions at first | Child tax credit, student loan interest, premium tax credit first; AOTC next; others when needed | FR-BLD-11, FR-BLD-20, FR-BLD-34, FR-RET-6, FR-TAX-10 |
| OQ-TAX-2 | Moving between states | Residence changes January 1 after the move | FR-TAX-11 |
| OQ-TAX-3 | Order of new states | **SC, then NC, GA, FL, NY, VA, PA**, then others as suggested | FR-TAX-9 |
| OQ-TAX-4 | State-tax interface | Parameterized model with per-state code hooks | FR-TAX-9 |
| OQ-TAX-5 | Local taxes | **Include personal property taxes** where states levy them, and track property taxes for tax forecasting; other local taxes out | FR-TAX-13 |

**Storage**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-STO-1 | Autosave | Autosave everything; what-ifs as a session overlay | FR-STO-3 |
| OQ-STO-2 | Encryption | On by default; can be turned off with a warning | FR-STO-5 |
| OQ-STO-3 | Recovery key | Random recovery key shown once as words, wrapping the file key | FR-STO-5 |
| OQ-STO-4 | Backups | Last 10 in OPFS; daily in the backup folder, 30 days plus monthly | FR-STO-6 |
| OQ-STO-5 | Two computers | Warning only; log designed so merging stays possible | FR-STO-4 |
| OQ-STO-6 | Where each kind of data lives | Ledger and budget as entities; the plan as one JSON document | NFR-ARCH-10, FR-BUD-5, FR-STO-8 |
| OQ-STO-7 | `.checquery` files | **Convert the single file once**; if too complicated, no conversion at all | FR-MIG-1 |

**User interface**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-UI-1 | Navigation model | Timeline plus a Goals page | FR-UI-19 |
| OQ-UI-2 | Home dashboard | Fixed set with show/hide | FR-UI-34 |
| OQ-UI-3 | Life stage | Collapse, with a one-line explanation | FR-UI-35 |
| OQ-UI-4 | One Console or two | One Console with a phase selector | FR-UI-21 |
| OQ-UI-5 | Main navigation | **Top tabs**; ssmodel already uses the left side heavily (lean was a sidebar) | FR-UI-20 |
| OQ-UI-6 | Routing | TanStack Router with hash history | FR-UI-23 |
| OQ-UI-7 | Breadcrumbs | Drill-down trail only | FR-UI-22 |
| OQ-UI-8 | A second window | **Read-only live second window from the start** (lean was later) | FR-UI-23, FR-STO-4 |
| OQ-UI-9 | Phase colors | One quiet hue per phase | FR-UI-29 |
| OQ-UI-10 | Accessibility target | WCAG 2.2 AA with automated checks | NFR-UI-3 |
| OQ-UI-11 | Brand design | In-house now; designer before any public release | FR-UI-32 |
| OQ-UI-12 | Where account management lives | Primary-account registers under Past; structure editing under Setup | FR-UI-19 |
| OQ-UI-13 | Register design | Shared TanStack grid with Checquery keyboard behaviors | FR-UI-31 |

**Reports**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-RPT-1 | First-release reports | Every Base report (with OQ-PRD-7, in the first release) | §15 |
| OQ-RPT-2 | Custom reports | Fixed reports with filters and saved views; SQL page maybe later | FR-RPT-7 |
| OQ-RPT-3 | Where saved views are kept | In the household file | FR-RPT-7 |
| OQ-RPT-4 | Spending-by-category chart | Horizontal bars with a treemap toggle | RPT-LED-5 |
| OQ-RPT-5 | Money-flow (Sankey) chart | In, top levels only, as a Candidate | RPT-LED-19 |
| OQ-RPT-6 | Tax summary depth | Totals by tax role | RPT-LED-13 |
| OQ-RPT-7 | Default report period | Calendar year; trailing 12 months one click away | FR-RPT-2 |
| OQ-RPT-8 | Investment returns | Change split first, then money-weighted return | RPT-LED-17 |
| OQ-RPT-9 | Charting | Recharts plus custom SVG | FR-RPT-4 |
| OQ-RPT-10 | Printing | Browser printing with a print stylesheet | FR-RPT-6 |

**Help**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-HLP-1 | Guided tour | Checklist and empty states only | FR-HLP-4 |
| OQ-HLP-2 | Where help lives | In the app only for now | FR-HLP-10 |
| OQ-HLP-3 | Making the samples | Generator plus hand-tuned details | FR-HLP-1 |
| OQ-HLP-4 | Which samples | The eight samples | FR-HLP-1 |
| OQ-HLP-5 | Stewardship content in help | A separate, optional Stewardship section | FR-HLP-10 |
| OQ-HLP-6 | Debits and credits | Setting: plain (default) or accounting view | FR-HLP-6 |
| OQ-HLP-7 | Sample dates | Regenerate for each release | FR-HLP-1 |
| OQ-HLP-8 | Video help | **No video** | §1.4 |

**Delivery**

| ID | Question | Decision | Where applied |
|---|---|---|---|
| OQ-DEL-1 | Repository | Rename this repo and copy Checquery's code in | Introduction |
| OQ-DEL-2 | Requirement IDs | Keep ssmodel's IDs and add areas | Introduction |
| OQ-DEL-3 | Where Checquery's tests go | Port domain and storage tests; page tests become Playwright e2e | NFR-TEST-19 |
| OQ-DEL-4 | Goal requirement IDs | Rename to `FR-GOAL` once the goal list settles (timing: OQ-DEL-5) | §7 |

---

## 19. Testing and acceptance (NFR-TEST, continued)

ssmodel's NFR-TEST-1 to NFR-TEST-7 carry forward. Added:

- **NFR-TEST-8** **Golden continuity:** after the generic-household migration, the current ssmodel household file
  produces the same golden results as before, within floating-point tolerance. Any difference is explained in the
  commit, as ssmodel's NFR-TEST-2 requires.
- **NFR-TEST-9** **Ledger parity** (if FR-MIG-1 is built): converting the real `.checquery` file (locally, never in
  fixtures) gives the same Balance Sheet and Income Statement totals as the Checquery server for the same dates. A
  synthetic `.checquery` fixture covers the same path in CI.
- **NFR-TEST-10** **Budget calendar:** unit tests for frequency expansion, covering:
  - biweekly pay in 26- and 27-paycheck years;
  - day 31 and February;
  - weekend shifting;
  - steps within the year;
  - occurrence-count durations;
  - seasonal weights that sum to the annual total, to the cent.
- **NFR-TEST-11** **Rule citations:** every new federal or state rule (contribution limits, credits, self-employment
  tax, the qualified business income deduction, the 529
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
- **NFR-TEST-19** **Checquery's tests:** its domain and storage tests are ported to `bun test`. Its Solid page tests
  are replaced by Playwright e2e tests on the sample households *(D: OQ-DEL-3)*.
