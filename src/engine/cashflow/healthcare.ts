// Healthcare costs per person-year [FR-EXP-3]: COBRA before Medicare (assumed to last until 65), then Medicare
// Part B and D with IRMAA, Medigap and out-of-pocket costs. Inputs in base-date dollars grow with medical inflation.
import type { MedicareParams } from '../rules/tables.ts'
import { monthlyPremiums } from '../tax/irmaa.ts'

export type HealthcareInput = {
  /** Months in the year alive and under 65 with COBRA in force. */
  cobraMonths: number
  /** Months in the year alive and under 65 (out-of-pocket applies to all of them). */
  pre65Months: number
  /** Months in the year alive and on Medicare. */
  medicareMonths: number
  irmaaTier: number
  medicare: MedicareParams
  /** Medical price level relative to the base date (base-date dollars -> nominal). */
  medicalFactor: number
  pre65: { cobraMonthly: number; outOfPocket: number }
  medicareCosts: { medigapAnnual: number; outOfPocket: number }
}

export type HealthcareCost = {
  cobra: number
  partBD: number
  irmaaSurcharge: number
  medigap: number
  outOfPocket: number
  total: number
  /** Costs an HSA may pay tax-free: Part B/D premiums and out-of-pocket (not Medigap, not COBRA here). */
  hsaQualified: number
}

export function healthcareCost(i: HealthcareInput): HealthcareCost {
  const f = i.medicalFactor
  const cobra = i.cobraMonths * i.pre65.cobraMonthly * f
  const prem = monthlyPremiums(i.irmaaTier, i.medicare)
  const base = monthlyPremiums(0, i.medicare)
  const partBD = i.medicareMonths * (prem.partB + i.medicare.partDBaseMonthly + prem.partDSurcharge)
  const irmaaSurcharge = i.medicareMonths * (prem.partB - base.partB + prem.partDSurcharge)
  const medigap = (i.medicareMonths / 12) * i.medicareCosts.medigapAnnual * f
  const outOfPocket =
    ((i.pre65Months / 12) * i.pre65.outOfPocket + (i.medicareMonths / 12) * i.medicareCosts.outOfPocket) * f
  return {
    cobra,
    partBD,
    irmaaSurcharge,
    medigap,
    outOfPocket,
    total: cobra + partBD + medigap + outOfPocket,
    hsaQualified: partBD + outOfPocket,
  }
}
