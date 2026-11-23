import type { SuiteRequest, SuiteResponse } from './suites.ts'

// Exposes `window.harness.run(suite, ...args)`, which runs a suite in the harness worker.

const worker = new Worker(new URL('./harness.worker.ts', import.meta.url), { type: 'module' })
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let nextId = 1

worker.onmessage = (event: MessageEvent<SuiteResponse>) => {
  const msg = event.data
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  if (msg.ok) p.resolve(msg.result)
  else p.reject(new Error(msg.error))
}

function run(suite: string, ...args: unknown[]): Promise<unknown> {
  const id = nextId++
  const message: SuiteRequest = { id, suite, args }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage(message)
  })
}

declare global {
  interface Window {
    harness: { run: typeof run }
  }
}

window.harness = { run }
const status = document.getElementById('status')
if (status) status.textContent = 'ready'
