// Home and inherited real estate [FR-ACC-7, FR-INH-7]. A property appreciates on its own random draw, may be sold
// on a planned date or as a backstop when liquid savings fall below a floor, and produces carrying costs and
// optional rent. Sales happen at the start of the year: the gain over basis (after the §121 exclusion for a primary
// residence, IRC 121; $500k MFJ / $250k single) is a long-term capital gain, and net proceeds go to the taxable
// account. With a replacement cost (downsizing), the property continues as the cheaper home.
import type { FilingStatus } from '../rules/tables.ts'

export type SaleMode = 'none' | 'planned' | 'backstop'

export type EngineProperty = {
  label: string
  primaryResidence: boolean
  /** Label of the mortgage expense that stops when this home is sold. */
  mortgageLabel: string | null
  /** Value on the base date (base-date dollars); for inherited property, its value when received. */
  value: number
  /** Cost basis (home only; inherited property is stepped up on receipt). */
  basis: number
  mean: number
  sd: number
  /** Annual carrying costs and rent in base-date dollars, inflation-indexed. */
  carrying: number
  rent: number
  sale: { mode: SaleMode; month: number | null; floor: number; costPct: number; replacement: number }
  /** Index of the inheritance that delivers it, or null for the home owned today. */
  inheritance: number | null
  sellOnReceipt: boolean
}

export function section121Exclusion(status: FilingStatus): number {
  return status === 'mfj' ? 500_000 : 250_000
}

export type SaleResult = { netProceeds: number; gain: number; newValue: number; newBasis: number; stillOwned: boolean }

/** Sells at `value` (nominal); `replacement` is the nominal cost of a replacement home (0 = none). */
export function sellProperty(
  p: EngineProperty,
  value: number,
  basis: number,
  replacement: number,
  status: FilingStatus,
): SaleResult {
  const net = value * (1 - p.sale.costPct)
  const exclusion = p.primaryResidence ? section121Exclusion(status) : 0
  const gain = Math.max(0, net - basis - exclusion)
  if (replacement > 0)
    return { netProceeds: net - replacement, gain, newValue: replacement, newBasis: replacement, stillOwned: true }
  return { netProceeds: net, gain, newValue: 0, newBasis: 0, stillOwned: false }
}
