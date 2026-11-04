// Messages between the UI thread and engine workers [NFR-ARCH-2]. Cancellation terminates the worker, so there
// is no cancel message: long synchronous engine loops could not receive one anyway.
import type { CandidateSamples, DetailShard } from '@/engine/sim/monteCarlo.ts'
import type { YearRow } from '@/engine/sim/path.ts'
import type { HouseholdFile } from '@/schema/model.ts'

export type TaskKind = keyof TaskMap

export type ScenarioRef = { file: HouseholdFile; scenarioId: string }

/** Request/response payloads per task kind. */
export interface TaskMap {
  ping: { req: { value: number }; res: { value: number } }
  rngSample: { req: { seed: number; paths: number[]; count: number }; res: { draws: number[][] } }
  mcShard: {
    req: ScenarioRef & { seed: number; pathStart: number; pathEnd: number; candidates: number[] }
    res: CandidateSamples[]
  }
  mcDetail: { req: ScenarioRef & { seed: number; pathStart: number; pathEnd: number; claim: number }; res: DetailShard }
  pathRows: { req: ScenarioRef & { seed: number; path: number; claim: number }; res: YearRow[] }
}

export type ToWorker = { id: number; kind: TaskKind; payload: unknown }

export type FromWorker =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'result'; payload: unknown }
  | { id: number; type: 'error'; message: string }
