// Expense and income items with monthly proration [FR-EXP-1, FR-EXP-2, FR-INC-2]. Amounts are annual, in
// base-date dollars unless indexing is 'none' (nominal, e.g. a mortgage payment).
import { parseYM, type YM, ym } from '../core/dates.ts'

export type Indexing = 'inflation' | 'none' | 'medical' | number

/** Number of months of `year` within [start, end] (end inclusive; open-ended when undefined). */
export function monthsActive(year: number, start: YM, end?: YM): number {
  const lo = Math.max(start, ym(year, 1))
  const hi = Math.min(end ?? Number.POSITIVE_INFINITY, ym(year, 12))
  return Math.max(0, hi - lo + 1)
}

export type IndexContext = {
  baseYear: number
  /** Price level for the year relative to the base date. */
  price: number
  /** Medical price level for the year relative to the base date. */
  medical: number
}

export function indexFactor(indexing: Indexing, year: number, ctx: IndexContext): number {
  if (indexing === 'inflation') return ctx.price
  if (indexing === 'medical') return ctx.medical
  if (indexing === 'none') return 1
  return (1 + indexing) ** (year - ctx.baseYear)
}

export type ExpenseItem = {
  label: string
  /** Pre-parsed start/end months (optional; parsed on the fly when absent). */
  startYM?: YM
  endYM?: YM
  annual: number
  start: string
  end?: string
  indexing: Indexing
  oneTime: boolean
  perPerson: boolean
}

export type ExpenseContext = IndexContext & {
  /** First month the household is a single survivor (null while both are alive). */
  survivorFrom: YM | null
  survivorFraction: number
  /** Global spending scale lever. */
  scale: number
  /** Per-item early end, e.g. the mortgage stops when the home is sold. */
  endOverride?: Map<string, YM>
}

export function expenseForYear(item: ExpenseItem, year: number, ctx: ExpenseContext): number {
  const start = item.startYM ?? parseYM(item.start)
  const f = indexFactor(item.indexing, year, ctx) * ctx.scale
  const override = ctx.endOverride?.get(item.label)
  if (item.oneTime) {
    if (Math.floor(start / 12) !== year) return 0
    if (override !== undefined && start > override) return 0
    const survivorAdj =
      item.perPerson && ctx.survivorFrom !== null && start >= ctx.survivorFrom ? ctx.survivorFraction : 1
    return item.annual * f * survivorAdj
  }
  let end = item.endYM ?? (item.end ? parseYM(item.end) : undefined)
  if (override !== undefined) end = end === undefined ? override : Math.min(end, override)
  const months = monthsActive(year, start, end)
  if (months === 0) return 0
  let survivorMonths = 0
  if (item.perPerson && ctx.survivorFrom !== null)
    survivorMonths = monthsActive(year, Math.max(start, ctx.survivorFrom), end)
  const effectiveMonths = months - survivorMonths + survivorMonths * ctx.survivorFraction
  return (item.annual * f * effectiveMonths) / 12
}

export type IncomeStream = {
  label: string
  owner: 'primary' | 'spouse' | 'joint'
  annual: number
  start: string
  end?: string
  indexing: Indexing
  tax: 'ordinary' | 'tax_free'
}

/** Income for the year, stopping after the owner's death month (joint streams continue). */
export function incomeForYear(s: IncomeStream, year: number, ctx: IndexContext, ownerDeath: YM | null): number {
  const start = parseYM(s.start)
  let end = s.end ? parseYM(s.end) : undefined
  if (s.owner !== 'joint' && ownerDeath !== null) end = end === undefined ? ownerDeath : Math.min(end, ownerDeath)
  return (s.annual * indexFactor(s.indexing, year, ctx) * monthsActive(year, start, end)) / 12
}

/** Projected earnings for a year, prorated to the months alive. */
export function earningsForYear(
  rows: { year: number; wages: number; selfEmployment: number }[],
  year: number,
  death: YM | null,
): { wages: number; selfEmployment: number } {
  const row = rows.find((r) => r.year === year)
  if (!row) return { wages: 0, selfEmployment: 0 }
  const months = death === null ? 12 : monthsActive(year, ym(year, 1), death)
  return { wages: (row.wages * months) / 12, selfEmployment: (row.selfEmployment * months) / 12 }
}
