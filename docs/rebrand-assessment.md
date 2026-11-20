# Rebrand Assessment: What the Scope Expansion Would Take

Status: assessment, updated 2026-11-20 with five decisions (below). Responds to [rebrand.md](rebrand.md). Everything
not listed under Decisions is still open.

## Decisions

- **D1. Use ssmodel's tech stack:** React 19, shadcn, Recharts, TanStack Table, Zustand, Zod, Vite on Bun,
  TypeScript 7, Biome, `bun test`, Playwright, Chromium only. Checquery's SolidJS client is rewritten.
- **D2. No server.** The app is a PWA that opens a local SQLite file (`.plens`) directly. Checquery's Bun + Hono
  server, sign-in, Docker and Caddy deployment go away.
- **D3. It becomes a product, first for family and friends.** Many of them are not yet close to retirement, so the
  household model, the engine and the recommendation must handle any household shape and any stage of life, not one
  couple near retirement.
- **D4. States are added one at a time, starting with SC only.** The engine needs a state-tax interface; each
  further state is its own task.
- **D5. Desktop Chromium only, for now.** Chrome, Edge, Brave and Opera on desktop, as ssmodel today (Q-ARCH-1). No
  Safari, Firefox or phone support, and no fallback storage path.

## Summary

The merged app is ssmodel grown up. It keeps its browser-only, local-file, installable-offline design. Checquery
contributes its domain model, its change-log storage design and its pages. Those move into the browser, and the
pages are rewritten in React. The hard new parts are:

- running SQLite in the browser against a user-picked file;
- porting Checquery's encryption to browser APIs;
- giving up simultaneous use by two people;
- making ssmodel generic (D3). This is now the largest single piece of work. ssmodel's household model and
  recommendation are built around one couple near retirement, with the Spouse already collecting and only the
  Primary's claiming age to decide.
- the work of serving other people: hosting, onboarding, importing bank transactions, and keeping tax tables
  current every year.

## Where things stand

| | ssmodel | Checquery |
|---|---|---|
| Purpose | Forward-looking simulation (Social Security, taxes, Monte Carlo) | Actuals: double-entry ledger, Balance Sheet and Income Statement reports |
| UI | React 19, shadcn, Recharts, TanStack Table | SolidJS, hand-written components |
| Runtime | Runs only in the browser, no server (NFR-ARCH-1); offline PWA as of T6.1 | Bun + Hono server, Docker + Caddy, two users who sign in |
| Storage | YAML file opened with the File System Access API (Chromium only) | Encrypted SQLite file: an append-only log of every change, replayed into an in-memory database on open |
| Size | ~15k lines of source, ~5.5k of tests | ~28k lines: shared 8.5k, server 8k, client 11k |
| Budget | None | A stub page |

## What it would take

### 1. Run SQLite in the browser

- **Engine:** use the official SQLite WASM build in a dedicated Web Worker. This keeps the UI responsive and is
  where browser storage APIs allow synchronous file access. The Monte Carlo pool stays in its own workers.
- **The catch:** SQLite can't read and write a user-picked file in place. The browser only allows random-access,
  synchronous file handles on files inside the origin's private storage (OPFS). A file from `showOpenFilePicker` can
  only be read whole and written whole.
- **Approach:** treat the user's file as the source of truth, with a working copy in the browser.
  - **On open**, copy the file's bytes into OPFS and open that copy with SQLite.
  - **On each change**, the copy is durable immediately.
  - **After a short pause in editing, and on close**, write the whole database back to the user's file.
- **Why autosave:** this differs from ssmodel's explicit-Save model. Entered transactions shouldn't be lost because
  someone forgot to save, and the file is small (the current one is ~1.2 MB), so whole-file writes are cheap. The
  planning side can keep a "modified" state for unapplied what-ifs.
- **Several tabs:** use the Web Locks API so only one tab writes a given file; other tabs open it read-only or are
  refused.

### 2. Port Checquery's storage and domain into this repo

- **Keep the design:** the change log (append-only actions with timestamps and an origin) and the in-memory
  materialized database rebuilt on open both carry over. In the browser, both live in the SQLite worker.
- **Database driver:** 16 storage files import `bun:sqlite` directly. Add a small driver interface with two
  implementations: `bun:sqlite` so `bun test` keeps running these tests without a browser, and SQLite WASM in the
  app. Checquery's migrations carry over through the same interface.
- **Calls into storage:** the server's route handlers become direct service calls, sent to the worker through a
  typed message protocol like ssmodel's `src/worker/`. This replaces the typed Hono client.
- **File compatibility:** keep the file format readable, so the existing `.checquery` file opens directly and needs
  no export or import step.

### 3. Port encryption to browser APIs

- **Current design:** Checquery encrypts each action with AES-GCM. The key is derived from the file password with
  scrypt (`node:crypto`), using per-file parameters.
- **AES-GCM:** Web Crypto supports it. Check the byte layout: Node keeps the authentication tag separate, while Web
  Crypto appends it to the ciphertext.
- **scrypt:** Web Crypto has no scrypt. Use a small, audited JS implementation (for example `@noble/hashes`) in the
  worker so existing files still open.
- **Keep encryption?** Recommended. Without a server, the file is likely to sit in a cloud-synced folder, so
  encrypting it still matters.

### 4. Delete the server

What goes:

- the Hono app, routes and middleware (sign-in, CSRF, request lock, rate limiting);
- in-memory sessions and file unlock;
- environment config, idle close and file upload;
- static serving, the Docker image, Caddy and the deploy docs;
- Checquery's recent work on HTTPS (three phases) and "Download Backup".

What it did that now needs a replacement:

- **Two people at once:** gone. One writer per file. Either one person enters data, or the file sits in a synced
  folder and is used by one person at a time. Record "open on device X" in the file so a second device warns before
  editing; a sync service alone can't prevent conflicting copies. Later, the change log (timestamps plus origins)
  could support merging two diverged copies. That's a real option, but not for the first version.
- **Who made a change:** each change is stamped with an Origin (signed-in user plus IP address). Replace that with a
  device or user name set in the app's settings.
- **Backups:** the server backed up the file on every close. Replace that with rolling copies in OPFS, plus an
  optional backup folder the user chooses once (`showDirectoryPicker`, handle kept in IndexedDB) and the app writes
  to on close. "Download Backup" becomes "Save a copy…".
- **Phones and other machines:** the File System Access API is desktop Chromium only, so there's no phone use. That
  matches ssmodel's Chromium-only decision (Q-ARCH-1), but it's new for Checquery, which any browser could reach.

### 5. Rewrite Checquery's pages in React

- **Pages:** Register, Income Log, Expense Log, Balance Sheet, Income Statement, account and vendor management with
  their category trees, balance assertions, and the inline calculator.
- **Reuse:** ssmodel's components (TanStack grids with paste, shadcn dialogs and tooltips, Recharts) cover most
  needs.
- **Shaping logic:** Checquery's view-shaping code (register lines, report rollups) lives outside its components and
  doesn't depend on Solid, so it ports with its tests.
- **Tests:** the Solid component tests are rewritten as Playwright e2e tests, matching ssmodel's practice.

### 6. Move ssmodel's household model into the file

- **Recommendation:** start by storing the planning model as one versioned JSON document in a table of the
  `.plens` file. This keeps ssmodel's Zod schema, migrations, scenarios and undo/redo working unchanged.
- **Only the links get their own tables:** for example, which ledger account maps to which planning account. Break
  more of the document out into tables only where the budget needs it.
- **Why not entities in the change log?** ssmodel's nested scenarios and overrides are awkward to model that way.
- **YAML:** stays as the import/export and test-fixture format (golden files, worked examples), which fits
  Checquery's pending export-import task. Comments in the YAML file are no longer kept.

### 7. Combine the two data models

- **Accounts:** ledger accounts gain planning attributes: tax treatment (traditional, Roth, taxable with cost basis,
  HSA, inherited IRA), owner and return assumption. Plan starting balances come from ledger balances as of a date,
  instead of being typed in.
- **Expenses and income:** expense items and income streams map onto ledger categories. Last year's actuals feed
  next year's budget, and the budget feeds the long-range expense baseline, keeping the essential/discretionary
  split (Q-EXP-6) and inflation indexing.

### 8. Build the new features

- **Next Year (budget):** budget entry by category, plus budget-vs-actual reports. Neither app has this yet.
- **Building Years:** new engine work, detailed in section 11. Each of the budget and Building Years is roughly the
  size of an ssmodel milestone; with D3, Building Years is needed by most of the first users.
- **Prior Years:** mostly reports over ledger data that already exists.

### 9. Update the requirements

- **Unchanged:** browser-only (NFR-ARCH-1), with no data leaving the device. Chromium only (Q-ARCH-1), confirmed by
  D5.
- **Reversed by D3:** one household (Q-ARCH-5); local-only hosting (Q-ARCH-7, now a static site, see section 12);
  claiming date only (Q-REC-2, FR-REC-5); one living parent for inheritances (Q-INH-1); COBRA only before 65 with no
  ACA subsidies (Q-EXP-5); the "Husband/Wife" and "Primary/Spouse" wording.
- **Reversed by D4:** SC as the only state (`state: z.literal('SC')`).
- **Under more pressure:** the performance target (NFR-SIM-1), already missed for ~35-year paths and 18 candidates.
  See section 11.
- **Matters more:** the PWA (NFR-ARCH-7, T6.1), since it is now how the whole product is installed.
- **Rewritten for `.plens` SQLite files:** the file section, FR-FILE-1 to FR-FILE-9. Open, recent files and the OS
  file handler keep their shape. Save becomes autosave, and YAML becomes import/export.
- **New requirements for:** the browser working copy, the single-writer lock, encryption and backups.
- **One planning system:** use ssmodel's numbered requirements and `docs/plan.md`. Bring Checquery's
  `tasks/done/action-log.md`, `materialized-store.md` and `ledger-store.md` over as architecture references.

### 10. Rebrand

- **Repo:** with ssmodel's stack, evolve this repo (renamed) and bring in Checquery's domain and storage, rather
  than keeping two apps side by side.
- **Name and file type:** ProvisionLens, the `.plens` extension and file handler, and new icons.
- **Imports:** keep importers for `.checquery` files and household YAML.
- **Tagline:** it suggests features worth designing on purpose, such as giving or tithing as a first-class category
  with its own goals and reports.

### 11. Make the model generic (D3, D4)

**Household shape.**
- Replace the fixed `primary` and `spouse` (`src/schema/model.ts`) with one or two adults, Person 1 and Person 2, and
  optional dependents.
- Either adult may already be collecting Social Security or not. Today the Spouse must already be collecting
  (`ss.currentMonthly`, `claimedDate`), and only the Primary has an earnings record.
- Filing status: add head of household to the existing married-filing-jointly and single. Leave married filing
  separately out unless someone needs it.
- Children and dependents: the child tax credit, dependent care, and their end dates.

**Recommendation.**
- With two adults not yet claiming, the recommendation becomes a joint search over both claiming dates. Quarterly
  dates for each person give about 33 × 33 ≈ 1,000 pairs, against 18–33 candidates today.
- A full Monte Carlo on every pair is out of reach while NFR-SIM-1 is already missed. Narrow the pairs with the fast
  deterministic recompute first, then run Monte Carlo on a short list.
- Younger users will want more than claiming dates answered: savings rate, retirement age, affordability of goals.
  Let scenarios cover those, as today, before trying to optimize anything beyond claiming dates.

**Working years (the Building Years engine).**
- Wages with growth, and payroll tax (Checquery already records the employee Social Security tax paid).
- 401(k) and IRA contributions with employer match, HSA and 529 contributions.
- Health coverage before 65: employer plans and ACA marketplace subsidies. Today it's COBRA only.
- Goals and milestones as dated cash needs: college, a home purchase, a car, weddings.
- Projected Social Security for younger workers from their earnings so far plus future wages. AIME/PIA already
  supports projected earnings, but users far from claiming are where trust-fund uncertainty matters most. That was
  planned for v2 (Q-TF-1), and should come earlier.

**Longer horizons.**
- A 30-year-old's plan runs 60+ years, against ~35 today, so Monte Carlo costs roughly double. This is the point
  where the Rust/WASM port (NFR-ARCH-6) might be needed. Measure first, then decide.

**State taxes (D4).**
- Put a state-tax interface behind the federal calculation. Today `src/engine/tax/sc.ts` is called directly from
  the path loop, explain and warnings.
- Each state gets its own rule table in `data/rules/` and its own tests and worked example. SC stays the first and
  only one at launch.
- States with no income tax on wages or retirement income (for example FL, TX, TN, NV, WA) are almost free to add,
  so they make cheap early additions.
- A move between states (a year and a destination) is worth modeling, because it's common at retirement.

### 12. Serve family and friends

- **Hosting:** a static site (for example GitHub Pages or Cloudflare Pages) over HTTPS. There is still no server and
  no data leaves the device. New builds reach users through the update prompt from T6.1.
- **Annual rule updates:** these become an obligation to other people. `docs/rule-data.md` becomes a yearly release
  checklist (IRS, SSA, CMS and each supported state), and the status bar keeps showing which year's tables are in
  use.
- **Onboarding:**
  - a new-household flow that asks about life stage and only shows the setup panels that apply;
  - a default set of income and expense categories for the ledger;
  - help for pasting the SSA earnings record.
- **Importing transactions:** few people will type in every transaction. Importing bank and card exports (CSV, plus
  OFX/QFX where banks offer it), with matching rules for categories, is likely needed for adoption. It isn't in
  either app today.
- **Lost passwords:** an encrypted file with a forgotten password is lost for good. Offer a recovery key at
  creation and warn clearly.
- **Browsers (D5):** desktop Chromium only. Friends on Safari, Firefox or a phone can't use it; the app already shows
  a clear "Chromium-based browser required" message (FR-FILE-7). Revisit only if that blocks people who want to use
  it, since the fallback (browser-only storage and download/upload of the file) would be a large extra cost.
- **Support:** in-app help, the existing tooltips, and a "copy diagnostics" button. There is no telemetry, which fits
  a privacy-first, browser-only tool.
- **Disclaimer:** the status bar already says it's an educational tool, not advice. Make sure first-run shows it too.

## Suggested order

1. **Write one combined requirements doc** recording D1–D5 and the household shapes to support.
2. **Spike first, as a go/no-go check** like ssmodel's M0.
   - Open a copy of the real `.checquery` file in SQLite WASM in a worker.
   - Decrypt it with the browser scrypt and AES-GCM.
   - Replay the change log, and check the balance sheet totals match the server's.
   - Measure open time, and write the file back.
3. **Port storage and domain** into this repo behind the driver interface, with `bun test` coverage carried over.
4. **Rewrite Checquery's pages in React**, until the app matches what Checquery does today.
5. **Switch over:** keep using Checquery on the server until then. The switch is just opening the same file in the
   new app.
6. **Make the household model generic** (section 11): Person 1/Person 2, either adult not yet claiming, filing
   statuses, dependents, and the state-tax interface with SC behind it. Migrate the current household file forward
   and keep its golden results unchanged. This is the check that generalizing didn't break anything.
7. **Add the planning document** to the `.plens` file and import the household YAML.
8. **Link actuals to the plan.**
9. **Build the budget, then Building Years**, including the joint claiming search and its performance work.
10. **Get ready for family and friends** (section 12): transaction import, onboarding, the recovery key, static
    hosting and the annual rule-update checklist.
11. **Rebrand** to ProvisionLens and `.plens`, then release to the first users. Add states one at a time after
    that, the no-income-tax states first.
