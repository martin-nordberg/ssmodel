import { ArrowDown, ArrowUp, LayoutGrid } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ClaimCurveChart, FanChart, IncomeChart, TaxChart } from '@/app/components/charts/ConsoleCharts.tsx'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { YM } from '@/engine/core/dates.ts'
import type { Prepared } from '@/engine/model/prepare.ts'
import { accountMedians, fanSummary } from '@/engine/recommend/fan.ts'
import { cn } from '@/lib/utils'
import { useConsole } from '@/state/consoleStore.ts'
import { CHART_LABELS, type ChartId, TILE_LABELS, useLayout } from '@/state/layoutStore.ts'
import { useSettings } from '@/state/settingsStore.ts'
import { DollarsToggle } from '../results/ResultsView.tsx'

/** Main chart area with tabs [FR-OUT-2, FR-OUT-3, FR-UI-17]. */
export function ChartArea({ prep, claim, dim }: { prep: Prepared; claim: YM | null; dim: boolean }) {
  const charts = useLayout((s) => s.charts).filter((c) => c.visible)
  const [tab, setTab] = useState<ChartId>('claimCurve')
  const current = charts.find((c) => c.id === tab)?.id ?? charts[0]?.id ?? null
  const result = useConsole((s) => s.result)
  const detail = useConsole((s) => s.detail)
  const detailClaim = useConsole((s) => s.detailClaim)
  const baseline = useConsole((s) => s.baseline)
  const set = useConsole((s) => s.set)
  const real = useSettings((s) => s.dollars) === 'real'
  const [stacked, setStacked] = useState(false)
  const detailOk = detail && detailClaim === claim

  const fan = useMemo(
    () => (detailOk ? fanSummary(detail.liquid, detail.paths, detail.years, prep.baseYear) : []),
    [detailOk, detail, prep.baseYear],
  )
  const accounts = useMemo(
    () =>
      detailOk && stacked
        ? accountMedians(detail.byAccount, detail.paths, detail.years, prep.accounts.length, prep.baseYear, fan.length)
        : null,
    [detailOk, stacked, detail, prep, fan.length],
  )
  const baseFan = useMemo(
    () =>
      baseline?.detail
        ? fanSummary(baseline.detail.liquid, baseline.detail.paths, baseline.detail.years, prep.baseYear)
        : null,
    [baseline, prep.baseYear],
  )

  return (
    <section
      aria-label="Charts"
      className={cn('grid min-h-0 content-start gap-2 rounded-lg border p-3 transition-opacity', dim && 'opacity-60')}
    >
      <div className="flex flex-wrap items-center gap-1">
        <div role="tablist" aria-label="Chart" className="flex gap-1">
          {charts.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === current}
              onClick={() => setTab(c.id)}
              className={cn(
                'rounded-md px-2 py-1 text-xs',
                c.id === current ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              {CHART_LABELS[c.id]}
            </button>
          ))}
        </div>
        {current === 'fan' && (
          <Button variant="ghost" size="xs" aria-pressed={stacked} onClick={() => setStacked(!stacked)}>
            {stacked ? 'Total' : 'By account'}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {(current === 'income' || current === 'taxes') && <DollarsToggle />}
          <LayoutMenu />
        </div>
      </div>
      {current === 'claimCurve' && result && (
        <ClaimCurveChart
          metrics={result.metrics}
          age={prep.people[0].age}
          recommended={result.recommendation?.best.claim ?? null}
          shown={claim}
          successFloor={prep.scenario.objective.successFloor}
          baseline={baseline?.result.metrics ?? null}
          onPick={(c) => set({ inspect: c })}
        />
      )}
      {current === 'fan' &&
        (detailOk ? (
          <FanChart fan={fan} baseline={baseFan} stacked={accounts} accountLabels={prep.accounts.map((a) => a.label)} />
        ) : (
          <Pending />
        ))}
      {current === 'income' && (detailOk ? <IncomeChart rows={detail.medianRows} real={real} /> : <Pending />)}
      {current === 'taxes' && (detailOk ? <TaxChart rows={detail.medianRows} real={real} /> : <Pending />)}
    </section>
  )
}

function Pending() {
  return <p className="py-16 text-center text-muted-foreground text-xs">Simulating paths for this claiming date…</p>
}

function LayoutMenu() {
  const l = useLayout()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Console layout">
          <LayoutGrid />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Charts</DropdownMenuLabel>
        {l.charts.map((c, i) => (
          <LayoutRow
            key={c.id}
            label={CHART_LABELS[c.id]}
            visible={c.visible}
            first={i === 0}
            last={i === l.charts.length - 1}
            onToggle={() => l.toggle('charts', c.id)}
            onMove={(d) => l.move('charts', c.id, d)}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tiles</DropdownMenuLabel>
        {l.tiles.map((t, i) => (
          <LayoutRow
            key={t.id}
            label={TILE_LABELS[t.id]}
            visible={t.visible}
            first={i === 0}
            last={i === l.tiles.length - 1}
            onToggle={() => l.toggle('tiles', t.id)}
            onMove={(d) => l.move('tiles', t.id, d)}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => l.reset()}>Reset layout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LayoutRow({
  label,
  visible,
  first,
  last,
  onToggle,
  onMove,
}: {
  label: string
  visible: boolean
  first: boolean
  last: boolean
  onToggle: () => void
  onMove: (delta: number) => void
}) {
  return (
    <div className="flex items-center">
      <DropdownMenuCheckboxItem
        className="flex-1"
        checked={visible}
        onSelect={(e) => e.preventDefault()}
        onCheckedChange={onToggle}
      >
        {label}
      </DropdownMenuCheckboxItem>
      <button
        type="button"
        aria-label={`Move ${label} up`}
        disabled={first}
        className="p-1 text-muted-foreground disabled:opacity-30"
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="size-3" />
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        disabled={last}
        className="p-1 text-muted-foreground disabled:opacity-30"
        onClick={() => onMove(1)}
      >
        <ArrowDown className="size-3" />
      </button>
    </div>
  )
}
