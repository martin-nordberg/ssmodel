// Year trace for "explain a number" [FR-UI-14]. When runPath is given a trace year, it copies that year's inputs
// and intermediate results here. explain.ts turns them into breakdowns with the same named engine functions.
import type { HealthcareCost } from '../cashflow/healthcare.ts'
import type { YM } from '../core/dates.ts'
import type { FederalParams, FilingStatus } from '../rules/tables.ts'
import type { FederalTaxInput, FederalTaxResult } from '../tax/federal.ts'
import type { ItemizedInput } from '../tax/itemized.ts'
import type { ScParams, ScTaxResult } from '../tax/sc.ts'

export type Amount = { label: string; amount: number }

export type SsPersonTrace = {
  pia: number
  /** Monthly benefit actually paid in each month (after the earnings test), before the haircut. */
  monthly: number[]
  /** Spousal excess per month (Spouse only). */
  excess: number[]
  claim: YM
}

export type ConversionTrace = {
  owner: 0 | 1
  amount: number
  tax: number
  fromCash: number
  sold: number
  gain: number
}

export type TraceData = {
  year: number
  price: number
  status: FilingStatus
  accounts: { label: string; kind: string }[]
  ss: { people: [SsPersonTrace, SsPersonTrace]; haircut: number[]; monthsWithheld: number; total: [number, number] }
  earnings: [{ wages: number; selfEmployment: number }, { wages: number; selfEmployment: number }]
  otherOrdinary: number
  otherTaxFree: number
  dividends: number
  interest: number
  propertyIncome: number
  inheritances: number
  required: number[]
  rmd: number
  inheritedDistributions: number
  expenses: { items: Amount[]; housing: Amount[]; hsaContributions: number; saleShortfall: number; total: number }
  health: {
    people: [HealthcareCost | null, HealthcareCost | null]
    irmaaTier: number
    lookbackYear: number
    lookbackMagi: number
    hsaMedical: number
    total: number
  }
  spending: number
  inflows: Amount[]
  solver: { withdrawals: number[]; surplus: number; shortfall: number; tax: number; strategy: string }
  bracketAware: { account: number; amount: number; tax: number }[]
  conversions: ConversionTrace[]
  withdrawals: number[]
  tax: {
    fedInput: FederalTaxInput
    fedParams: FederalParams
    extraOrdinary: number
    extraLtcg: number
    itemizable: ItemizedInput
    fed: FederalTaxResult
    sc: { agi: number; tss: number; ltcg: number; retirement: [number, number]; is65: [boolean, boolean] }
    scParams: ScParams
    scResult: ScTaxResult
    total: number
  }
  balances: { start: number[]; beforeReturns: number[]; end: number[] }
}

/** Pass to runPath; `data` is filled for `year` when that year is simulated. */
export type YearTrace = { year: number; data?: TraceData }
