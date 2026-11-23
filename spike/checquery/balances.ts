// Reference balances from Checquery's own code for a synthetic fixture, for the P1.5 parity unit test
// (test/store/ledger/parity.test.ts). Opens a copy with openExistingFile (migrations, decryption, replay), then
// records the accounts, the categories, raw per-account balances as of several dates and for several periods, and
// buildBalanceSheet's net worth. Synthetic fixtures only; amounts are written to the output file.
//
// Usage: bun spike/checquery/balances.ts <fixture.checquery> <password> <out.json>

import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checqueryDir } from './checquery.ts'

const [file, password, out] = process.argv.slice(2)
if (!file || !password || !out) throw new Error('usage: balances.ts <fixture> <password> <out.json>')

const db = await import(`${checqueryDir}/packages/server/src/persistence/db.ts`)
const money = await import(`${checqueryDir}/packages/shared/src/domain/core/CurrencyAmt.ts`)
const sheet = await import(`${checqueryDir}/packages/client/src/balancesheet/buildBalanceSheet.ts`)

export const asOfDates = [
  '2025-06-30',
  '2025-07-15',
  '2025-07-31',
  '2025-08-31',
  '2025-09-30',
  '2025-10-31',
  '2025-12-31',
  '2026-12-31',
]
export const periods: [string, string][] = [
  ['2025-07-01', '2025-07-31'],
  ['2025-08-01', '2025-08-31'],
  ['2025-09-01', '2025-09-30'],
  ['2025-10-01', '2025-10-31'],
  ['2025-07-10', '2025-08-20'],
  ['2025-01-01', '2025-12-31'],
  ['2026-01-01', '2026-12-31'],
]

const dir = mkdtempSync(join(tmpdir(), 'balances-'))
const copy = join(dir, 'copy.checquery')
copyFileSync(file, copy)
try {
  const opened = await db.openExistingFile(copy, password, { name: 'reference', ipAddress: '127.0.0.1' })
  if (!opened.ok) throw new Error(opened.error)
  const svcs = opened.store.svcs
  const accounts = await svcs.accounts.findAccountsAll()
  const categories = await svcs.accountCategories.findAccountCategoriesAll()
  // biome-ignore lint/suspicious/noExplicitAny: Checquery's AccountBalance, loaded untyped.
  const cents = (rows: any[]) =>
    rows
      .map((r) => ({ acctId: r.acctId, debit: money.toCents(r.debit), credit: money.toCents(r.credit) }))
      .sort((a, b) => a.acctId.localeCompare(b.acctId))
  const asOf: Record<string, unknown> = {}
  const netWorth: Record<string, number> = {}
  for (const date of asOfDates) {
    const rows = await svcs.transactions.findAccountBalancesAsOf(date)
    asOf[date] = cents(rows)
    netWorth[date] = money.toCents(sheet.buildBalanceSheet(categories, accounts, rows, date).netWorth)
  }
  const forPeriod: Record<string, unknown> = {}
  for (const [start, end] of periods) {
    forPeriod[`${start}..${end}`] = cents(await svcs.transactions.findAccountBalancesForPeriod(start, end))
  }
  db.closeCurrentFile()
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        // biome-ignore lint/suspicious/noExplicitAny: Checquery's Account, loaded untyped.
        accounts: accounts.map((a: any) => ({
          id: a.id,
          acctType: a.acctType,
          name: a.name,
          parentCtgId: a.parentCtgId,
        })),
        // biome-ignore lint/suspicious/noExplicitAny: Checquery's AccountCategory, loaded untyped.
        categories: categories.map((c: any) => ({
          id: c.id,
          acctType: c.acctType,
          name: c.name,
          parentCtgId: c.parentCtgId ?? null,
        })),
        asOf,
        forPeriod,
        netWorth,
      },
      null,
      1,
    )}\n`,
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}
