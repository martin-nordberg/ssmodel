import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPeriod } from '@/lib/format.ts'
import { cn } from '@/lib/utils'
import { TipLabel } from './TipLabel.tsx'

// A report's period [FR-RPT-2, base version]: a year, a quarter or a month, as "2026", "2026-Q3" or "2026-11", with
// previous and next buttons.

export type PeriodKind = 'year' | 'quarter' | 'month'

export function periodKind(period: string): PeriodKind {
  return period.includes('-Q') ? 'quarter' : period.length === 7 ? 'month' : 'year'
}

/** The period's parts, for labels. */
export function periodParts(period: string): { year: number; quarter?: number; month?: number } {
  const year = Number(period.slice(0, 4))
  if (period.includes('-Q')) return { year, quarter: Number(period.slice(6)) }
  if (period.length === 7) return { year, month: Number(period.slice(5)) }
  return { year }
}

export function periodLabel(period: string): string {
  return formatPeriod(periodParts(period))
}

const pad = (n: number) => String(n).padStart(2, '0')

function fromParts(kind: PeriodKind, year: number, index: number): string {
  if (kind === 'quarter') return `${year}-Q${index}`
  if (kind === 'month') return `${year}-${pad(index)}`
  return String(year)
}

/** The period `steps` before or after. */
export function shiftPeriod(period: string, steps: number): string {
  const kind = periodKind(period)
  const p = periodParts(period)
  if (kind === 'year') return String(p.year + steps)
  const per = kind === 'quarter' ? 4 : 12
  const index = (kind === 'quarter' ? p.quarter! : p.month!) - 1 + steps
  return fromParts(kind, p.year + Math.floor(index / per), (((index % per) + per) % per) + 1)
}

/** The same point in time as another kind of period: 2026-11 → 2026-Q4 → 2026. */
export function convertPeriod(period: string, kind: PeriodKind): string {
  const p = periodParts(period)
  const month = p.month ?? (p.quarter ? p.quarter * 3 : 12)
  if (kind === 'year') return String(p.year)
  if (kind === 'quarter') return `${p.year}-Q${Math.ceil(month / 3)}`
  return `${p.year}-${pad(month)}`
}

export function PeriodPicker({
  period,
  onChange,
  label,
  tip,
}: {
  period: string
  onChange: (period: string) => void
  label: string
  tip: string
}) {
  const kind = periodKind(period)
  const p = periodParts(period)
  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 12 }, (_, i) => thisYear + 1 - i)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TipLabel htmlFor="period-year" tip={tip}>
        {label}
      </TipLabel>
      <nav aria-label="Period length" className="flex rounded-md border p-0.5">
        {(['year', 'quarter', 'month'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => onChange(convertPeriod(period, k))}
            className={cn(
              'rounded px-2 py-0.5 text-sm capitalize',
              k === kind ? 'bg-accent font-medium' : 'text-muted-foreground',
            )}
          >
            {k}
          </button>
        ))}
      </nav>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Previous period"
        onClick={() => onChange(shiftPeriod(period, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <select
        id="period-year"
        aria-label="Year"
        className="h-8 rounded-md border bg-background px-2 text-sm"
        value={p.year}
        onChange={(e) => onChange(fromParts(kind, Number(e.target.value), p.quarter ?? p.month ?? 1))}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      {kind !== 'year' && (
        <select
          aria-label={kind === 'quarter' ? 'Quarter' : 'Month'}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={kind === 'quarter' ? p.quarter : p.month}
          onChange={(e) => onChange(fromParts(kind, p.year, Number(e.target.value)))}
        >
          {Array.from({ length: kind === 'quarter' ? 4 : 12 }, (_, i) => i + 1).map((i) => (
            <option key={i} value={i}>
              {kind === 'quarter' ? `Q${i}` : formatPeriod({ year: p.year, month: i }).slice(0, 3)}
            </option>
          ))}
        </select>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Next period"
        onClick={() => onChange(shiftPeriod(period, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
