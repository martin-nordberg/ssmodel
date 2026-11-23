# Benchmarks

## T0.6 — Year-loop spike (2026-11-04)

`bun run bench` (`bench/yearLoop.bench.ts`): a throwaway loop with 6 accounts, AR(1) inflation, lognormal
returns, federal brackets with LTCG stacking, SS taxation, IRMAA tier lookup and a fixed-point withdrawal solve
(up to 12 iterations).

| Machine | Runtime | Workload | Time | Per path-year |
|---|---|---|---|---|
| 8-core Linux laptop | Bun 1.4.4, single thread | 33 candidates × 5,000 paths × 35 years (5.8M path-years) | 3.5 s | 0.60 µs |

Projected with the full pool (7 workers): ≈ 0.5 s.

**Gate decision (NFR-ARCH-6): continue in TypeScript.** The production engine will do much more per year
(SC tax, healthcare, inheritances, deaths and survivor benefits, home, recording rows), plausibly 10–15× the
spike. That still projects to about 5–8 s with 7 workers. This is at the edge of the 5 s target, so:

- re-measure at T2.3 with the real engine;
- keep the reduction steps ready: summary-only recording for non-median paths, direct bracket inversion in the
  withdrawal solve, and a coarse→fine candidate grid;
- reconsider Rust/WASM only if the real engine is still over 15 s after those steps.

## T2.3 — Real engine (2026-11-04)

Full fixture (`test/fixtures/full.yaml`): 18 claiming candidates (the Primary is 65 on the base date), ~30 years
per path.

| Step | Per path × candidate (one thread) | 18 × 5,000 in Chromium (7 workers) |
|---|---|---|
| First working engine | 0.84 ms | — |
| Secant room search, cached SC params, pre-parsed dates | 0.41 ms | — |
| Incremental PIA, haircut table, per-path expense/income cache | 0.39 ms | — |
| Bracket room only when needed, bracketing from the untaxed need | 0.32 ms | — |
| Precomputed federal evaluator per year | 0.27 ms | 8.1 s |

Parallel scaling on this machine (i7-7700, 4 cores / 8 threads): 1 worker 20 s, 4 workers 7.7 s, 7 workers 8.1 s,
8 workers 8.8 s. Hyperthreads don't help this floating-point-heavy loop, and all-core clocks are lower than
single-core turbo. That is about 2.6× on 4 cores.

**Status vs NFR-SIM-1 (33 × 5,000 in under 5 s):** not met on this 2017 desktop. It projects to about 15 s for 33
candidates and is 8 s for this household's 18. Mitigations in place:
- progressive runs: about 500 paths first (under 1 s), then the full run with a progress bar and cancel;
- the coarse→fine candidate grid (T2.4): yearly candidates first, then quarterly near the best.

A newer laptop with more performance cores should be 2–3× faster. Rust/WASM stays the fallback if real-world use
shows the full run is too slow (NFR-ARCH-6 says to reconsider only above 15 s after the reductions).

## ProvisionLens P0 — Storage spike (2026-11-23)

`bun run spike` (`spike/`, see its README): Chromium 156 (Playwright 1.64.1), SQLite WASM 3.54.1, on the
development machine (i7-7700, 4 cores / 8 threads). Medians of three runs where repeated; milliseconds.

**P0.1 — SQLite WASM in a worker.** A file's bytes imported into OPFS, opened and queried (`PRAGMA quick_check`),
exported, written to a `FileSystemFileHandle` and read back. Every export was byte-identical to its input, and a
row written through the VFS survived export and re-import.

| File | VFS | Import | Open + check | Export | Write to handle | Read back |
|---|---|---|---|---|---|---|
| Synthetic, 1.1 MB | opfs-sahpool | 4.7 | 29.2 | 1.8 | 5.6 | 2.0 |
| Synthetic, 1.1 MB | opfs | 4.7 | 35.5 | 2.0 | 5.4 | 2.1 |
| Real Checquery file, 1.2 MB (raw SQLite) | opfs-sahpool | 4.5 | 61.9 | 2.2 | 6.5 | 2.2 |
| Real Checquery file, 1.2 MB (raw SQLite) | opfs | 5.3 | 74.4 | 2.8 | 5.8 | 2.1 |

**P0.2 — Browser crypto.** noble scrypt (N = 32768, r = 8, p = 1, Checquery's parameters) and Web Crypto AES-GCM.
Fixtures were written by Checquery's own server code; every payload decrypted identically to Checquery's
`node:crypto` output, and a wrong password was rejected.

| Fixture | Actions | Key derivation | Decrypt all |
|---|---|---|---|
| small | 78 | 141 | 1.5 |
| large (about the real file's size: 1.2 MB, 1,222 transactions) | 1,359 | 137 | 19.7 |
| real household file | 1,342 | 135 | 19.2 |

**P0.3 — Replay and parity.** The browser decrypts and replays the log into an in-memory ledger and runs Checquery's
balance queries. Checquery's own code (`openExistingFile`, then its services, cross-checked against its
`buildBalanceSheet`) gives the reference. Per-account balances, section totals and net worth matched for every
year-end from 2000, every calendar year and today, on both fixtures and on the real household file, including patched and deleted transactions
and a deleted account. Breaking the replay (ignoring deletes) makes both comparisons fail.

| Fixture | Working copy + read | Key | Decrypt | Replay | **Open total** | Statement queries (55) | Checquery open (Bun, native) |
|---|---|---|---|---|---|---|---|
| small | 31 | 141 | 3 | 12 | **183** | 9 | 84 |
| large | 97 | 136 | 31 | 135 | **399** | 60 | 127 |
| real household file | 98 | 134 | 32 | 141 | **405** | 50 | 125 |

The real-file rows were run locally with the password supplied through `SPIKE_CHECQUERY_PASSWORD` (timings and
pass/fail only; no amounts were printed or recorded):

```sh
read -rs SPIKE_CHECQUERY_PASSWORD && export SPIKE_CHECQUERY_PASSWORD && bun run spike; unset SPIKE_CHECQUERY_PASSWORD
```

**Gate decision (P0.4): continue as planned**, confirmed on the real household file.

- Open: about 0.4 s for a file the size of the household's, against the ≤ 3 s gate. Saving (export plus write to
  the user's file) is under 10 ms, against ≤ 1 s. There is room for a file ten times larger before the 3 s
  threshold, so snapshotting the materialized store isn't needed now.
- Key derivation is 0.14 s in JavaScript, well under the 2 s target; scrypt in WASM isn't needed.
- **VFS: opfs-sahpool.** It was slightly faster, and it needs no cross-origin isolation headers (COOP/COEP), which
  static hosts such as GitHub Pages can't set (FR-PRD-1). The plain `opfs` VFS works but would need those
  headers.
- **Note for P1.8 (second window):** opfs-sahpool is designed for a single connection per origin; a second tab
  can't open the same pool while the first holds it. The read-only second window (D: OQ-UI-8) should therefore get
  its data from the writer window over the BroadcastChannel (or work from an in-memory copy), not open the working
  copy itself. Verify when building P1.8.
- The spike code stays under `spike/`, outside the app build, the unit tests and CI.
