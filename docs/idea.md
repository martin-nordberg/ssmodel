

# Concept

Model the decision for when to begin Social Security using expected benefit as of a base date, expected/modeled income,
starting balances for retirement accounts of different types, estimates of inflation and future investment income rates,
published SSA rules, and expected yearly expenses.

# Architecture

The app functions as a dynamic SPA web page within a browser. It gathers info then runs entirely within the browser.
Inputs are persisted to files using the File System Access API in a typical file open/save/close user paradigm. Files store
only the inputs and are formatted as YAML. Outputs are recalculated when a file is loaded. There is no backend 
server apart from serving static content.

* Bun instead of NodeJS and NPM
* TypeScript
* React, Tailwind, shadcn
* Playwright, Bun.test

# Features

* Spreadsheet-like input forms and output scenarios.
* Different scenarios on tabs; create a new scenarios by cloning and existing one for starting values.
* Stochastic modeling for inflation, investment income, etc.
* Bottom line recommendation: when to start Social Security.
* Detailed output: depletion of savings over time, recommended withdrawal schedule by account type

# Key Inputs

* SSA projected benefit as of a baseline date (for husband).
* Potential reduction in benefits due to SS depletion, e.g. 80% starting in 2032.
* Wife's spousal benefit as a fraction of husband's, reduced from 50% since she is taking SS now.
* Roth IRA balance, Traditional IRA balance, Inherited IRA balance with year must be depleted, Non-tax-advantaged balance.
* Default baseline date is Jan 2027, nothing earlier is needed.
* Some expenses are of limited duration, e.g. a major one-time home improvement or a mortgage with an end date.
