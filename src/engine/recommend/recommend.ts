// Recommendation [FR-REC-2, FR-REC-3]: maximize median real after-tax terminal wealth among candidates that meet
// the success floor (and the bequest floor when a bequest target is set). If none qualifies, recommend the highest
// success probability and say so. The runner-up range shows every qualifying date within the tolerance.
import { formatAge, formatYM, type SsaAge, type YM } from '../core/dates.ts'
import { ownBenefitFactor } from '../ss/ownBenefit.ts'
import type { CandidateMetrics } from './metrics.ts'

export type ObjectiveSettings = {
  successFloor: number
  bequestFloor: number
  runnerUpTolerance: number
  bequestTarget: number
}

export type Recommendation = {
  best: CandidateMetrics
  /** True when the best candidate meets the floors; false means the fallback (highest success) was used. */
  floorsMet: boolean
  qualifying: YM[]
  runnerUp: YM[]
}

export function qualifies(m: CandidateMetrics, o: ObjectiveSettings): boolean {
  return m.successProb >= o.successFloor - 1e-12 && (o.bequestTarget <= 0 || m.bequestProb >= o.bequestFloor - 1e-12)
}

export function recommend(metrics: CandidateMetrics[], o: ObjectiveSettings): Recommendation | null {
  if (metrics.length === 0) return null
  const q = metrics.filter((m) => qualifies(m, o))
  if (q.length === 0) {
    const best = metrics.reduce((a, b) =>
      b.successProb > a.successProb || (b.successProb === a.successProb && b.terminal.p50 > a.terminal.p50) ? b : a,
    )
    return { best, floorsMet: false, qualifying: [], runnerUp: [] }
  }
  const best = q.reduce((a, b) => (b.terminal.p50 > a.terminal.p50 ? b : a))
  const cut = best.terminal.p50 - o.runnerUpTolerance * Math.abs(best.terminal.p50)
  const runnerUp = q.filter((m) => m.terminal.p50 >= cut).map((m) => m.claim)
  return { best, floorsMet: true, qualifying: q.map((m) => m.claim), runnerUp }
}

/**
 * Break-even age of a later claim versus an earlier one, comparing cumulative own benefits (real, before any
 * haircut or survivor effects). Returns months of SSA age, or null if the later claim never catches up.
 */
export function breakEvenAge(age: SsaAge, pia: number, earlier: YM, later: YM): number | null {
  if (later <= earlier) return null
  const be = pia * ownBenefitFactor(earlier, age)
  const bl = pia * ownBenefitFactor(later, age)
  if (bl <= be) return null
  const m = (bl * later - be * earlier) / (bl - be)
  return Math.ceil(m) - age.attainBase
}

export function explain(
  rec: Recommendation,
  metrics: CandidateMetrics[],
  age: SsaAge,
  reference: { fra: YM },
  money: (x: number) => string,
): string[] {
  const b = rec.best
  const at = (c: YM) => `${formatAge(age.ageAt(c))} (${formatYM(c)})`
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const lines: string[] = []
  if (!rec.floorsMet) {
    lines.push(
      `No claiming date meets the success floor. Claiming at ${at(b.claim)} gives the highest probability of never running out of savings: ${pct(b.successProb)}.`,
    )
    return lines
  }
  const fra = metrics.find((m) => m.claim === reference.fra)
  let line = `Claiming at ${at(b.claim)} maximizes median after-tax terminal wealth (${money(b.terminal.p50)}, in today's dollars)`
  if (fra && fra.claim !== b.claim) {
    const d = b.terminal.p50 - fra.terminal.p50
    line += `: ${d >= 0 ? '+' : '−'}${money(Math.abs(d))} vs. claiming at full retirement age`
  }
  lines.push(`${line}.`)
  const survivor = ownBenefitFactor(b.claim, age) / ownBenefitFactor(reference.fra, age) - 1
  if (Math.abs(survivor) > 0.005) {
    lines.push(
      `Its monthly benefit, and the survivor benefit after the first death, is ${pct(Math.abs(survivor))} ${survivor > 0 ? 'higher' : 'lower'} than at full retirement age.`,
    )
  }
  lines.push(
    `Success probability ${pct(b.successProb)}${fra && fra.claim !== b.claim ? ` (vs. ${pct(fra.successProb)} at full retirement age)` : ''}; 10th-percentile terminal wealth ${money(b.terminal.p10)}.`,
  )
  if (rec.runnerUp.length > 1) {
    const sorted = [...rec.runnerUp].sort((x, y) => x - y)
    lines.push(
      `Every date from ${at(sorted[0]!)} to ${at(sorted.at(-1)!)} is within the runner-up tolerance — the optimum is flat.`,
    )
  }
  return lines
}

/** Sentence comparing the recommendation with and without expected inheritances [FR-INH-6]. */
export function inheritanceNote(
  withInh: Recommendation | null,
  without: Recommendation | null,
  age: SsaAge,
): string | null {
  if (!withInh || !without) return null
  const a = (c: YM) => `${formatAge(age.ageAt(c))} (${formatYM(c)})`
  if (withInh.best.claim === without.best.claim)
    return `Without the expected inheritances the recommendation is the same: ${a(without.best.claim)}.`
  return `Without the expected inheritances the recommendation would be ${a(without.best.claim)}${without.floorsMet ? '' : ' (no date meets the success floor)'}.`
}
