import { expect, test } from '@playwright/test'
import { driverContract } from '../store/driver/driverContract.ts'
import type { CaseResult } from './suites.ts'

// NFR-ARCH-9: the SQLite WASM driver meets the same contract as bun:sqlite (test/store/driver/bunSqlite.test.ts).
test('WasmSqliteDriver meets the driver contract', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#status')).toHaveText('ready')
  const results = (await page.evaluate(() => window.harness.run('driverContract'))) as CaseResult[]
  expect(results.map((r) => r.name)).toEqual(driverContract.map((c) => c.name))
  for (const r of results) expect(r.error, r.name).toBeUndefined()
})
