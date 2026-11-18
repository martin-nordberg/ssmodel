import { useMemo } from 'react'
import { DataGrid, type GridColumn } from '@/app/components/grid/DataGrid.tsx'
import { ACTIVE_TOGGLE } from '@/app/components/toggleStyle.ts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PATH_PERCENTILES, type PathPercentile } from '@/engine/sim/monteCarlo.ts'
import type { YearRow } from '@/engine/sim/path.ts'
import { useSettings } from '@/state/settingsStore.ts'
import { useUi } from '@/state/uiStore.ts'
import type { PercentilePath } from '@/worker/monteCarloClient.ts'
import { money as compactMoney } from './KpiTiles.tsx'

const pctName = (p: PathPercentile) => (p === 50 ? 'Median' : `${p}th`)
/** "Median path", "10th-percentile path": one simulated path ranked by after-tax estate [FR-OUT-9]. */
export const pathLabel = (p: PathPercentile) => (p === 50 ? 'Median path' : `${p}th-percentile path`)

/** One line on what the shown path drew, so its rows are read in context. */
export function storyText(p: PercentilePath, names: [string, string]): string {
  const s = p.story
  const r = s.realReturn * 100
  return [
    `After-tax estate ${compactMoney(p.estate)} (today's $)`,
    ...s.deaths.map((d, i) => (d ? `${names[i]} dies ${d.year} at ${d.age}` : `${names[i]} alive at the end`)),
    ...(s.inheritanceYear !== null ? [`inheritance ${s.inheritanceYear}`] : []),
    `real return ${r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}%/yr`,
    s.firstShortfallYear !== null ? `first shortfall ${s.firstShortfallYear}` : 'no shortfall',
  ].join(' · ')
}

/** Compact year-by-year strip for the date shown [§8.2]; hovering a row highlights that year in charts. */
export function DetailStrip({
  rows,
  label,
  path,
  names,
  onPct,
  onExplain,
}: {
  rows: YearRow[]
  label: string
  /** The percentile path shown, or null for the deterministic preview. */
  path?: PercentilePath | null
  names?: [string, string]
  onPct?: (p: PathPercentile) => void
  /** Click (or Enter) on a value: explain it [FR-UI-14]. */
  onExplain?: (year: number, columnId: string) => void
}) {
  const real = useSettings((s) => s.dollars) === 'real'
  const hoverYear = useUi((s) => s.hoverYear)
  const columns = useMemo<GridColumn<YearRow>[]>(() => {
    const money = (id: string, header: string, f: (r: YearRow) => number): GridColumn<YearRow> => ({
      id,
      header,
      type: 'currency',
      width: 96,
      readOnly: true,
      get: (r) => (real ? f(r) / r.price : f(r)),
      set: (r) => r,
    })
    return [
      {
        id: 'year',
        header: 'Year',
        type: 'text',
        width: 52,
        readOnly: true,
        get: (r) => String(r.year),
        set: (r) => r,
      },
      {
        id: 'ages',
        header: 'Ages',
        type: 'text',
        width: 56,
        readOnly: true,
        get: (r) => r.ages.map((a, i) => (r.alive[i] ? a : '—')).join('/'),
        set: (r) => r,
      },
      money('ss', 'Social Security', (r) => r.ss[0] + r.ss[1]),
      money('spend', 'Spending', (r) => r.expenses + r.healthcare),
      money('wd', 'Withdrawals', (r) => r.withdrawals.reduce((a, b) => a + b, 0) + r.rmd + r.inheritedDistributions),
      money('tax', 'Taxes', (r) => r.totalTax),
      money('liquid', 'Liquid', (r) => r.liquid),
      money('short', 'Shortfall', (r) => r.shortfall),
    ]
  }, [real])
  return (
    <section aria-label="Year-by-year" className="grid min-h-0 gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-xs">
          {label} {hoverYear !== null && <span className="text-muted-foreground">— {hoverYear}</span>}
        </h3>
        {path && onPct && (
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={String(path.pct)}
            onValueChange={(v) => v && onPct(Number(v) as PathPercentile)}
            aria-label="Path by after-tax estate percentile"
          >
            {PATH_PERCENTILES.map((p) => (
              <ToggleGroupItem key={p} value={String(p)} className={ACTIVE_TOGGLE}>
                {pctName(p)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>
      {path && names && (
        <p className="text-muted-foreground text-xs" data-testid="path-story">
          {storyText(path, names)}
        </p>
      )}
      <DataGrid
        label="Year-by-year strip"
        rows={rows}
        columns={columns}
        onChange={() => {}}
        readOnly
        maxHeight={260}
        highlightRow={rows.findIndex((r) => r.year === hoverYear)}
        onRowHover={(i) => useUi.getState().setHoverYear(i === null ? null : (rows[i]?.year ?? null))}
        onCellActivate={
          onExplain
            ? (ri, col) => {
                const year = rows[ri]?.year
                if (year !== undefined) onExplain(year, col)
              }
            : undefined
        }
      />
    </section>
  )
}
