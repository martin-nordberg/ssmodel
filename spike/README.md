# P0 spike

Throwaway measurements for the ProvisionLens P0 decision gate (`docs/provisionlens-plan.md`). Not part of the app
build, the unit tests or the e2e suite.

- `bun run spike` starts the spike's own Vite server (port 5199, cross-origin isolated) and runs `*.spike.ts`.
- Measurements are written to `spike/results/` (git-ignored) and summarized in `docs/benchmarks.md`.
- Synthetic encrypted fixtures are generated into `spike/.out/` (git-ignored) by Checquery's own code
  (`spike/checquery/makeFixture.ts`), which needs a Checquery checkout at `CHECQUERY_DIR` (default
  `../checquery`). The global setup runs it when the fixtures are missing.
- Tests that need the real Checquery file look for `private/Nordbergs.checquery` (or `SPIKE_CHECQUERY_FILE`) and
  skip when it's absent. They never print or record amounts from it. Tests that decrypt it also need the
  password in `SPIKE_CHECQUERY_PASSWORD`; set it in your own terminal without echoing it:

  ```sh
  read -rs SPIKE_CHECQUERY_PASSWORD && export SPIKE_CHECQUERY_PASSWORD && bun run spike; unset SPIKE_CHECQUERY_PASSWORD
  ```

| Task | Spec              | Measures                                                                              |
| ---- | ----------------- | ------------------------------------------------------------------------------------- |
| P0.1 | `sqlite.spike.ts` | SQLite WASM in a worker: import to OPFS, open, query, export, write to a file handle  |
| P0.2 | `crypto.spike.ts` | scrypt (@noble/hashes) and AES-GCM (Web Crypto) against payloads written by Checquery |
| P0.3 | `parity.spike.ts` | Decrypt and replay in the browser; statement totals against Checquery's own code      |

## Converting the real file (P2.9)

`spike/checquery/convertParity.ts` converts the real `.checquery` file with ProvisionLens's converter and checks
that the converted statements match Checquery's own, for every year-end since 2000, every calendar year and today.
It prints only counts, timings and pass/fail (differences by key, never amounts), and only reads the original:

```sh
read -rs SPIKE_CHECQUERY_PASSWORD && export SPIKE_CHECQUERY_PASSWORD && bun spike/checquery/convertParity.ts; unset SPIKE_CHECQUERY_PASSWORD
```

To convert it for use, open the app and choose File › Convert a Checquery file….
