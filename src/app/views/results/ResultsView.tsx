import { Download } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { SelectField } from '@/app/components/fields.tsx'
import { DataGrid, type GridColumn } from '@/app/components/grid/DataGrid.tsx'
import { formatCurrency } from '@/app/components/grid/parse.ts'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatAge, formatYM } from '@/engine/core/dates.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import type { YearRow } from '@/engine/sim/path.ts'
import { useEffectivePrepared } from '@/state/scenario.ts'
import { useSettings } from '@/state/settingsStore.ts'
import { scheduleColumns, toCsv, yearColumns } from './yearTable.ts'

export function DollarsToggle() {
  const dollars = useSettings((s) => s.dollars)
  const set = useSettings((s) => s.set)
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={dollars}
      onValueChange={(v) => v && set({ dollars: v as 'real' | 'nominal' })}
      aria-label="Dollars"
    >
      <ToggleGroupItem value="real">Today's $</ToggleGroupItem>
      <ToggleGroupItem value="nominal">Nominal $</ToggleGroupItem>
    </ToggleGroup>
  )
}

/** Results view [FR-OUT-4, FR-OUT-7]: deterministic year-by-year table for a chosen claiming date. */
export function ResultsView() {
  const prepNow = useEffectivePrepared()
  const prep = useDeferredValue(prepNow)
  const dollars = useSettings((s) => s.dollars)
  const real = dollars === 'real'
  const [claimSel, setClaim] = useState<number | null>(null)

  const claim =
    prep &&
    (claimSel !== null && prep.candidates.includes(claimSel)
      ? claimSel
      : (prep.candidates.find((c) => c >= prep.people[0].age.fraMonth) ?? prep.candidates.at(-1)))
  const result = useMemo(
    () => (prep && claim !== undefined && claim !== null ? runDeterministic(prep, claim) : null),
    [prep, claim],
  )
  const [table, setTable] = useState<'years' | 'schedule'>('years')
  const cols = useMemo(
    () => (prep ? (table === 'years' ? yearColumns(prep.accounts) : scheduleColumns(prep.accounts)) : []),
    [prep, table],
  )

  if (!prep) return <p className="p-4 text-muted-foreground">The household could not be prepared; check Setup.</p>
  if (prep.candidates.length === 0 || claim === undefined || claim === null) {
    return (
      <p className="p-4 text-muted-foreground">No claiming dates remain (the Primary is past 70 on the base date).</p>
    )
  }
  const rows = result?.rows ?? []
  const gridCols: GridColumn<YearRow>[] = cols.map((c) => ({
    id: c.id,
    header: c.header,
    type: c.money ? 'currency' : 'text',
    width: c.money ? 104 : c.id === 'year' ? 56 : 64,
    readOnly: true,
    get: (r) => {
      const v = c.value(r)
      return c.money && typeof v === 'number' ? (real ? v / r.price : v) : String(v)
    },
    set: (r) => r,
  }))
  const s = result?.summary
  const exportCsv = () => {
    const blob = new Blob([toCsv(rows, cols, real)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${prep.scenario.name.replace(/\W+/g, '-')}-${formatYM(claim)}-${dollars}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <div className="grid gap-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Claiming date (Primary)"
          value={claim}
          options={prep.candidates.map((c) => ({
            value: c,
            label: `${formatYM(c)} — age ${formatAge(prep.people[0].age.ageAt(c))}`,
          }))}
          onChange={(v) => setClaim(v)}
          className="w-64"
        />
        <DollarsToggle />
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={table}
          onValueChange={(v) => v && setTable(v as 'years' | 'schedule')}
          aria-label="Table"
        >
          <ToggleGroupItem value="years">Year table</ToggleGroupItem>
          <ToggleGroupItem value="schedule">Withdrawal schedule</ToggleGroupItem>
        </ToggleGroup>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download /> Export CSV
        </Button>
        <span className="text-muted-foreground text-xs">
          Deterministic path: mean inflation and returns, fixed death ages.
        </span>
      </div>
      {s && (
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2 text-xs" data-testid="path-summary">
          <Stat label="Terminal wealth (today's $, after tax)" value={formatCurrency(s.terminalRealAfterTax)} />
          <Stat label="Lifetime Social Security (today's $)" value={formatCurrency(s.lifetimeSsReal)} />
          <Stat label="Lifetime taxes + IRMAA (today's $)" value={formatCurrency(s.lifetimeTaxReal)} />
          <Stat label="Lowest liquid balance (today's $)" value={formatCurrency(s.minLiquidReal)} />
          <Stat label="Savings depleted" value={s.depletedYear === null ? 'Never' : String(s.depletedYear)} />
        </dl>
      )}
      <DataGrid
        label="Year-by-year results"
        rows={rows}
        columns={gridCols}
        onChange={() => {}}
        readOnly
        maxHeight={600}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono font-semibold text-sm tabular-nums">{value}</dd>
    </div>
  )
}
