/// <reference lib="webworker" />
import { handlers } from './handlers.ts'
import type { FromWorker, ToWorker } from './protocol.ts'

const post = (msg: FromWorker) => (self as unknown as Worker).postMessage(msg)

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const { id, kind, payload } = e.data
  try {
    const handler = handlers[kind] as (req: unknown, ctx: { progress(d: number, t: number): void }) => unknown
    let lastPost = 0
    const result = handler(payload, {
      progress(done, total) {
        const now = Date.now()
        if (done === total || now - lastPost > 100) {
          lastPost = now
          post({ id, type: 'progress', done, total })
        }
      },
    })
    post({ id, type: 'result', payload: result })
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
