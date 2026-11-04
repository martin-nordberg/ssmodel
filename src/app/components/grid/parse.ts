// Input parsing for grid cells [FR-UI-4]: currency ($1,234 / 1.2k / 1.2M), percentages (3.5%), dates
// (2032-01 / Jan 2032 / 1/2032 / 2032-01-15).

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function parseNumber(text: string): Parsed<number> {
  const t = text
    .trim()
    .replace(/[$,\s]/g, '')
    .toLowerCase()
  if (t === '') return { ok: false, error: 'required' }
  const m = /^(-?\d*\.?\d+)([km]?)$/.exec(t)
  if (!m) return { ok: false, error: `not a number: ${text}` }
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1
  return { ok: true, value: Number(m[1]) * mult }
}

export function parseCurrency(text: string): Parsed<number> {
  const neg = /^\(.*\)$/.test(text.trim())
  const r = parseNumber(text.replace(/[()]/g, ''))
  return r.ok && neg ? { ok: true, value: -r.value } : r
}

/** "3.5%" -> 0.035. Without a % sign, values of 1 or more are read as percents, smaller ones as fractions. */
export function parsePercent(text: string): Parsed<number> {
  const t = text.trim()
  const hasPct = t.endsWith('%')
  const r = parseNumber(hasPct ? t.slice(0, -1) : t)
  if (!r.ok) return r
  return { ok: true, value: hasPct || Math.abs(r.value) >= 1 ? r.value / 100 : r.value }
}

export function parseInteger(text: string): Parsed<number> {
  const r = parseNumber(text)
  if (!r.ok) return r
  return Number.isInteger(r.value) ? r : { ok: false, error: `not a whole number: ${text}` }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function parseYearMonth(text: string): Parsed<string> {
  const t = text.trim().toLowerCase()
  let y: number | undefined
  let m: number | undefined
  const r = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(t)
  if (r) {
    y = Number(r[1])
    m = Number(r[2])
  }
  if (y === undefined) {
    const mm = /^(\d{1,2})\/(\d{4})$/.exec(t)
    if (mm) {
      m = Number(mm[1])
      y = Number(mm[2])
    }
  }
  if (y === undefined) {
    const mn = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(t)
    if (mn && MONTHS.includes(mn[1]!)) {
      m = MONTHS.indexOf(mn[1]!) + 1
      y = Number(mn[2])
    }
  }
  if (y === undefined || m === undefined || m < 1 || m > 12) return { ok: false, error: `not a month: ${text}` }
  return { ok: true, value: `${y}-${pad(m)}` }
}

export function parseDate(text: string): Parsed<string> {
  const t = text.trim()
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  let y: number
  let m: number
  let d: number
  if (r) {
    y = Number(r[1])
    m = Number(r[2])
    d = Number(r[3])
  } else {
    r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
    if (!r) return { ok: false, error: `not a date: ${text}` }
    m = Number(r[1])
    d = Number(r[2])
    y = Number(r[3])
  }
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { ok: false, error: `not a date: ${text}` }
  return { ok: true, value: `${y}-${pad(m)}-${pad(d)}` }
}

export function formatCurrency(v: number | undefined, compact = false): string {
  if (v === undefined || !Number.isFinite(v)) return ''
  if (compact && Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (compact && Math.abs(v) >= 1e4) return `$${(v / 1e3).toFixed(0)}k`
  return `$${Math.round(v).toLocaleString('en-US')}`
}

export function formatPercent(v: number | undefined, digits = 2): string {
  if (v === undefined || !Number.isFinite(v)) return ''
  const t = (v * 100).toFixed(digits)
  return `${t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t}%`
}

/** Tab-separated rows/columns as copied from a spreadsheet. */
export function parseTsv(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
  return lines.map((l) => l.split('\t'))
}

export function toTsv(cells: string[][]): string {
  return cells.map((r) => r.join('\t')).join('\n')
}
