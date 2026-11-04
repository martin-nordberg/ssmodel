// Annuity income [FR-INC-3]: monthly payments from the start month, growing by a fixed annual COLA; after the
// owner's death the survivor percentage continues while the spouse lives. Qualified annuities are fully taxable;
// for non-qualified ones the exclusion-ratio share is tax-free until the investment (basis) is recovered.
import { parseYM, type YM, ym } from '../core/dates.ts'

export type EngineAnnuity = {
  label: string
  owner: 0 | 1
  monthly: number
  start: YM
  cola: number
  survivorPercent: number
  qualified: boolean
  exclusionRatio: number
  basis: number | null
}

export function toEngineAnnuity(a: {
  label: string
  owner: 'primary' | 'spouse'
  monthly: number
  start: string
  colaPercent: number
  survivorPercent: number
  qualified: boolean
  exclusionRatio: number
  basis?: number
}): EngineAnnuity {
  return {
    label: a.label,
    owner: a.owner === 'spouse' ? 1 : 0,
    monthly: a.monthly,
    start: parseYM(a.start),
    cola: a.colaPercent,
    survivorPercent: a.survivorPercent,
    qualified: a.qualified,
    exclusionRatio: a.exclusionRatio,
    basis: a.basis ?? null,
  }
}

/**
 * Payments for a year. `recovered` is the basis excluded so far (updated in place by the caller via the result).
 * Returns the taxable and tax-free parts.
 */
export function annuityForYear(
  a: EngineAnnuity,
  year: number,
  ownerDeath: YM,
  otherDeath: YM,
  recovered: number,
): { taxable: number; taxFree: number; recovered: number } {
  let total = 0
  for (let k = 0; k < 12; k++) {
    const m = ym(year, k + 1)
    if (m < a.start) continue
    const growth = (1 + a.cola) ** Math.floor((m - a.start) / 12)
    if (m <= ownerDeath) total += a.monthly * growth
    else if (m <= otherDeath) total += a.monthly * growth * a.survivorPercent
  }
  if (a.qualified || total === 0) return { taxable: total, taxFree: 0, recovered }
  let free = total * a.exclusionRatio
  if (a.basis !== null) free = Math.min(free, Math.max(0, a.basis - recovered))
  return { taxable: total - free, taxFree: free, recovered: recovered + free }
}
