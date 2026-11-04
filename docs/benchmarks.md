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
