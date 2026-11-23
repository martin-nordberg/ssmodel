import { describe, test } from 'bun:test'
import { openBunDriver, openBunDriverFromBytes } from '@/store/driver/bunSqlite.ts'
import { driverContract } from './driverContract.ts'

// NFR-ARCH-9: the bun:sqlite driver meets the shared contract (the WASM driver runs it in test/browser).
describe('BunSqliteDriver', () => {
  for (const c of driverContract) test(c.name, () => c.run({ open: openBunDriver, openBytes: openBunDriverFromBytes }))
})
