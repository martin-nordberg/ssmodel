// IRMAA tiers [FR-TAX-5]: Part B and D surcharges set by MAGI from two years earlier. A tier applies when MAGI is
// more than its threshold. https://www.medicare.gov/basics/costs/medicare-costs
import type { FilingStatus, MedicareParams } from '../rules/tables.ts'

export function irmaaTier(magi: number, status: FilingStatus, p: MedicareParams): number {
  let tier = 0
  for (const t of p.thresholds[status]) if (magi > t) tier++
  return tier
}

/** Monthly Part B premium (standard plus surcharge) and Part D surcharge for a tier. */
export function monthlyPremiums(tier: number, p: MedicareParams): { partB: number; partDSurcharge: number } {
  return { partB: p.partBMonthlyTotal[tier]!, partDSurcharge: p.partDMonthlyAdd[tier]! }
}

/** MAGI headroom before crossing into the tier above `tier` (Infinity at the top). */
export function irmaaHeadroom(magi: number, maxTier: number, status: FilingStatus, p: MedicareParams): number {
  const t = p.thresholds[status][maxTier]
  return t === undefined ? Number.POSITIVE_INFINITY : t - magi
}
