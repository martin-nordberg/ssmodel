import { expect, test } from '@playwright/test'
import { hasRealFile, ms, openSpike, realFile, record, serveFile } from './helpers.ts'
import type { RoundTripResult, Vfs } from './protocol.ts'

// P0.1: SQLite WASM in a worker. A file's bytes go into OPFS, are opened and queried, exported, and written
// to a FileSystemFileHandle, for both OPFS VFSes [NFR-ARCH-8, FR-STO-2].

const vfses: Vfs[] = ['sahpool', 'opfs']

function report(label: string, r: RoundTripResult) {
  const t = r.timings
  console.log(
    `${label} ${r.vfs.padEnd(7)} ${(r.bytes / 1024).toFixed(0)} KiB: import ${ms(t.importMs)}, open+query ` +
      `${ms(t.openAndQueryMs)}, export ${ms(t.exportMs)}, write handle ${ms(t.writeHandleMs)}, read back ` +
      `${ms(t.readBackMs)}`,
  )
}

test('synthetic 1.2 MB database round-trips through both OPFS VFSes', async ({ page }) => {
  await openSpike(page)
  expect(await page.evaluate(() => window.spike.crossOriginIsolated)).toBe(true)
  const results = await page.evaluate(async (list) => {
    const bytes = await window.spike.call('makeSyntheticDb', 1_228_800)
    const out = []
    for (const vfs of list) {
      for (let run = 0; run < 3; run++) out.push(await window.spike.call('roundTrip', bytes, vfs))
    }
    return out
  }, vfses)
  for (const r of results) {
    expect(r.identical, `${r.vfs} export equals input`).toBe(true)
    expect(r.handleRoundTrip, `${r.vfs} handle round-trip`).toBe(true)
    expect(r.writeSurvives, `${r.vfs} write survives`).toBe(true)
    report('synthetic', r)
  }
  record('p0.1-synthetic', results)
})

test('real Checquery file round-trips (raw SQLite, no decryption)', async ({ page }) => {
  test.skip(!hasRealFile, `no real file at ${realFile}`)
  await serveFile(page, '/fixtures/real.sqlite3', realFile)
  await openSpike(page)
  const results = await page.evaluate(async (list) => {
    const bytes = await window.spike.fetchBytes('/fixtures/real.sqlite3')
    const out = []
    for (const vfs of list) {
      for (let run = 0; run < 3; run++) out.push(await window.spike.call('roundTrip', bytes, vfs))
    }
    return out
  }, vfses)
  for (const r of results) {
    expect(r.identical).toBe(true)
    expect(r.handleRoundTrip).toBe(true)
    expect(r.tables).toBeGreaterThan(5)
    report('real', r)
  }
  record('p0.1-real', results)
})
