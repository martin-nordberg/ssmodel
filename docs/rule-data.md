# Rule data upkeep

Rule tables live in `data/rules/*.json` [NFR-ARCH-4, FR-DATA-1]. Each file records its sources. Engine code reads
them only through `src/engine/rules/tables.ts`. Years after the latest table are projected with simulated
inflation and reported in the warnings panel [FR-DATA-2].

After any update, run `bun test test/engine/rules`. The SSA tests cross-check the wage index (AWI) against the
published bend points and taxable maximums, so a mistyped AWI value fails the tests.

## Annual checklist

| When | Publisher | What to update | File |
|---|---|---|---|
| Mid-October | SSA COLA fact sheet + Federal Register notice | Next year's COLA, the latest AWI value, taxable maximum, earnings-test limits; check bend points (computed from AWI) | `ssa.json` |
| October–November | IRS Rev. Proc. (inflation adjustments) | Brackets (MFJ, single), standard deduction, additional 65+ amount, LTCG thresholds | `federalTax.json` (add a year key) |
| November | CMS | Part B standard premium, Part D base beneficiary premium, IRMAA thresholds and amounts | `medicare.json` (add a year key) |
| December–January | SC DOR (SC1040 instructions) | Rate schedule (rates may fall under Act 110 triggers), SCIAD amounts and phase-out, retirement and age-65 deductions | `scTax.json` (add a year key) |
| Spring | SSA Trustees Report | Depletion dates and payable percentages for the presets; new period life table | `ssa.json` `trusteesPresets`, `lifeTable.json` |
| As needed | IRS Pub 590-B | Life expectancy tables (changed in 2022 only) and RMD ages | `rmd.json` |
| Law changes | Congress / SC General Assembly | Senior deduction (2025–2028), NIIT, SS taxation thresholds (unindexed) | `federalTax.json` `unindexed` |

## Status (2026-11-04)

- SSA: complete for 2027 (COLA 3.6%, AWI 2025 = 72,800.33, taxable maximum $192,300, earnings test $25,560 / $67,920).
- IRS: 2026 is the latest. 2027 had not been published as of this date; projected.
- CMS: 2026 is the latest. 2027 premiums are expected mid-November 2026; projected until then.
- SC: 2026 rates and SCIAD verified against the ratified Act 110 text (H.4216). The retirement (§12-6-1170),
  age-65, Social Security (§12-6-1120) and capital gain (§12-6-1150) provisions use existing law that Act 110 did
  not amend. Confirm them against the 2026 SC1040 instructions when they are published.
- Life table: SSA 2022 period table (2025 Trustees Report), transcribed via Open Social Security. ssa.gov blocks
  automated downloads, so check spot values by hand against https://www.ssa.gov/oact/STATS/table4c6.html.
