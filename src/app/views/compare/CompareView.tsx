import { useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartFrame, compactMoney, fullMoney } from '@/app/components/charts/ChartFrame.tsx'
import { Button } from '@/components/ui/button'
import { formatAge } from '@/engine/core/dates.ts'
import { prepare } from '@/engine/model/prepare.ts'
import type { CandidateMetrics } from '@/engine/recommend/metrics.ts'
import type { Recommendation } from '@/engine/recommend/recommend.ts'
import { useEffectiveFile } from '@/state/scenario.ts'
import { getPool } from '@/worker/browserPool.ts'
import { runRecommendation } from '@/worker/monteCarloClient.ts'

const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
]
const PATHS = 1000

type Row = {
  id: string
  name: string
  metrics: CandidateMetrics[]
  rec: Recommendation | null
  ageOf: (c: number) => number
}

/** Compare scenarios [FR-UI-2]: a metrics table (one column per scenario) and overlaid claim-age curves. */
export function CompareView() {
  const file = useEffectiveFile()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!file) return null

  const run = async () => {
    setProgress(0)
    setError(null)
    try {
      const out: Row[] = []
      for (const [i, s] of file.scenarios.entries()) {
        const prep = prepare(file, s.id)
        if (prep.candidates.length === 0) continue
        const r = await runRecommendation(getPool(), file, s.id, {
          paths: Math.min(PATHS, s.simulation.paths),
          seed: s.simulation.seed,
          candidates: prep.candidates,
          fra: prep.people[0].age.fraMonth,
          objective: { ...s.objective, bequestTarget: s.expenses.bequestTarget },
          refine: false,
          onProgress: (f) => setProgress((i + f) / file.scenarios.length),
        })
        out.push({
          id: s.id,
          name: s.name,
          metrics: r.metrics,
          rec: r.recommendation,
          ageOf: (c) => prep.people[0].age.ageAt(c),
        })
      }
      setRows(out)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProgress(null)
    }
  }

  const metricRows: [string, (r: Row) => string][] = [
    [
      'Recommended claim age',
      (r) => (r.rec ? formatAge(r.ageOf(r.rec.best.claim)) + (r.rec.floorsMet ? '' : ' *') : '—'),
    ],
    ['Median estate (today’s $)', (r) => (r.rec ? fullMoney(r.rec.best.terminal.p50) : '—')],
    ['10th-percentile estate', (r) => (r.rec ? fullMoney(r.rec.best.terminal.p10) : '—')],
    ['Success probability', (r) => (r.rec ? `${Math.round(r.rec.best.successProb * 100)}%` : '—')],
    ['PV of Social Security', (r) => (r.rec ? fullMoney(r.rec.best.pvSs) : '—')],
    ['Lifetime tax + IRMAA', (r) => (r.rec ? fullMoney(r.rec.best.lifetimeTax) : '—')],
  ]

  // Overlay on claim age in years.
  const ages = [...new Set(rows?.flatMap((r) => r.metrics.map((m) => r.ageOf(m.claim))) ?? [])].sort((a, b) => a - b)
  const data = ages.map((a) => ({
    x: a / 12,
    label: formatAge(a),
    ...Object.fromEntries(
      (rows ?? []).map((r, i) => [`s${i}`, r.metrics.find((m) => r.ageOf(m.claim) === a)?.terminal.p50]),
    ),
  }))

  return (
    <div className="grid gap-4 p-4">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void run()} disabled={progress !== null}>
          {rows ? 'Compare again' : 'Compare scenarios'}
        </Button>
        <span className="text-muted-foreground text-xs">
          {progress !== null
            ? `Running… ${Math.round(progress * 100)}%`
            : `${file.scenarios.length} scenario(s); up to ${PATHS} paths each, what-ifs on the active tab included.`}
        </span>
        {error && <span className="text-destructive text-xs">{error}</span>}
      </div>
      {rows && (
        <>
          <table className="w-max text-xs" data-testid="compare-table">
            <thead>
              <tr>
                <th scope="col" className="px-2 py-1 text-left font-medium text-muted-foreground">
                  Metric
                </th>
                {rows.map((r) => (
                  <th key={r.id} scope="col" className="px-3 py-1 text-right font-medium">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricRows.map(([label, f]) => (
                <tr key={label} className="border-t">
                  <th scope="row" className="px-2 py-1 text-left font-normal text-muted-foreground">
                    {label}
                  </th>
                  {rows.map((r) => (
                    <td key={r.id} className="px-3 py-1 text-right font-mono tabular-nums">
                      {f(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground">
            * no claiming date meets the success floor; highest success shown.
          </p>
          <ChartFrame
            title="Median after-tax estate by claiming age (today's $)"
            legend={rows.slice(0, SERIES.length).map((r, i) => ({ label: r.name, color: SERIES[i]! }))}
            table={{
              columns: ['Claim age', ...rows.map((r) => r.name)],
              rows: data.map((d) => [
                d.label,
                ...rows.map((_, i) => fullMoney(Number((d as Record<string, unknown>)[`s${i}`] ?? 0))),
              ]),
            }}
          >
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--grid-line)" />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v: number) => `${Math.floor(v)}`}
                  tick={{ fontSize: 11 }}
                  stroke="var(--grid-line)"
                />
                <YAxis tickFormatter={compactMoney} width={56} tick={{ fontSize: 11 }} stroke="var(--grid-line)" />
                <Tooltip
                  formatter={(v) => fullMoney(Number(v))}
                  labelFormatter={(v) => `Claim at ${formatAge(Math.round(Number(v) * 12))}`}
                  contentStyle={{ fontSize: 11 }}
                />
                {rows.slice(0, SERIES.length).map((r, i) => (
                  <Line
                    key={r.id}
                    dataKey={`s${i}`}
                    name={r.name}
                    stroke={SERIES[i]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </>
      )}
    </div>
  )
}
