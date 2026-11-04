import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { formatAge, formatYM } from '@/engine/core/dates.ts'
import { prepare } from '@/engine/model/prepare.ts'
import { explain } from '@/engine/recommend/recommend.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import { cn } from '@/lib/utils'
import { shownClaim, useConsole } from '@/state/consoleStore.ts'
import { useDocument, withOverrides } from '@/state/documentStore.ts'
import { useActiveScenario, useEffectiveFile, useEffectivePrepared, useFile } from '@/state/scenario.ts'
import { useUi } from '@/state/uiStore.ts'
import { completeness, isComplete } from '../setup/completeness.ts'
import { ChartArea } from './ChartArea.tsx'
import { DetailStrip } from './DetailStrip.tsx'
import { KpiTiles, money } from './KpiTiles.tsx'
import { LeverRail } from './LeverRail.tsx'
import { useConsoleRunner } from './useConsoleRunner.ts'

/** Console view [§8.2, FR-OUT-1]: levers, recommendation, charts and the year-by-year strip. */
export function ConsoleView() {
  const file = useFile()
  const saved = useActiveScenario()
  if (!file || !saved) return null
  if (!isComplete(completeness(file, saved))) return <Incomplete />
  return <ConsoleBody />
}

function Incomplete() {
  const setView = useUi((s) => s.setView)
  return (
    <div className="mx-auto mt-16 max-w-md text-center text-sm">
      <p className="mb-3">Some facts are still missing. The Console needs the items on the Setup checklist.</p>
      <Button onClick={() => setView('setup')}>Go to Setup</Button>
    </div>
  )
}

function ConsoleBody() {
  useConsoleRunner()
  const saved = useActiveScenario()!
  const effFile = useEffectiveFile()!
  const prep = useEffectivePrepared()
  const id = useDocument((s) => s.activeScenarioId)
  const c = useConsole()
  const claim = shownClaim(c)
  const effective = effFile.scenarios.find((s) => s.id === id) ?? effFile.scenarios[0]!

  // Deterministic preview: updates on every lever tick (draft) [FR-UI-9, NFR-UI-2].
  const preview = useMemo(() => {
    if (!prep || claim === null) return null
    try {
      const p =
        c.draft === null
          ? prep
          : prepare(
              {
                ...effFile,
                scenarios: effFile.scenarios.map((s) =>
                  s.id === effective.id ? withOverrides(s, { [c.draft!.path]: c.draft!.value }) : s,
                ),
              },
              effective.id,
            )
      return runDeterministic(p, claim)
    } catch {
      return null
    }
  }, [prep, claim, c.draft, effFile, effective.id])

  if (!prep) return <p className="p-4 text-muted-foreground">The household could not be prepared; check Setup.</p>
  if (prep.candidates.length === 0)
    return <p className="p-4 text-muted-foreground">No claiming dates remain (past 70).</p>

  const rec = c.result?.recommendation ?? null
  const shown = c.result?.metrics.find((m) => m.claim === claim) ?? null
  const lines =
    rec && c.result
      ? explain(rec, c.result.metrics, prep.people[0].age, { fra: prep.people[0].age.fraMonth }, money)
      : []
  const dim = c.stale || c.draft !== null

  return (
    <div className="flex h-full min-h-0">
      <LeverRail saved={saved} effective={effective} prep={prep} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-3 [&>*]:shrink-0">
        <RunStatus />
        <section
          aria-label="Recommendation"
          className={cn('grid gap-2 rounded-lg border p-3 transition-opacity', dim && 'opacity-60')}
        >
          {rec ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="font-semibold text-base" data-testid="recommendation">
                  Claim at {formatAge(prep.people[0].age.ageAt(rec.best.claim))} ({formatYM(rec.best.claim)})
                </h2>
                <span className="text-muted-foreground text-xs">
                  {c.result?.preview ? `preview, ${c.result.paths} paths` : `${c.result?.paths} paths`}
                  {!rec.floorsMet && ' — no date meets the success floor'}
                </span>
              </div>
              <ul className="grid gap-0.5 text-xs" data-testid="explanation">
                {lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <KpiTiles shown={shown} baselineClaim={claim} />
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              {c.status === 'error' ? `Run failed: ${c.error}` : 'Running the simulation…'}
            </p>
          )}
        </section>
        <ChartArea prep={prep} claim={claim} dim={dim} />
        <DetailStrip
          rows={c.draft === null && c.detail && c.detailClaim === claim ? c.detail.medianRows : (preview?.rows ?? [])}
          label={c.draft === null && c.detail && c.detailClaim === claim ? 'Median path' : 'Deterministic path'}
        />
      </div>
    </div>
  )
}

function RunStatus() {
  const status = useConsole((s) => s.status)
  const progress = useConsole((s) => s.progress)
  const cancel = useConsole((s) => s.cancel)
  const preview = useConsole((s) => s.result?.preview)
  if (status !== 'running') return <div className="h-1" aria-hidden />
  return (
    <div className="flex items-center gap-2 text-xs" role="status" aria-live="polite">
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <span className="w-40 text-muted-foreground">
        {preview === undefined ? 'Preview' : 'Full run'} {Math.round(progress * 100)}%
      </span>
      {cancel && (
        <Button size="xs" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      )}
    </div>
  )
}
