import { useMemo } from 'react'
import { DataGrid, type GridColumn } from '@/app/components/grid/DataGrid.tsx'
import type { YearRow } from '@/engine/sim/path.ts'
import { useSettings } from '@/state/settingsStore.ts'
import { useUi } from '@/state/uiStore.ts'

/** Compact year-by-year strip for the date shown [§8.2]; hovering a row highlights that year in charts. */
export function DetailStrip({
  rows,
  label,
  onExplain,
}: {
  rows: YearRow[]
  label: string
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
      <h3 className="font-medium text-xs">
        {label} {hoverYear !== null && <span className="text-muted-foreground">— {hoverYear}</span>}
      </h3>
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
