import { prepare } from '@/engine/model/prepare.ts'
import { pathRows, runDetailShard, runShard } from '@/engine/sim/monteCarlo.ts'
import { createRng, Stream } from '@/engine/sim/rng.ts'
import type { TaskKind, TaskMap } from './protocol.ts'

export type TaskContext = { progress(done: number, total: number): void }

type Handlers = { [K in TaskKind]: (req: TaskMap[K]['req'], ctx: TaskContext) => TaskMap[K]['res'] }

/** Engine entry points callable from the pool. Pure functions of their payload. */
export const handlers: Handlers = {
  ping: (req) => ({ value: req.value }),
  rngSample: (req, ctx) => {
    const draws = req.paths.map((p, i) => {
      const rng = createRng(req.seed, p, Stream.returns)
      ctx.progress(i + 1, req.paths.length)
      return Array.from({ length: req.count }, () => rng.normal())
    })
    return { draws }
  },
  mcShard: (req, ctx) => runShard(prepare(req.file, req.scenarioId), req, ctx.progress),
  mcDetail: (req, ctx) => runDetailShard(prepare(req.file, req.scenarioId), req, ctx.progress),
  pathRows: (req) => pathRows(prepare(req.file, req.scenarioId), req.seed, req.path, req.claim),
}
