// Reference totals from Checquery's own code: opens a copy of a .checquery file with openExistingFile (the
// server's open path: migrations, decryption, replay into the materialized store), asks its services for the
// balances, and reduces them with the spike's shared reduceTotals. Also checks that reduction against
// Checquery's own buildBalanceSheet net worth. Prints JSON to stdout; the caller keeps it in memory.
//
// Usage: bun spike/checquery/reference.ts <file> <dates,...> <years,...>   (password in SPIKE_REFERENCE_PASSWORD)

import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Balance, reduceTotals } from '../totals.ts'
import { checqueryDir } from './checquery.ts'

const [file, datesArg, yearsArg] = process.argv.slice(2)
if (!file || !datesArg || !yearsArg) throw new Error('usage: reference.ts <file> <dates> <years>')
const password = process.env.SPIKE_REFERENCE_PASSWORD ?? ''

const db = await import(`${checqueryDir}/packages/server/src/persistence/db.ts`)
const money = await import(`${checqueryDir}/packages/shared/src/domain/core/CurrencyAmt.ts`)
const sheet = await import(`${checqueryDir}/packages/client/src/balancesheet/buildBalanceSheet.ts`)

// Never open the original: openExistingFile runs migrations and records an origin.
const dir = mkdtempSync(join(tmpdir(), 'spike-reference-'))
const copy = join(dir, 'copy.checquery')
copyFileSync(file, copy)
try {
  const t0 = performance.now()
  const opened = await db.openExistingFile(copy, password, { name: 'spike-reference', ipAddress: '127.0.0.1' })
  if (!opened.ok) throw new Error(opened.error)
  const openMs = performance.now() - t0
  const svcs = opened.store.svcs
  const accounts = await svcs.accounts.findAccountsAll()
  const categories = await svcs.accountCategories.findAccountCategoriesAll()
  // biome-ignore lint/suspicious/noExplicitAny: Checquery's AccountBalance, loaded untyped.
  const toBalances = (rows: any[]): Balance[] =>
    rows.map((r) => ({ acctId: r.acctId, debitCents: money.toCents(r.debit), creditCents: money.toCents(r.credit) }))

  const asOf: Record<string, Balance[]> = {}
  const netWorthFromSheet: Record<string, number> = {}
  for (const date of datesArg.split(',')) {
    const rows = await svcs.transactions.findAccountBalancesAsOf(date)
    asOf[date] = toBalances(rows)
    netWorthFromSheet[date] = money.toCents(sheet.buildBalanceSheet(categories, accounts, rows, date).netWorth)
  }
  const periods: Record<string, Balance[]> = {}
  for (const year of yearsArg.split(',')) {
    periods[year] = toBalances(await svcs.transactions.findAccountBalancesForPeriod(`${year}-01-01`, `${year}-12-31`))
  }
  const totals = reduceTotals(
    // biome-ignore lint/suspicious/noExplicitAny: Checquery's Account, loaded untyped.
    accounts.map((a: any) => ({ id: a.id, acctType: a.acctType })),
    asOf,
    periods,
  )
  const sheetMismatches = Object.keys(netWorthFromSheet).filter(
    (d) => netWorthFromSheet[d] !== totals.asOf[d]?.netWorth,
  )
  db.closeCurrentFile()
  process.stdout.write(JSON.stringify({ openMs, totals, sheetMismatches }))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
