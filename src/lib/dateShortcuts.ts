// Date entry for the register [FR-UI-31]: keyboard shortcuts on a date field, and lenient parsing of what's typed.
// Dates are ISO calendar dates (YYYY-MM-DD) with no time zone.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fromIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return toIso(d) === iso ? d : null
}

/** Today's date in local time. */
export function todayIso(now = new Date()): string {
  return toIso(now)
}

/** Adds days (or months, clamping the day to the month's end) to an ISO date. */
export function addToIso(iso: string, days: number, months = 0): string {
  const d = fromIso(iso)
  if (!d) return iso
  if (months !== 0) {
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + months)
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  }
  d.setDate(d.getDate() + days)
  return toIso(d)
}

/**
 * The date a shortcut key gives, or null if the key isn't a shortcut:
 * `t` today; `+` or `=` next day; `-` previous day; PageUp/PageDown previous/next month; `m`/`h` first/last day of
 * the month; `y`/`r` first/last day of the year.
 */
export function dateShortcut(key: string, current: string, today: string): string | null {
  const base = fromIso(current) ? current : today
  switch (key) {
    case 't':
    case 'T':
      return today
    case '+':
    case '=':
      return addToIso(base, 1)
    case '-':
      return addToIso(base, -1)
    case 'PageUp':
      return addToIso(base, 0, -1)
    case 'PageDown':
      return addToIso(base, 0, 1)
    case 'm':
      return `${base.slice(0, 8)}01`
    case 'h': {
      const d = fromIso(base)!
      return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    }
    case 'y':
      return `${base.slice(0, 4)}-01-01`
    case 'r':
      return `${base.slice(0, 4)}-12-31`
    default:
      return null
  }
}

/**
 * A typed date as ISO, or null: "2026-11-23", "11/23/2026", "11/23/26", "11/23" (this year), "11-23", "23" (this
 * month).
 */
export function parseDateInput(text: string, today: string): string | null {
  const s = text.trim()
  if (fromIso(s)) return s
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  let m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/.exec(s)
  if (m) {
    const year = m[3] === undefined ? ty : m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const iso = `${year}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`
    return fromIso(iso) ? iso : null
  }
  m = /^(\d{1,2})$/.exec(s)
  if (m) {
    const iso = `${ty}-${pad(tm)}-${pad(Number(m[1]))}`
    return fromIso(iso) ? iso : null
  }
  return null
}
