import { useState } from 'react'
import { ChartFrame, fullMoney } from '@/app/components/charts/ChartFrame.tsx'
import { Button } from '@/components/ui/button'
import { formatAge } from '@/engine/core/dates.ts'
import type { Prepared } from '@/engine/model/prepare.ts'
import { useDocument } from '@/state/documentStore.ts'
import { useEffectiveFile } from '@/state/scenario.ts'
import { getPool } from '@/worker/browserPool.ts'
import { runRecommendation, runSensitivity, type SensitivityRow } from '@/worker/monteCarloClient.ts'

const PATHS = 1000

/** Sensitivity of the recommendation [FR-REC-4, FR-OUT-6]: table plus a dot chart of recommended ages. */
export function SensitivityPanel({ prep }: { prep: Prepared }) {
  const file = useEffectiveFile()
  const scenarioId = useDocument((s) => s.activeScenarioId)
  const [rows, setRows] = useState<SensitivityRow[] | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const age = prep.people[0].age

  const run = async () => {
    if (!file || !scenarioId) return
    setProgress(0)
    setError(null)
    try {
      const s = prep.scenario
      const opts = {
        paths: Math.min(PATHS, s.simulation.paths),
        seed: s.simulation.seed,
        candidates: prep.candidates,
        fra: age.fraMonth,
        objective: { ...s.objective, bequestTarget: s.expenses.bequestTarget },
      }
      const base = await runRecommendation(getPool(), file, scenarioId, {
        ...opts,
        refine: prep.candidates.length > 12,
      })
      const b = base.recommendation?.best
      const variantRows = await runSensitivity(getPool(), file, scenarioId, { ...opts, onProgress: setProgress })
      setRows([
        {
          factor: 'Base',
          label: 'Current assumptions',
          claim: b?.claim ?? null,
          floorsMet: base.recommendation?.floorsMet ?? false,
          medianEstate: b?.terminal.p50 ?? 0,
          successProb: b?.successProb ?? 0,
        },
        ...variantRows,
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProgress(null)
    }
  }

  const minAge = prep.candidates.length ? age.ageAt(prep.candidates[0]!) / 12 : 62
  const maxAge = prep.candidates.length ? age.ageAt(prep.candidates.at(-1)!) / 12 : 70
  const x = (claim: number) => ((age.ageAt(claim) / 12 - minAge) / Math.max(0.25, maxAge - minAge)) * 100
  const base = rows?.[0]

  return (
    <section className="grid gap-3" aria-label="Sensitivity">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void run()} disabled={progress !== null}>
          {rows ? 'Run again' : 'Run sensitivity'}
        </Button>
        <span className="text-muted-foreground text-xs">
          {progress !== null
            ? `Running… ${Math.round(progress * 100)}%`
            : `Each variant uses ${Math.min(PATHS, prep.scenario.simulation.paths)} paths and the same random draws.`}
        </span>
        {error && <span className="text-destructive text-xs">{error}</span>}
      </div>
      {rows && (
        <ChartFrame
          title="Recommended claiming age by assumption"
          legend={[]}
          table={{
            columns: ['Factor', 'Variant', 'Recommended age', 'Median estate', 'Success'],
            rows: rows.map((r) => [
              r.factor,
              r.label,
              r.claim === null ? '—' : `${formatAge(age.ageAt(r.claim))}${r.floorsMet ? '' : ' (floor not met)'}`,
              fullMoney(r.medianEstate),
              `${Math.round(r.successProb * 100)}%`,
            ]),
          }}
          note="Vertical line: recommendation under current assumptions."
        >
          <div className="grid gap-1 text-xs" data-testid="sensitivity">
            {rows.map((r) => (
              <div key={`${r.factor}-${r.label}`} className="grid grid-cols-[14rem_1fr_7rem] items-center gap-2">
                <span className="truncate">
                  <span className="text-muted-foreground">{r.factor}:</span> {r.label}
                </span>
                <div className="relative h-5 rounded bg-muted/50">
                  {base?.claim != null && (
                    <span className="absolute top-0 h-5 w-px bg-foreground/60" style={{ left: `${x(base.claim)}%` }} />
                  )}
                  {r.claim !== null && (
                    <span
                      className="absolute top-1 size-3 -translate-x-1/2 rounded-full border-2 border-background bg-[var(--series-1)]"
                      style={{ left: `${x(r.claim)}%` }}
                      title={formatAge(age.ageAt(r.claim))}
                    />
                  )}
                </div>
                <span className="font-mono tabular-nums">{r.claim === null ? '—' : formatAge(age.ageAt(r.claim))}</span>
              </div>
            ))}
            <div className="grid grid-cols-[14rem_1fr_7rem] gap-2 text-[10px] text-muted-foreground">
              <span />
              <span className="flex justify-between">
                <span>{Math.floor(minAge)}</span>
                <span>{Math.floor(maxAge)}</span>
              </span>
            </div>
          </div>
        </ChartFrame>
      )}
    </section>
  )
}
