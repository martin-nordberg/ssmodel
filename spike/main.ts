import type { Op, RequestMessage, Requests, ResponseMessage } from './protocol.ts'

// Exposes the worker's operations as `window.spike.call(op, ...args)` for the Playwright measurements.

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let nextId = 1

worker.onmessage = (event: MessageEvent<ResponseMessage>) => {
  const msg = event.data
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  if (msg.ok) p.resolve(msg.result)
  else p.reject(new Error(msg.error))
}

function call<K extends Op>(op: K, ...args: Requests[K]['args']): Promise<Requests[K]['result']> {
  const id = nextId++
  const message: RequestMessage<K> = { id, op, args }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    worker.postMessage(message)
  })
}

/** Fetches a fixture served by the Playwright route and returns its bytes. */
async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

declare global {
  interface Window {
    spike: { call: typeof call; fetchBytes: typeof fetchBytes; crossOriginIsolated: boolean }
  }
}

window.spike = { call, fetchBytes, crossOriginIsolated: self.crossOriginIsolated }
call('version').then((v) => {
  const status = document.getElementById('status')
  if (status) status.textContent = `SQLite ${v} ready`
})
