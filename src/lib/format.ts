// One formatting module for the whole app [FR-UI-30]: money (ledger cents and planning dollars), percentages and
// dates. Negative amounts look the same everywhere: a minus sign before the dollar sign, "−$1,234.56".

const minus = '−'

const centsFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const wholeFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function signed(negative: boolean, body: string): string {
  return negative ? `${minus}$${body}` : `$${body}`
}

export interface MoneyOptions {
  /** Show "+" before positive amounts (changes, variances). */
  plus?: boolean
}

/** Ledger money, exact to the cent: 123456 → "$1,234.56"; −5 → "−$0.05". */
export function formatCents(cents: number, opts: MoneyOptions = {}): string {
  if (!Number.isFinite(cents)) return ''
  const text = signed(cents < 0, centsFormatter.format(Math.abs(cents) / 100))
  return opts.plus && cents > 0 ? `+${text}` : text
}

export interface DollarOptions extends MoneyOptions {
  /** Abbreviate large amounts: "$12k", "$1.23M" (the display setting "compact", ssmodel FR-UI-16). */
  compact?: boolean
  /** Show cents. */
  cents?: boolean
}

/** Planning money in float dollars, to the dollar unless `cents`: 1234.4 → "$1,234"; −2.5e6 compact → "−$2.50M". */
export function formatDollars(dollars: number | undefined, opts: DollarOptions = {}): string {
  if (dollars === undefined || !Number.isFinite(dollars)) return ''
  const abs = Math.abs(dollars)
  let body: string
  if (opts.compact && abs >= 1e6) body = `${(abs / 1e6).toFixed(2)}M`
  else if (opts.compact && abs >= 1e4) body = `${(abs / 1e3).toFixed(0)}k`
  else if (opts.cents) body = centsFormatter.format(abs)
  else body = wholeFormatter.format(Math.round(abs))
  const zero = body === '0' || body === '0.00'
  const text = signed(dollars < 0 && !zero, body)
  return opts.plus && dollars > 0 && !zero ? `+${text}` : text
}

/** A fraction as a percentage, trailing zeros trimmed: 0.0525 → "5.25%", 0.05 → "5%", −0.1 → "−10%". */
export function formatPercent(fraction: number | undefined, digits = 2): string {
  if (fraction === undefined || !Number.isFinite(fraction)) return ''
  const fixed = (Math.abs(fraction) * 100).toFixed(digits)
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
  return `${fraction < 0 && Number(trimmed) !== 0 ? minus : ''}${trimmed}%`
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * An ISO date (YYYY-MM-DD) for display. `short`: "Nov 23, 2026"; `numeric`: "11/23/2026"; `iso`: as is. Dates are
 * calendar dates with no time zone, so no Date object is involved.
 */
export function formatDate(iso: string, style: 'short' | 'numeric' | 'iso' = 'short'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m || style === 'iso') return iso
  const [, y, mo, d] = m as unknown as [string, string, string, string]
  if (style === 'numeric') return `${Number(mo)}/${Number(d)}/${y}`
  return `${monthNames[Number(mo) - 1]} ${Number(d)}, ${y}`
}

/** A reporting period's label: "2026", "Q3 2026", "Nov 2026". */
export function formatPeriod(period: { year: number; quarter?: number; month?: number }): string {
  if (period.month !== undefined) return `${monthNames[period.month - 1]} ${period.year}`
  if (period.quarter !== undefined) return `Q${period.quarter} ${period.year}`
  return String(period.year)
}
