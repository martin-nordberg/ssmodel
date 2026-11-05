# Worked examples

Hand calculations for the rules the engine implements [NFR-TEST-6]. Every number below is checked by
`test/workedExamples.test.ts`, so this document and the code cannot drift apart. All households are synthetic.

---

## 1. PIA from an earnings record

**Rule** (SSA, https://www.ssa.gov/oact/cola/piaformula.html): index earnings before the age-60 year by the AWI,
average the top 35 years, then apply the 90/32/15 formula at the age-62 bend points.

**Person**: born 1961-05-14. Ages are attained the day before the birthday, so 62 is attained in 2023. That makes
2023 the **eligibility year** and 2021 the **indexing year**. Earnings equal the national AWI every year from 1983
to 2022 (40 years).

1. Years before 2021 index to AWI(2021) = 60,575.07. Earnings equal to the AWI therefore index to exactly
   60,575.07 each.
2. 2021 counts at face value (60,575.07). 2022 counts at face value (63,795.13).
3. Top 35 years: 2022 plus 34 years at 60,575.07.
   Sum = 63,795.13 + 34 × 60,575.07 = 2,123,347.51.
4. AIME = 2,123,347.51 / 420 = 5,055.59, truncated to **5,055**.
5. 2023 bend points: 180 × 60,575.07 / 9,779.44 = **1,115** and 1,085 × 60,575.07 / 9,779.44 = **6,721**.
6. PIA = 0.90 × 1,115 + 0.32 × (5,055 − 1,115) = 1,003.50 + 1,260.80 = **2,264.30**.
7. COLAs start in December of the eligibility year. Each result is truncated to the dime:

| COLA (payable year) | Rate | PIA |
|---|---|---|
| 2024 | 3.2% | 2,336.70 |
| 2025 | 2.5% | 2,395.10 |
| 2026 | 2.8% | 2,462.10 |
| 2027 | 3.6% | **2,550.70** |

## 2. Benefit at a claiming age

**Rule**: 5/9 of 1% per month for the first 36 months before FRA, 5/12 of 1% per month beyond that.

Same person. FRA is 67, attained in May 2028. Claiming in **February 2027** is 15 months early.

- Factor = 1 − 15 × 5/900 = **0.916667**
- Monthly benefit = 2,550.70 × 0.916667 = 2,338.14, rounded down to **$2,338**

Claiming at 70 (May 2031) instead: 36 months of delayed credits × 2/3% = 24%, so the factor is **1.24**.

## 3. Spousal excess

**Rule**: the excess is 50% of the worker's PIA minus the spouse's own PIA. It is reduced by 25/36 of 1% per month
for the first 36 months before the spouse's FRA.

Worker PIA 3,000. Spouse's own PIA 1,000. The excess starts 24 months before her FRA.

- Unreduced excess = 0.5 × 3,000 − 1,000 = 500
- Reduction = 24 × 25/3600 = 16.667%
- Excess = 500 × (1 − 0.166667) = **416.67** per month

## 4. One year of federal and South Carolina tax (2026)

Married filing jointly, both 65+:
- Social Security: 50,000
- IRA withdrawals: 80,000 (40,000 each)
- Qualified dividends: 5,000
- Long-term gains: 10,000

**Taxable Social Security** (Pub 915 worksheet 1):
- Provisional income = 95,000 + 50,000 / 2 = 120,000
- 0.85 × (120,000 − 44,000) + min(25,000, 6,000) = 70,600, capped at 85% of benefits = **42,500**

**Federal**:
- AGI = 95,000 + 42,500 = **137,500**
- Deduction:
  - standard 32,200
  - plus 2 × 1,650 for age 65+
  - plus senior deduction 2 × 6,000 (MAGI is below $150,000, so no phase-out)
  - total = **47,500**
- Taxable income = 90,000, of which 15,000 is preferential and 75,000 ordinary
- Ordinary tax = 10% × 24,800 + 12% × (75,000 − 24,800) = 2,480 + 6,024 = **8,504**
- The preferential income tops out at 90,000, under the 0% limit of 98,900, so capital gains tax = **0**

**South Carolina** (Act 110 of 2026):
- Subtractions:
  - taxable SS 42,500
  - 44% of gains 4,400
  - each spouse: retirement deduction 10,000 plus age-65 deduction (15,000 − 10,000) = 15,000 each
  - total **76,900**
- SCIAD: (137,500 − 80,000) / 110,000 = 0.5227, so the reduction is 15,681.82, rounded down to 15,680. The
  deduction is 30,000 − 15,680 = **14,320**
- SC taxable income = 137,500 − 76,900 − 14,320 = **46,280**
- Tax = 5.21% × 46,280 − 966 = **1,445.19**

## 5. IRMAA with the two-year lookback

**Rule**: the 2027 Part B and D surcharges use 2025 MAGI. This uses the 2026 tier table, the latest published.

2025 MAGI = 230,000 (MFJ). That is above 218,000, so **tier 1** applies.
- Part B 284.10 instead of 202.90, a surcharge of 81.20 per month
- Part D surcharge 14.50 per month
- Annual surcharge per person = 12 × (81.20 + 14.50) = **1,148.40**

## 6. Lifetime RMD

**Rule**: from the year of the SECURE 2.0 RMD age, the prior year-end balance is divided by the Uniform Lifetime
divisor.

Born 1955, so the RMD age is 73, reached in **2028**. Balance at the end of 2027 is 500,000. The divisor at 73 is
26.5, so the 2028 RMD = 500,000 / 26.5 = **18,867.92**.

## 7. Inherited IRA schedule

Inherited traditional IRA (same as the full fixture):
- Owner born 1938-07-01, died 2023-04-15. That is after his required beginning date (2012), so annual RMDs apply.
- Deadline: end of **2033**.
- Beneficiary born 1963: she is 61 in 2024, Single Life divisor 26.2. The owner's remaining life is
  8.1 − 1 = 7.1. The longer one is used: **26.2**.

For 2027, with a prior year-end balance of 210,000:
- Required = 210,000 / (26.2 − 3) = **9,051.72**
- Even schedule = 210,000 / 7 remaining years (2027–2033) = **30,000**

## 8. One withdrawal solve

MFJ, both 65+, 2026 federal tax only. Social Security 40,000. After-tax spending 80,000. The only account is a
traditional IRA.

At W = 30,000: taxable SS is 11,100 and AGI is 41,100, below the 47,500 deduction, so tax is 0 and net cash is
70,000. The remaining 10,000 needs W = 30,000 + x, where:
- taxable SS rises by 0.85x (still below its 34,000 cap)
- AGI = 41,100 + 1.85x, so taxable income = 1.85x − 6,400, all in the 10% bracket
- net = 70,000 + x − 0.10 × (1.85x − 6,400) = 70,640 + 0.815x = 80,000, so x = 11,484.66

So **W = 41,484.66** with tax **1,484.66**. Check: 40,000 + 41,484.66 − 1,484.66 = 80,000.

## 9. Paying a Roth conversion's tax by selling shares

**Rule** (Q-TAX-6): gains realized by selling taxable shares to pay a conversion's tax are taxed in the same year.

MFJ, under 65, 2026, federal tax only. Ordinary income 120,000, so taxable income is 120,000 − 32,200 = 87,800.
Convert 20,000. There is no cash above the reserve target, so the tax is paid by selling shares with half their
value as gain (g = 0.5).

- Tax on the conversion alone: taxable income goes from 87,800 to 107,800, so
  12% × (100,800 − 87,800) + 22% × (107,800 − 100,800) = 1,560 + 1,540 = **3,100**
- Selling S of shares realizes 0.5 S of gain. It stacks above 107,800, past the 0% limit of 98,900, so it is taxed
  at 15%.
- With S = T: T = 3,100 + 0.15 × 0.5 × T, so T = 3,100 / 0.925 = **3,351.35**
- Shares sold 3,351.35, gain 1,675.68, tax on the gain 251.35
