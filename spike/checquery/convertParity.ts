// P2.9, NFR-TEST-9: converts a .checquery file with ProvisionLens's converter (src/store/ledger/convertChecquery.ts)
// and checks that the converted file's statements match Checquery's own (spike/checquery/reference.ts) for every
// year-end since 2000, every calendar year and today. Prints only counts, timings and pass/fail, never amounts.
// The original file is only read.
//
// Usage (the password is read from the environment, never from the command line):
//   read -rs SPIKE_CHECQUERY_PASSWORD && export SPIKE_CHECQUERY_PASSWORD && bun spike/checquery/convertParity.ts; unset SPIKE_CHECQUERY_PASSWORD
// SPIKE_CHECQUERY_FILE overrides the file (default private/Nordbergs.checquery).

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'
import { openBunDriver, openBunDriverFromBytes } from '@/store/driver/bunSqlite.ts'
import { convertChecquery } from '@/store/ledger/convertChecquery.ts'
import { realFile, realPassword, repoRoot } from '../helpers.ts'
import { type Balance, comparisonPoints, differences, reduceTotals, type Totals } from '../totals.ts'

const password = realPassword
if (!password) throw new Error('Set SPIKE_CHECQUERY_PASSWORD (see the usage at the top of this file).')

const { dates, years } = comparisonPoints(new Date().toISOString().slice(0, 10))

// Checquery's own statements for the original file (its code runs on a temporary copy).
const ref = spawnSync('bun', ['spike/checquery/reference.ts', realFile, dates.join(','), years.join(',')], {
  cwd: repoRoot,
  env: { ...process.env, SPIKE_REFERENCE_PASSWORD: password },
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
})
if (ref.status !== 0) throw new Error(`Checquery's reference run failed (status ${ref.status}).`)
const reference = JSON.parse(ref.stdout) as { totals: Totals; sheetMismatches: string[] }

// The conversion, from the file's bytes in memory.
const t0 = performance.now()
const bytes = readFileSync(realFile)
const converted = await convertChecquery(openBunDriverFromBytes(bytes), openBunDriver(), openBunDriver(), {
  password,
  deviceName: 'Conversion check',
})
const convertMs = performance.now() - t0
const svcs = converted.store.svcs
const accounts = (await svcs.accounts.findAccountsAll()).map((a) => ({ id: a.id as string, acctType: a.acctType }))
const cents = (rows: { acctId: string; debit: number; credit: number }[]): Balance[] =>
  rows.map((r) => ({ acctId: r.acctId, debitCents: r.debit, creditCents: r.credit }))
const asOf: Record<string, Balance[]> = {}
for (const date of dates) asOf[date] = cents(await svcs.transactions.findAccountBalancesAsOf(date as IsoDate))
const periods: Record<string, Balance[]> = {}
for (const year of years) {
  periods[year] = cents(
    await svcs.transactions.findAccountBalancesForPeriod(`${year}-01-01` as IsoDate, `${year}-12-31` as IsoDate),
  )
}
const ours = reduceTotals(accounts, asOf, periods)
const diffs = differences(ours, reference.totals)

console.log(
  `converted ${converted.actions} actions in ${convertMs.toFixed(0)} ms; compared ${dates.length} dates and ` +
    `${years.length} years`,
)
if (reference.sheetMismatches.length > 0)
  console.log(`Checquery's own balance sheet disagreed on: ${reference.sheetMismatches.join(', ')}`)
if (diffs.length === 0) {
  console.log('PASS: the converted statements match Checquery’s.')
} else {
  console.log(`FAIL: ${diffs.length} differences (keys only):`)
  for (const d of diffs.slice(0, 50)) console.log(`  ${d}`)
  process.exitCode = 1
}
