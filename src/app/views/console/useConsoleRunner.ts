// Drives Monte Carlo for the Console [FR-UI-5, FR-UI-9]: on any input or what-if change, a quick low-path preview
// runs first, then the full run (coarse→fine grid when there are many candidates), then the per-year detail for
// the date shown. Runs in flight are cancelled when inputs change again.
import { useEffect } from 'react'
import { shownClaim, useConsole } from '@/state/consoleStore.ts'
import { useDocument } from '@/state/documentStore.ts'
import { useEffectiveFile, useEffectivePrepared } from '@/state/scenario.ts'
import { getPool } from '@/worker/browserPool.ts'
import { runDetail, runRecommendation } from '@/worker/monteCarloClient.ts'

const PREVIEW_PATHS = 500
const DETAIL_PATHS = 2000

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

export function useConsoleRunner() {
  const file = useEffectiveFile()
  const prep = useEffectivePrepared()
  const scenarioId = useDocument((s) => s.activeScenarioId)
  const set = useConsole((s) => s.set)

  // Recommendation runs.
  useEffect(() => {
    if (!file || !prep || !scenarioId) return
    const ac = new AbortController()
    useConsole.getState().set({ stale: true })
    if (prep.candidates.length === 0) {
      set({ status: 'done', result: null, stale: false })
      return
    }
    const timer = setTimeout(async () => {
      const s = prep.scenario
      const objective = { ...s.objective, bequestTarget: s.expenses.bequestTarget }
      const base = {
        seed: s.simulation.seed,
        candidates: prep.candidates,
        fra: prep.people[0].age.fraMonth,
        objective,
        signal: ac.signal,
      }
      set({
        status: 'running',
        progress: 0,
        error: null,
        cancel: () => {
          ac.abort()
          set({ status: 'idle', cancel: null })
        },
      })
      try {
        const pool = getPool()
        const previewPaths = Math.min(PREVIEW_PATHS, s.simulation.paths)
        const pv = await runRecommendation(pool, file, scenarioId, {
          ...base,
          paths: previewPaths,
          refine: false,
          onProgress: (f) => set({ progress: 0.1 * f }),
        })
        set({ result: { ...pv, paths: previewPaths, preview: s.simulation.paths > previewPaths }, stale: false })
        if (s.simulation.paths > previewPaths) {
          const full = await runRecommendation(pool, file, scenarioId, {
            ...base,
            paths: s.simulation.paths,
            refine: prep.candidates.length > 12,
            onProgress: (f) => set({ progress: 0.1 + 0.9 * f }),
          })
          set({ result: { ...full, paths: s.simulation.paths, preview: false } })
        }
        set({ status: 'done', progress: 1, cancel: null })
      } catch (e) {
        if (!isAbort(e)) set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [file, prep, scenarioId, set])

  // Detail (fan chart, median path) for the date shown.
  const result = useConsole((s) => s.result)
  const inspect = useConsole((s) => s.inspect)
  const claim = shownClaim({ inspect, result })
  useEffect(() => {
    if (!file || !prep || !scenarioId || claim === null || !result) return
    const ac = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const detail = await runDetail(getPool(), file, scenarioId, claim, {
          paths: Math.min(DETAIL_PATHS, prep.scenario.simulation.paths),
          seed: prep.scenario.simulation.seed,
          signal: ac.signal,
        })
        set({ detail, detailClaim: claim })
      } catch (e) {
        if (!isAbort(e)) set({ error: e instanceof Error ? e.message : String(e) })
      }
    }, 150)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [file, prep, scenarioId, claim, result, set])
}
