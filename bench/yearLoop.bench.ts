// T0.6 spike: a throwaway but realistic yearly loop to measure Monte Carlo cost [NFR-ARCH-6, NFR-SIM-1].
// 6 accounts, federal brackets with LTCG stacking, SS taxation, a fixed-point withdrawal solve and an IRMAA lookup.
import { createRng, Stream } from '../src/engine/sim/rng.ts'

const BRACKETS = [
  [0, 0.1],
  [24800, 0.12],
  [100800, 0.22],
  [211400, 0.24],
  [403550, 0.32],
  [512450, 0.35],
  [768700, 0.37],
] as const
const IRMAA = [218000, 274000, 342000, 410000, 750000]

function ordinaryTax(taxable: number, idx: number) {
  let tax = 0
  for (let i = 0; i < BRACKETS.length; i++) {
    const lo = BRACKETS[i]![0] * idx
    const hi = i + 1 < BRACKETS.length ? BRACKETS[i + 1]![0] * idx : Number.POSITIVE_INFINITY
    if (taxable <= lo) break
    tax += (Math.min(taxable, hi) - lo) * BRACKETS[i]![1]
  }
  return tax
}

function taxableSS(ss: number, otherIncome: number) {
  const pi = otherIncome + ss / 2
  if (pi <= 32000) return 0
  if (pi <= 44000) return Math.min(0.5 * ss, 0.5 * (pi - 32000))
  return Math.min(0.85 * ss, 0.85 * (pi - 44000) + Math.min(0.5 * ss, 6000))
}

function totalTax(ordinary: number, ltcg: number, ss: number, idx: number) {
  const tss = taxableSS(ss, ordinary + ltcg)
  const agi = ordinary + ltcg + tss
  const taxable = Math.max(0, agi - 34700 * idx)
  const ordTaxable = Math.max(0, taxable - ltcg)
  const capTax = Math.max(0, taxable - Math.max(ordTaxable, 98900 * idx)) * 0.15
  let irmaa = 0
  for (const t of IRMAA) if (agi > t * idx) irmaa += 1000
  return ordinaryTax(ordTaxable, idx) + capTax + irmaa
}

function runPath(seed: number, path: number, claimAge: number, years: number) {
  const rInf = createRng(seed, path, Stream.inflation)
  const rRet = createRng(seed, path, Stream.returns)
  const bal = [40000, 300000, 650000, 90000, 220000, 180000] // cash, taxable, trad, 401k, inherited, roth
  const mean = [0.03, 0.05, 0.055, 0.05, 0.05, 0.07]
  const sd = [0.005, 0.1, 0.11, 0.1, 0.1, 0.16]
  let idx = 1
  let infl = 0.025
  let spend = 90000
  let minBal = Number.POSITIVE_INFINITY
  for (let y = 0; y < years; y++) {
    infl = 0.025 + 0.6 * (infl - 0.025) + 0.012 * rInf.normal()
    idx *= 1 + infl
    spend *= 1 + infl
    const ss = y + 66 >= claimAge ? 38000 * idx * (1 + (claimAge - 67) * 0.08) : 0
    const rmd = y > 8 ? (bal[2]! + bal[3]!) / (27 - y * 0.5) : 0
    const inh = y < 7 ? bal[4]! / (7 - y) : 0
    // Fixed-point solve: withdraw from taxable then traditional until after-tax cash meets need.
    let wTaxable = 0
    let wTrad = 0
    for (let it = 0; it < 12; it++) {
      const ordinary = rmd + inh + wTrad
      const tax = totalTax(ordinary, wTaxable * 0.3, ss, idx)
      const cash = ss + rmd + inh + wTaxable + wTrad - tax
      const gap = spend - cash
      if (Math.abs(gap) < 1) break
      if (bal[1]! - wTaxable > gap) wTaxable = Math.max(0, wTaxable + gap)
      else wTrad = Math.max(0, wTrad + gap * 1.15)
    }
    const need = wTaxable + wTrad
    if (need < 0) minBal = 0
    bal[1] = bal[1]! - wTaxable
    bal[2] = bal[2]! - wTrad - rmd / 2
    bal[3] = bal[3]! - rmd / 2
    bal[4] = bal[4]! - inh
    let total = 0
    for (let a = 0; a < bal.length; a++) {
      const r = Math.exp(mean[a]! + sd[a]! * rRet.normal()) - 1
      bal[a] = Math.max(0, bal[a]! * (1 + r))
      total += bal[a]!
    }
    if (total < minBal) minBal = total
  }
  return minBal
}

const CANDIDATES = 33
const PATHS = Number(process.argv[2] ?? 5000)
const YEARS = 35
const t0 = performance.now()
let sink = 0
for (let c = 0; c < CANDIDATES; c++) {
  for (let p = 0; p < PATHS; p++) sink += runPath(20270101, p, 62 + c * 0.25, YEARS)
}
const ms = performance.now() - t0
const pathYears = CANDIDATES * PATHS * YEARS
console.log(
  JSON.stringify({
    candidates: CANDIDATES,
    paths: PATHS,
    years: YEARS,
    ms: Math.round(ms),
    usPerPathYear: (ms * 1000) / pathYears,
    sink: sink > 0,
  }),
)
