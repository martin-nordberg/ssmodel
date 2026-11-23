# CLAUDE.md

Social Security claiming model: a client-only SPA. Specs: `docs/requirements.md` (requirement IDs like FR-SS-2),
plan: `docs/plan.md` (tasks T0.1 …).

## Commands

- `bun run dev` — Vite dev server (runs under Bun)
- `bun test` — unit tests (`*.test.ts`)
- `bun run e2e` — Playwright, Chromium only: `test/e2e/*.e2e.ts` against the built app, and `test/browser/*.browser.ts`
  (browser-only store code in a worker, on its own Vite dev server)
- `bun run typecheck` — `tsc -b` (TypeScript 7)
- `bun run lint` / `bun run format` — Biome
- Bun version is pinned in `mise.toml`. Never use npm/node directly.

## Layout

- `src/engine/` — pure TypeScript calculation engine. **No React/DOM imports.** Testable with `bun test`.
- `src/schema/` — Zod schemas (source of truth for input types), YAML I/O, migrations.
- `src/worker/` — engine worker pool and protocol; the store worker (`store.worker.ts`) and its protocol.
- `src/ledger/` — ledger domain ported from Checquery (Zod schemas, service interfaces). Amounts are integer cents.
- `src/store/` — storage, no React: driver interface (`bun:sqlite` in tests, SQLite WASM in the worker), change log,
  materialized store, `.plens` file handling (OPFS working copy, autosave, locks, backups).
- `src/state/` — Zustand store (scenarios, what-if overrides, undo/redo).
- `src/app/` — React UI. `src/components/ui/` is shadcn-generated; add with `bunx --bun shadcn@latest add <name>`.
- `data/rules/` — versioned rule tables (JSON) with `effectiveYear` and `sourceUrl`. Update via `docs/rule-data.md`.
- `test/` — unit tests mirroring `src/`, fixtures, reference engine, e2e.
- `private/` — git-ignored real household data. Never commit it, never copy it into fixtures.

## Conventions

- Money is float64 dollars. Round only where a rule requires it (SSA PIA to the dime, benefit down to the dollar)
  and for display.
- Dates in the engine are month indices (`YearMonth`, months since year 0) unless a day matters.
- Rule constants come from `data/rules`, never inline literals in engine code.
- New rules get unit tests that cite their source (SSA/IRS/SC DOR URL or publication) in a comment.
- Formatting: Biome (2 spaces, single quotes, no semicolons, width 120).
- Commit per plan task: `T1.3: PIA from earnings record`.
