import { spawnSync } from 'node:child_process'
import { expect, type Page, test } from '@playwright/test'
import {
  fixtureDir,
  hasRealFile,
  ms,
  openSpike,
  readReference,
  realFile,
  realPassword,
  record,
  repoRoot,
  serveFile,
} from './helpers.ts'
import type { ReplayResult } from './protocol.ts'
import { comparisonPoints, differences, type Totals } from './totals.ts'

// P0.3: replay and parity. The browser decrypts and replays a file's change log, then runs Checquery's
// statement queries; Checquery's own code (openExistingFile, then its services) gives the reference totals.
// They must match for every year-end, every calendar year and today [NFR-TEST-9, NFR-ARCH-10].

const { dates, years } = comparisonPoints(new Date().toISOString().slice(0, 10))

interface Reference {
  openMs: number
  totals: Totals
  sheetMismatches: string[]
}

/** Runs Checquery's code on the file in a Bun subprocess. Output stays in memory; nothing is printed. */
function reference(file: string, password: string): Reference {
  const run = spawnSync('bun', ['spike/checquery/reference.ts', file, dates.join(','), years.join(',')], {
    cwd: repoRoot,
    env: { ...process.env, SPIKE_REFERENCE_PASSWORD: password },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (run.status !== 0) throw new Error(`reference run failed with status ${run.status}`)
  return JSON.parse(run.stdout)
}

async function replay(page: Page, url: string, password: string): Promise<ReplayResult> {
  return page.evaluate(
    async ({ url, password, dates, years }) => {
      const bytes = await window.spike.fetchBytes(url)
      return window.spike.call('replayFile', bytes, password, dates, years)
    },
    { url, password, dates, years },
  )
}

function summary(label: string, r: ReplayResult, ref: Reference) {
  const t = r.timings
  const open = t.openMs + t.keyMs + t.decryptMs + t.applyMs
  console.log(
    `${label}: ${r.actions} actions; browser open ${ms(open)} (copy+read ${ms(t.openMs)}, key ${ms(t.keyMs)}, ` +
      `decrypt ${ms(t.decryptMs)}, replay ${ms(t.applyMs)}), queries ${ms(t.queryMs)}; Checquery open ` +
      `${ms(ref.openMs)}`,
  )
  return { actions: r.actions, counts: r.counts, timings: t, browserOpenMs: open, checqueryOpenMs: ref.openMs }
}

for (const name of ['small', 'large']) {
  test(`synthetic ${name} fixture: browser replay matches Checquery`, async ({ page }) => {
    const file = `${fixtureDir}${name}.checquery`
    const { password } = readReference(name)
    const ref = reference(file, password)
    await serveFile(page, `/fixtures/${name}.checquery`, file)
    await openSpike(page)
    const result = await replay(page, `/fixtures/${name}.checquery`, password)
    expect(result.passwordOk).toBe(true)
    expect(ref.sheetMismatches, 'reduction agrees with Checquery buildBalanceSheet').toEqual([])
    expect(result.totals).toEqual(ref.totals)
    expect(result.counts['update-transaction'], 'fixture exercises patches').toBeGreaterThan(0)
    expect(result.counts['delete-transaction'], 'fixture exercises deletes').toBeGreaterThan(0)
    record(`p0.3-${name}`, summary(name, result, ref))
  })
}

test('real Checquery file: browser replay matches Checquery', async ({ page }) => {
  test.skip(!hasRealFile || !realPassword, 'needs the real file and SPIKE_CHECQUERY_PASSWORD')
  const password = realPassword as string
  const ref = reference(realFile, password)
  await serveFile(page, '/fixtures/real.checquery', realFile)
  await openSpike(page)
  const result = await replay(page, '/fixtures/real.checquery', password)
  expect(result.passwordOk, 'password accepted').toBe(true)
  // Only where they differ is reported, never amounts.
  expect(ref.sheetMismatches, 'reduction agrees with Checquery buildBalanceSheet').toEqual([])
  expect(differences(result.totals as Totals, ref.totals)).toEqual([])
  const accounts = new Set(Object.values(ref.totals.asOf).flatMap((a) => Object.keys(a.byAccount))).size
  record('p0.3-real', { ...summary('real', result, ref), datesCompared: dates.length, years: years.length, accounts })
})
