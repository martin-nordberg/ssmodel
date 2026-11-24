import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'
import { readContentVersion } from '@/store/actionLog/meta.ts'
import { openBunDriver, openBunDriverFromBytes } from '@/store/driver/bunSqlite.ts'
import { convertChecquery } from '@/store/ledger/convertChecquery.ts'
import { inspectLedgerFile, openLedgerFile } from '@/store/ledger/ledgerFile.ts'

// FR-MIG-1, NFR-TEST-9: the synthetic Checquery fixture converts to a .plens file whose accounts, categories and
// statements match Checquery's own (small.balances.json, from spike/checquery/balances.ts).

const dir = new URL('../../fixtures/checquery/', import.meta.url).pathname
const bytes = readFileSync(`${dir}small.checquery`)
const reference = JSON.parse(readFileSync(`${dir}small.reference.json`, 'utf8')) as {
  password: string
  actions: number
}
type Row = { acctId: string; debit: number; credit: number }
const balances = JSON.parse(readFileSync(`${dir}small.balances.json`, 'utf8')) as {
  accounts: { id: string; acctType: string; name: string; parentCtgId: string }[]
  asOf: Record<string, Row[]>
  forPeriod: Record<string, Row[]>
  netWorth: Record<string, number>
}

const sorted = (rows: { acctId: string; debit: number; credit: number }[]) =>
  rows
    .map((r) => ({ acctId: r.acctId, debit: r.debit, credit: r.credit }))
    .sort((a, b) => a.acctId.localeCompare(b.acctId))

async function convert(newPassword?: string) {
  const dst = openBunDriver()
  const result = await convertChecquery(openBunDriverFromBytes(bytes), dst, openBunDriver(), {
    password: reference.password,
    ...(newPassword !== undefined ? { newPassword } : {}),
    deviceName: 'Laptop',
  })
  return { dst, result }
}

describe('converting a Checquery file', () => {
  test('copies every action into a new ProvisionLens file at the latest version, with a recovery key', async () => {
    const { dst, result } = await convert()
    expect(result.actions).toBe(reference.actions)
    expect(result.recoveryWords).toHaveLength(24)
    const info = inspectLedgerFile(dst)
    expect(info).toMatchObject({ encrypted: true, needsMigration: false })
    expect(info.fileId).not.toBe(inspectLedgerFile(openBunDriverFromBytes(bytes)).fileId)
    expect(readContentVersion(dst)).toBeGreaterThanOrEqual(reference.actions)
  })

  test('the converted statements match Checquery’s', async () => {
    const { result } = await convert()
    const svcs = result.store.svcs
    const accounts = await svcs.accounts.findAccountsAll()
    expect(
      accounts.map((a) => ({ id: a.id, acctType: a.acctType, name: a.name, parentCtgId: a.parentCtgId })) as unknown,
    ).toEqual(balances.accounts)
    for (const [date, expected] of Object.entries(balances.asOf)) {
      expect([date, sorted(await svcs.transactions.findAccountBalancesAsOf(date as IsoDate))]).toEqual([date, expected])
    }
    for (const [period, expected] of Object.entries(balances.forPeriod)) {
      const [start, end] = period.split('..') as [IsoDate, IsoDate]
      expect([period, sorted(await svcs.transactions.findAccountBalancesForPeriod(start, end))]).toEqual([
        period,
        expected,
      ])
    }
  })

  test('the new file reopens with the password (or a new one), and the original is untouched', async () => {
    const before = Buffer.from(bytes).toString('base64')
    const { dst } = await convert('a new password')
    const reopened = await openLedgerFile(openBunDriverFromBytes(dst.exportBytes()), openBunDriver(), {
      password: 'a new password',
      deviceName: 'Laptop',
      allowMigration: false,
    })
    expect(await reopened.store.svcs.transactions.countTransactionsAll()).toBeGreaterThan(50)
    expect(Buffer.from(bytes).toString('base64')).toBe(before)
  })

  test('a wrong password is refused', async () => {
    await expect(
      convertChecquery(openBunDriverFromBytes(bytes), openBunDriver(), openBunDriver(), {
        password: 'wrong',
        deviceName: 'Laptop',
      }),
    ).rejects.toMatchObject({ code: 'wrong-password' })
  })
})
