import { describe, expect, test } from 'bun:test'
import { genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import { acctCtgIdAssets, acctCtgIdExpenses } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { acctIdNetWorth } from '@/ledger/accounts/NetWorthAccount.ts'
import { genTxnId } from '@/ledger/transactions/TxnId.ts'
import { genVndrId } from '@/ledger/vendors/VndrId.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { createLedgerFile } from '@/store/ledger/ledgerFile.ts'
import { InvalidRequestError, LedgerSession } from '@/store/ledger/session.ts'

// FR-LED-1: the ledger's structural rules, enforced by the store session for every client.

async function setup() {
  const opened = await createLedgerFile(openBunDriver(), openBunDriver(), { password: undefined, deviceName: 'Laptop' })
  const s = new LedgerSession(opened.store, opened.origId, () => {})
  const bank = genAcctCtgId()
  const food = genAcctCtgId()
  const checking = genAcctId()
  const groceries = genAcctId()
  await s.command('accountCategories', 'createAccountCategory', {
    id: bank,
    parentCtgId: acctCtgIdAssets,
    acctType: 'ASSET',
    name: 'Bank',
  })
  await s.command('accountCategories', 'createAccountCategory', {
    id: food,
    parentCtgId: acctCtgIdExpenses,
    acctType: 'EXPENSE',
    name: 'Food',
  })
  await s.command('accounts', 'createAccount', { id: checking, parentCtgId: bank, acctType: 'ASSET', name: 'Checking' })
  await s.command('accounts', 'createAccount', {
    id: groceries,
    parentCtgId: food,
    acctType: 'EXPENSE',
    name: 'Groceries',
  })
  return { s, bank, food, checking, groceries }
}

async function refused(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (err) {
    expect(err).toBeInstanceOf(InvalidRequestError)
    return (err as Error).message
  }
  throw new Error('expected the command to be refused')
}

describe('accounts and categories', () => {
  test('names are unique among siblings, ignoring case, across accounts and categories', async () => {
    const { s, bank } = await setup()
    expect(
      await refused(
        s.command('accounts', 'createAccount', {
          id: genAcctId(),
          parentCtgId: bank,
          acctType: 'ASSET',
          name: 'checking',
        }),
      ),
    ).toContain('already an account or category named')
    expect(
      await refused(
        s.command('accountCategories', 'createAccountCategory', {
          id: genAcctCtgId(),
          parentCtgId: bank,
          acctType: 'ASSET',
          name: 'Checking',
        }),
      ),
    ).toContain('already')
    // The same name under another parent is fine.
    await s.command('accountCategories', 'createAccountCategory', {
      id: genAcctCtgId(),
      parentCtgId: acctCtgIdAssets,
      acctType: 'ASSET',
      name: 'Checking',
    })
  })

  test('items stay under a category of their own type', async () => {
    const { s, bank, food, checking } = await setup()
    expect(await refused(s.command('accounts', 'patchAccount', { id: checking, parentCtgId: food }))).toContain(
      'same type',
    )
    expect(
      await refused(s.command('accountCategories', 'patchAccountCategory', { id: bank, parentCtgId: food })),
    ).toContain('same type')
    expect(
      await refused(
        s.command('accounts', 'createAccount', {
          id: genAcctId(),
          parentCtgId: genAcctCtgId(),
          acctType: 'ASSET',
          name: 'X',
        }),
      ),
    ).toContain('no longer exists')
  })

  test('a category can’t move inside itself or its descendants', async () => {
    const { s, bank } = await setup()
    const sub = genAcctCtgId()
    await s.command('accountCategories', 'createAccountCategory', {
      id: sub,
      parentCtgId: bank,
      acctType: 'ASSET',
      name: 'Sub',
    })
    expect(
      await refused(s.command('accountCategories', 'patchAccountCategory', { id: bank, parentCtgId: sub })),
    ).toContain('inside itself')
    // Moving the child up to the root is fine.
    await s.command('accountCategories', 'patchAccountCategory', { id: sub, parentCtgId: acctCtgIdAssets })
  })

  test('things in use can’t be deleted; empty ones can', async () => {
    const { s, bank, checking, groceries } = await setup()
    expect(await refused(s.command('accountCategories', 'deleteAccountCategory', { id: bank }))).toContain('still has')
    await s.command('transactions', 'createTransaction', {
      id: genTxnId(),
      postDate: '2026-01-05',
      description: 'Groceries',
      entries: [
        { acctId: groceries, debit: 1000 },
        { acctId: checking, credit: 1000 },
      ],
    })
    expect(await refused(s.command('accounts', 'deleteAccount', { id: checking }))).toContain('can’t be deleted')
    const spare = genAcctId()
    await s.command('accounts', 'createAccount', { id: spare, parentCtgId: bank, acctType: 'ASSET', name: 'Spare' })
    await s.command('accounts', 'deleteAccount', { id: spare })
  })

  test('Net Worth can’t be changed or deleted', async () => {
    const { s } = await setup()
    expect(await refused(s.command('accounts', 'patchAccount', { id: acctIdNetWorth, name: 'Equity' }))).toContain(
      'Net Worth',
    )
    expect(await refused(s.command('accounts', 'deleteAccount', { id: acctIdNetWorth }))).toContain('Net Worth')
  })
})

describe('vendors and references', () => {
  test('vendor names are unique and default accounts must exist; vendors in use can’t be deleted', async () => {
    const { s, checking, groceries } = await setup()
    const grocer = genVndrId()
    await s.command('vendors', 'createVendor', { id: grocer, name: 'Corner Grocer', defaultAcctId: groceries })
    expect(await refused(s.command('vendors', 'createVendor', { id: genVndrId(), name: 'corner grocer' }))).toContain(
      'already a vendor',
    )
    expect(await refused(s.command('vendors', 'patchVendor', { id: grocer, defaultAcctId: genAcctId() }))).toContain(
      'no longer exists',
    )
    await s.command('transactions', 'createTransaction', {
      id: genTxnId(),
      postDate: '2026-01-05',
      vndrId: grocer,
      entries: [
        { acctId: groceries, debit: 1000 },
        { acctId: checking, credit: 1000 },
      ],
    })
    expect(await refused(s.command('vendors', 'deleteVendor', { id: grocer }))).toContain('inactive')
  })

  test('transactions refer only to live accounts and vendors', async () => {
    const { s, checking } = await setup()
    const entries = [
      { acctId: genAcctId(), debit: 1000 },
      { acctId: checking, credit: 1000 },
    ]
    expect(
      await refused(
        s.command('transactions', 'createTransaction', {
          id: genTxnId(),
          postDate: '2026-01-05',
          description: 'x',
          entries,
        }),
      ),
    ).toContain('account')
  })
})
