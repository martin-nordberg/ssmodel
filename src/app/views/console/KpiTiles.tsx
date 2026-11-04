import type { CandidateMetrics } from '@/engine/recommend/metrics.ts'
import { useConsole } from '@/state/consoleStore.ts'
import { TILE_LABELS, type TileId, useLayout } from '@/state/layoutStore.ts'

export const money = (x: number) => {
  const a = Math.abs(x)
  const s =
    a >= 1e6
      ? `$${(a / 1e6).toFixed(2)}M`
      : a >= 1e4
        ? `$${Math.round(a / 1e3)}k`
        : `$${Math.round(a).toLocaleString('en-US')}`
  return x < 0 ? `−${s}` : s
}
const pct = (x: number) => `${Math.round(x * 100)}%`

function tileValue(
  id: TileId,
  m: CandidateMetrics,
): { value: number; text: string; higherIsBetter: boolean; isPct: boolean } {
  switch (id) {
    case 'success':
      return { value: m.successProb, text: pct(m.successProb), higherIsBetter: true, isPct: true }
    case 'median':
      return { value: m.terminal.p50, text: money(m.terminal.p50), higherIsBetter: true, isPct: false }
    case 'p10':
      return { value: m.terminal.p10, text: money(m.terminal.p10), higherIsBetter: true, isPct: false }
    case 'pvSs':
      return { value: m.pvSs, text: money(m.pvSs), higherIsBetter: true, isPct: false }
    case 'tax':
      return { value: m.lifetimeTax, text: money(m.lifetimeTax), higherIsBetter: false, isPct: false }
    case 'depleted':
      return { value: m.minLiquid.p50, text: money(m.minLiquid.p50), higherIsBetter: true, isPct: false }
  }
}

/** KPI tiles for the date shown, with deltas against a pinned baseline [FR-OUT-1, FR-UI-10]. */
export function KpiTiles({ shown, baselineClaim }: { shown: CandidateMetrics | null; baselineClaim: number | null }) {
  const tiles = useLayout((s) => s.tiles)
  const baseline = useConsole((s) => s.baseline)
  if (!shown) return null
  const base =
    baseline?.result.metrics.find((m) => m.claim === baselineClaim) ?? baseline?.result.recommendation?.best ?? null
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2" data-testid="kpi-tiles">
      {tiles
        .filter((t) => t.visible)
        .map((t) => {
          const v = tileValue(t.id, shown)
          const b = base ? tileValue(t.id, base) : null
          const d = b ? v.value - b.value : 0
          const good = d === 0 ? null : d > 0 === v.higherIsBetter
          return (
            <div key={t.id} className="rounded-md border p-2">
              <dt className="text-[11px] text-muted-foreground">{TILE_LABELS[t.id]}</dt>
              <dd className="font-mono font-semibold text-sm tabular-nums">{v.text}</dd>
              {b && Math.abs(d) > 1e-9 && (
                <dd
                  className={
                    good
                      ? 'text-[11px] text-emerald-700 dark:text-emerald-400'
                      : 'text-[11px] text-red-700 dark:text-red-400'
                  }
                >
                  {d > 0 ? '+' : '−'}
                  {v.isPct ? `${Math.round(Math.abs(d) * 100)} pts` : money(Math.abs(d))} vs baseline
                </dd>
              )}
            </div>
          )
        })}
    </dl>
  )
}
