# P0 spike

Throwaway measurements for the ProvisionLens P0 decision gate (`docs/provisionlens-plan.md`). Not part of the app
build, the unit tests or the e2e suite.

- `bun run spike` starts the spike's own Vite server (port 5199, cross-origin isolated) and runs `*.spike.ts`.
- Measurements are written to `spike/results/` (git-ignored) and summarized in `docs/benchmarks.md`.
- Tests that need the real Checquery file look for `private/Nordbergs.checquery` (or `SPIKE_CHECQUERY_FILE`) and
  skip when it's absent. They never print or record amounts from it.

| Task | Spec              | Measures                                                                             |
| ---- | ----------------- | ------------------------------------------------------------------------------------ |
| P0.1 | `sqlite.spike.ts` | SQLite WASM in a worker: import to OPFS, open, query, export, write to a file handle |
