// Monte Carlo [FR-MC-1, FR-MC-4, FR-SIM-5]. Each path's draws depend only on (seed, path index), so every claiming
// candidate sees the same paths (common random numbers) and results do not depend on how paths are sharded.
import { type YM, ym } from '../core/dates.ts'
import type { YearTrace } from '../explain/trace.ts'
import type { EnginePerson, Prepared } from '../model/prepare.ts'
import { BootstrapMarket } from './bootstrap.ts'
import { fixedDeathMonth } from './deterministic.ts'
import { drawInheritances } from './inheritance.ts'
import { monthsUntilDeath } from './mortality.ts'
import { newPathCache, type PathDraws, type PathSummary, runPath, type YearRow } from './path.ts'
import { lognormalParams, ParametricMarket } from './returns.ts'
import { createRng, Stream } from './rng.ts'

export type DrawContext = { prep: Prepared; market: ParametricMarket | BootstrapMarket | null; years: number }

export function drawContext(prep: Prepared): DrawContext {
  const asm = prep.scenario.assumptions
  const years = prep.endYear - prep.baseYear + 1
  const market =
    asm.returns.model === 'deterministic'
      ? null
      : asm.returns.model === 'bootstrap'
        ? new BootstrapMarket(prep.accounts, asm.returns)
        : new ParametricMarket(prep.accounts, {
            inflation: asm.inflation,
            crossAccountCorrelation: asm.returns.crossAccountCorrelation,
            inflationCorrelation: asm.returns.inflationCorrelation,
            realReturnShift: asm.returns.realReturnShift,
            volatilityMultiplier: asm.returns.volatilityMultiplier,
          })
  return { prep, market, years }
}

function stochasticDeath(person: EnginePerson, baseYM: YM, u: number): YM {
  const ageMonths = baseYM - ym(person.age.birth.year, person.age.birth.month)
  return baseYM + monthsUntilDeath(person.sex, ageMonths, person.ageOffset, u)
}

export function drawPath(ctx: DrawContext, seed: number, path: number): PathDraws {
  const { prep, market, years } = ctx
  const asm = prep.scenario.assumptions
  let inflation: Float64Array
  let returns: Float64Array[]
  if (market) {
    const d = market.draw(seed, path, years)
    inflation = d.inflation
    returns = d.returns
  } else {
    inflation = new Float64Array(years).fill(asm.inflation.mean)
    returns = prep.accounts.map((a) =>
      new Float64Array(years).fill(a.mean + (a.kind === 'cash' ? 0 : asm.returns.realReturnShift)),
    )
  }
  let deathMonth: [YM, YM]
  if (asm.mortality.mode === 'fixed') {
    deathMonth = [fixedDeathMonth(prep.people[0]), fixedDeathMonth(prep.people[1])]
  } else {
    const uP = createRng(seed, path, Stream.mortalityPrimary).next()
    const uS = createRng(seed, path, Stream.mortalitySpouse).next()
    deathMonth = [stochasticDeath(prep.people[0], prep.baseYM, uP), stochasticDeath(prep.people[1], prep.baseYM, uS)]
  }
  const propertyReturns = prep.properties.map((pr, k) => {
    const out = new Float64Array(years)
    if (!market) return out.fill(pr.mean)
    const rng = createRng(seed, path, Stream.realEstate + 16 * (k + 1))
    const { mu, sigma } = lognormalParams(pr.mean, pr.sd)
    for (let y = 0; y < years; y++) out[y] = Math.exp(mu + sigma * rng.normal()) - 1
    return out
  })
  return {
    inflation,
    returns,
    deathMonth,
    inheritances: drawInheritances(prep.inheritances, prep.baseYM, seed, path),
    propertyReturns,
  }
}

/** Per-path samples for one candidate. */
export type CandidateSamples = {
  claim: YM
  terminal: Float64Array
  minLiquid: Float64Array
  lifetimeSs: Float64Array
  pvSs: Float64Array
  lifetimeTax: Float64Array
  irmaa: Float64Array
  shortfall: Float64Array
  /** 1 when savings ran out while either spouse was alive. */
  depleted: Uint8Array
  bequestMet: Uint8Array
  lastYear: Uint16Array
}

function emptySamples(claim: YM, n: number): CandidateSamples {
  return {
    claim,
    terminal: new Float64Array(n),
    minLiquid: new Float64Array(n),
    lifetimeSs: new Float64Array(n),
    pvSs: new Float64Array(n),
    lifetimeTax: new Float64Array(n),
    irmaa: new Float64Array(n),
    shortfall: new Float64Array(n),
    depleted: new Uint8Array(n),
    bequestMet: new Uint8Array(n),
    lastYear: new Uint16Array(n),
  }
}

function record(s: CandidateSamples, i: number, r: PathSummary) {
  s.terminal[i] = r.terminalRealAfterTax
  s.minLiquid[i] = r.minLiquidReal
  s.lifetimeSs[i] = r.lifetimeSsReal
  s.pvSs[i] = r.pvSsReal
  s.lifetimeTax[i] = r.lifetimeTaxReal
  s.irmaa[i] = r.irmaaReal
  s.shortfall[i] = r.totalShortfallReal
  s.depleted[i] = r.depletedYear === null ? 0 : 1
  s.bequestMet[i] = r.bequestMet ? 1 : 0
  s.lastYear[i] = r.lastYear
}

export type ShardRequest = { seed: number; pathStart: number; pathEnd: number; candidates: YM[] }

/** Runs paths [pathStart, pathEnd) for every candidate. */
export function runShard(
  prep: Prepared,
  req: ShardRequest,
  progress?: (done: number, total: number) => void,
): CandidateSamples[] {
  const ctx = drawContext(prep)
  const n = req.pathEnd - req.pathStart
  const out = req.candidates.map((c) => emptySamples(c, n))
  for (let i = 0; i < n; i++) {
    const draws = drawPath(ctx, req.seed, req.pathStart + i)
    const cache = newPathCache(ctx.years)
    for (let c = 0; c < req.candidates.length; c++) {
      record(out[c]!, i, runPath(prep, req.candidates[c]!, draws, { recordRows: false, cache }).summary)
    }
    progress?.(i + 1, n)
  }
  return out
}

export function concatSamples(parts: CandidateSamples[][]): CandidateSamples[] {
  if (parts.length === 0) return []
  const nCand = parts[0]!.length
  const result: CandidateSamples[] = []
  for (let c = 0; c < nCand; c++) {
    const pieces = parts.map((p) => p[c]!)
    const n = pieces.reduce((a, p) => a + p.terminal.length, 0)
    const s = emptySamples(pieces[0]!.claim, n)
    let off = 0
    for (const p of pieces) {
      for (const k of [
        'terminal',
        'minLiquid',
        'lifetimeSs',
        'pvSs',
        'lifetimeTax',
        'irmaa',
        'shortfall',
        'depleted',
        'bequestMet',
        'lastYear',
      ] as const) {
        ;(s[k] as Float64Array).set(p[k] as Float64Array, off)
      }
      off += p.terminal.length
    }
    result.push(s)
  }
  return result
}

// ---------- detail for one candidate (fan chart, median path) ----------

export type DetailRequest = { seed: number; pathStart: number; pathEnd: number; claim: YM }

export type DetailShard = {
  /** Years simulated (index 0 = base year). */
  years: number
  /** Real liquid balance by [path * years + yearIndex]; NaN after both deaths. */
  liquid: Float32Array
  /** Real balance per account by [(path * years + yearIndex) * nAcc + account]. */
  byAccount: Float32Array
  /** Real after-tax terminal wealth per path (to pick the median path). */
  terminal: Float64Array
}

export function runDetailShard(
  prep: Prepared,
  req: DetailRequest,
  progress?: (done: number, total: number) => void,
): DetailShard {
  const ctx = drawContext(prep)
  const n = req.pathEnd - req.pathStart
  const years = ctx.years
  const nAcc = prep.accounts.length
  const liquid = new Float32Array(n * years).fill(Number.NaN)
  const byAccount = new Float32Array(n * years * nAcc).fill(Number.NaN)
  const terminal = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const r = runPath(prep, req.claim, drawPath(ctx, req.seed, req.pathStart + i), { recordRows: true })
    terminal[i] = r.summary.terminalRealAfterTax
    for (const row of r.rows!) {
      const yi = row.year - prep.baseYear
      liquid[i * years + yi] = row.liquid / row.price
      for (let a = 0; a < nAcc; a++) byAccount[(i * years + yi) * nAcc + a] = row.endBalances[a]! / row.price
    }
    progress?.(i + 1, n)
  }
  return { years, liquid, byAccount, terminal }
}

/** Full rows for one path (e.g. the median-terminal path). */
export function pathRows(prep: Prepared, seed: number, path: number, claim: YM, trace?: YearTrace): YearRow[] {
  return runPath(prep, claim, drawPath(drawContext(prep), seed, path), { recordRows: true, trace }).rows!
}

/** Percentiles of after-tax estate offered as single paths in the Console strip [FR-OUT-9]. */
export const PATH_PERCENTILES = [10, 25, 50, 75, 90] as const
export type PathPercentile = (typeof PATH_PERCENTILES)[number]

/** Index of the path at `pct` percent of the ranking by `terminal` (50 = the median, floor(n/2)). */
export function pathAtPercentile(terminal: Float64Array, pct: number): number {
  const n = terminal.length
  if (n === 0) return 0
  const order = Array.from(terminal.keys()).sort((a, b) => terminal[a]! - terminal[b]!)
  return order[Math.min(n - 1, Math.floor((pct / 100) * n))]!
}

/** What one path drew, to read its year rows in context [FR-OUT-9]. */
export type PathStory = {
  /** Death year and age in whole years per person; null when alive at the end of the projection. */
  deaths: ({ year: number; age: number } | null)[]
  /** First year an inheritance arrived, or null. */
  inheritanceYear: number | null
  firstShortfallYear: number | null
  /** Annualized real return on liquid savings (start-of-year balance weights, after fees). */
  realReturn: number
}

export type StoryPath = { rows: YearRow[]; story: PathStory }

/** Rows and draw summary for one path. */
export function pathWithStory(prep: Prepared, seed: number, path: number, claim: YM): StoryPath {
  const draws = drawPath(drawContext(prep), seed, path)
  const rows = runPath(prep, claim, draws, { recordRows: true }).rows!
  const lastYm = ym(prep.endYear, 12)
  const deaths = prep.people.map((p, i) => {
    const m = draws.deathMonth[i]!
    if (m > lastYm) return null
    const birth = ym(p.age.birth.year, p.age.birth.month)
    return { year: Math.floor(m / 12), age: Math.floor((m - birth) / 12) }
  })
  let growth = 1
  let start = prep.accounts.map((a) => a.balance)
  for (const r of rows) {
    const yi = r.year - prep.baseYear
    const total = start.reduce((x, v) => x + v, 0)
    if (total > 0) {
      let nominal = 0
      for (let i = 0; i < start.length; i++)
        nominal += (start[i]! / total) * (draws.returns[i]![yi]! - prep.accounts[i]!.fee)
      growth *= (1 + nominal) / (1 + draws.inflation[yi]!)
    }
    start = r.endBalances
  }
  return {
    rows,
    story: {
      deaths,
      inheritanceYear: rows.find((r) => (r.inheritances ?? 0) > 0)?.year ?? null,
      firstShortfallYear: rows.find((r) => r.shortfall > 0.5)?.year ?? null,
      realReturn: rows.length > 0 ? growth ** (1 / rows.length) - 1 : 0,
    },
  }
}
