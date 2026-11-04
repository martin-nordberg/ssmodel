import { create } from 'zustand'
import type { YM } from '@/engine/core/dates.ts'
import type { CandidateMetrics } from '@/engine/recommend/metrics.ts'
import type { Recommendation } from '@/engine/recommend/recommend.ts'
import type { Detail } from '@/worker/monteCarloClient.ts'

export type RunResult = {
  metrics: CandidateMetrics[]
  recommendation: Recommendation | null
  paths: number
  /** True for the quick low-path preview run [FR-UI-9]. */
  preview: boolean
  /** Recommendation with inheritances removed, on the same paths [FR-INH-6]; absent when there are none. */
  withoutInheritance?: Recommendation | null
}

export type Baseline = { label: string; result: RunResult; detail: Detail | null }

/** A lever value being dragged: applied to the deterministic preview before it is committed [FR-UI-9]. */
export type Draft = { path: string; value: unknown } | null

type ConsoleState = {
  /** Claiming date being inspected (claim-age lever); null = the recommended date. */
  inspect: YM | null
  status: 'idle' | 'running' | 'done' | 'error'
  progress: number
  error: string | null
  result: RunResult | null
  detail: Detail | null
  detailClaim: YM | null
  /** Inputs changed since the results were computed (results are dimmed). */
  stale: boolean
  draft: Draft
  baseline: Baseline | null
  /** Cancels the run in flight (set by the runner). */
  cancel: (() => void) | null
  set(patch: Partial<Omit<ConsoleState, 'set'>>): void
}

export const useConsole = create<ConsoleState>()((set) => ({
  inspect: null,
  status: 'idle',
  progress: 0,
  error: null,
  result: null,
  detail: null,
  detailClaim: null,
  stale: false,
  draft: null,
  baseline: null,
  cancel: null,
  set: (patch) => set(patch),
}))

/** The claiming date the Console shows: the inspected one, else the recommendation. */
export function shownClaim(s: { inspect: YM | null; result: RunResult | null }): YM | null {
  return s.inspect ?? s.result?.recommendation?.best.claim ?? null
}
