// Future inheritances [§3.9, FR-INH-1..5]: timing and receipt draws, and the amount on receipt.
import { parseYM, type YM, ym } from '../core/dates.ts'
import type { EngineInheritance } from '../model/prepare.ts'
import { monthsUntilDeath } from './mortality.ts'
import { createRng, Stream } from './rng.ts'

export type InheritanceDraw = { month: YM; received: boolean }

/** Stream id for inheritance i (distinct from the other named streams). */
const streamFor = (i: number) => Stream.inheritance + 16 * (i + 1)

/**
 * Draws when each inheritance arrives and whether it arrives at all. `u` values come from the path's own stream,
 * so draws are identical across claiming candidates. Deterministic runs use the median timing and include an
 * inheritance when its probability is at least 50%.
 */
export function drawInheritances(
  list: EngineInheritance[],
  baseYM: YM,
  seed: number,
  path: number | null,
): InheritanceDraw[] {
  return list.map((h, i) => {
    const rng = path === null ? null : createRng(seed, path, streamFor(i))
    const uTime = rng ? rng.next() : 0.5
    const uRecv = rng ? rng.next() : 0.5
    let month: YM
    if (h.timing.mode === 'fixed' && h.timing.date) month = parseYM(h.timing.date)
    else if (h.timing.mode === 'window' && h.timing.from && h.timing.to) {
      const a = parseYM(h.timing.from)
      const b = parseYM(h.timing.to)
      month = a + Math.floor(uTime * (b - a + 1))
    } else {
      const [y, m] = h.decedentBirthDate.split('-').map(Number)
      const ageMonths = baseYM - ym(y!, m!)
      month = baseYM + monthsUntilDeath(h.decedentSex, ageMonths, h.timing.ageOffset, uTime)
    }
    const received = path === null ? h.probability >= 0.5 : uRecv < h.probability
    return { month: Math.max(baseYM, month), received }
  })
}

/**
 * Real (base-date dollars) value of an amount after `years` of real growth g, less an annual spend-down S taken
 * from it (e.g. long-term care), floored at zero.
 */
export function grownAmount(amount: number, g: number, spendDown: number, years: number): number {
  if (years <= 0) return amount
  const f = (1 + g) ** years
  const spent = g === 0 ? spendDown * years : (spendDown * (f - 1)) / g
  return Math.max(0, amount * f - spent)
}
