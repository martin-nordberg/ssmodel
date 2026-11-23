import { loadSqlite, openWasmMemory } from '@/store/driver/wasmSqlite.ts'
import { type ContractCase, type DriverFactory, driverContract } from '../store/driver/driverContract.ts'
import type { CaseResult, SuiteRequest, SuiteResponse } from './suites.ts'

// Runs test suites inside a dedicated worker, where the store worker's code runs in the app.

function runCases(cases: ContractCase[], factory: DriverFactory): CaseResult[] {
  return cases.map((c) => {
    try {
      c.run(factory)
      return { name: c.name, ok: true }
    } catch (err) {
      return { name: c.name, ok: false, error: String((err as Error).stack ?? err) }
    }
  })
}

const suites: Record<string, (...args: never[]) => Promise<unknown>> = {
  /** NFR-ARCH-9: the shared driver contract against SQLite WASM. */
  async driverContract(): Promise<CaseResult[]> {
    const sqlite3 = await loadSqlite()
    return runCases(driverContract, {
      open: () => openWasmMemory(sqlite3),
      openBytes: (bytes) => openWasmMemory(sqlite3, bytes),
    })
  },
}

self.onmessage = async (event: MessageEvent<SuiteRequest>) => {
  const { id, suite, args } = event.data
  let response: SuiteResponse
  try {
    const fn = suites[suite]
    if (!fn) throw new Error(`unknown suite ${suite}`)
    response = { id, ok: true, result: await fn(...(args as never[])) }
  } catch (err) {
    response = { id, ok: false, error: String((err as Error).stack ?? err) }
  }
  self.postMessage(response)
}
