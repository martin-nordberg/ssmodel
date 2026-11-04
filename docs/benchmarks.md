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
