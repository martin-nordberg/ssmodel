import { describe, expect, test } from 'bun:test'
import { acctCtgIdAssets, acctCtgIdExpenses } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { findById, inverse, type LedgerCommand } from '@/ledger/compensation.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { createLedgerFile } from '@/store/ledger/ledgerFile.ts'
import { LedgerSession } from '@/store/ledger/session.ts'

// Plan P2.7: undo and redo by compensating actions appended to the change log.

const id = (prefix: string, name: string) => `${prefix}${name.padEnd(24, '0').slice(0, 24)}`

async function setup() {
  const opened = await createLedgerFile(openBunDriver(), openBunDriver(), { password: undefined, deviceName: 'Test' })
  const s = new LedgerSession(opened.store, opened.origId, () => {})
  /** Runs a command the way the undo manager does: reads the prior state, runs it, returns its inverse. */
  const run = async (cmd: LedgerCommand) => {
    const prior = cmd.method.startsWith('create')
      ? null
      : ((await s.query(cmd.entity, findById[cmd.entity], [cmd.input.id])) as Record<string, unknown> | null)
    await s.command(cmd.entity, cmd.method, cmd.input)
    return inverse(cmd, prior)
  }
  const apply = async (cmds: LedgerCommand[]) => {
    for (const c of cmds) await s.command(c.entity, c.method, c.input)
  }
  const get = (entity: LedgerCommand['entity'], itemId: string) => s.query(entity, findById[entity], [itemId])
  return { s, run, apply, get }
}

describe('inverse (pure)', () => {
  test('create ↔ delete, and a patch restores only the fields it changed', () => {
    expect(inverse({ entity: 'vendors', method: 'createVendor', input: { id: 'v1', name: 'A' } }, null)).toEqual([
      { entity: 'vendors', method: 'deleteVendor', input: { id: 'v1' } },
    ])
    expect(
      inverse(
        { entity: 'vendors', method: 'deleteVendor', input: { id: 'v1' } },
        { id: 'v1', origId: 'o', name: 'A', isActive: true, defaultAcctId: undefined },
      ),
    ).toEqual([{ entity: 'vendors', method: 'createVendor', input: { id: 'v1', name: 'A', isActive: true } }])
    expect(
      inverse(
        {
          entity: 'transactions',
          method: 'patchTransaction',
          input: { id: 't1', description: 'New', clearedDate: '2026-01-02' },
        },
        { id: 't1', description: 'Old', clearedDate: undefined, code: '7' },
      ),
    ).toEqual([
      {
        entity: 'transactions',
        method: 'patchTransaction',
        input: { id: 't1', description: 'Old', clearedDate: null },
      },
    ])
    expect(() => inverse({ entity: 'vendors', method: 'deleteVendor', input: { id: 'v1' } }, null)).toThrow()
  })
})

describe('compensating actions against the store', () => {
  test('undo and redo a category create, an account rename and move', async () => {
    const { s, run, apply, get } = await setup()
    const undoCtg = await run({
      entity: 'accountCategories',
      method: 'createAccountCategory',
      input: { id: id('actg', 'bank'), parentCtgId: acctCtgIdAssets, acctType: 'ASSET', name: 'Bank' },
    })
    await run({
      entity: 'accountCategories',
      method: 'createAccountCategory',
      input: { id: id('actg', 'cu'), parentCtgId: acctCtgIdAssets, acctType: 'ASSET', name: 'Credit union' },
    })
    await run({
      entity: 'accounts',
      method: 'createAccount',
      input: { id: id('acct', 'chk'), parentCtgId: id('actg', 'bank'), acctType: 'ASSET', name: 'Checking' },
    })
    const undoMove = await run({
      entity: 'accounts',
      method: 'patchAccount',
      input: { id: id('acct', 'chk'), name: 'Everyday', parentCtgId: id('actg', 'cu') },
    })
    await apply(undoMove)
    expect(await get('accounts', id('acct', 'chk'))).toMatchObject({
      name: 'Checking',
      parentCtgId: id('actg', 'bank'),
    })

    // Undo a create (after its account moves out): the category is deleted.
    await apply([
      { entity: 'accounts', method: 'patchAccount', input: { id: id('acct', 'chk'), parentCtgId: id('actg', 'cu') } },
    ])
    await apply(undoCtg)
    const live = (await s.query('accountCategories', 'findAccountCategoriesAll', [])) as { id: string }[]
    expect(live.map((c) => c.id)).not.toContain(id('actg', 'bank'))
  })

  test('undo a transaction delete restores it with its entries, repeatedly (undo, redo, undo)', async () => {
    const { s, run, apply } = await setup()
    await s.command('accountCategories', 'createAccountCategory', {
      id: id('actg', 'bank'),
      parentCtgId: acctCtgIdAssets,
      acctType: 'ASSET',
      name: 'Bank',
    })
    await s.command('accountCategories', 'createAccountCategory', {
      id: id('actg', 'food'),
      parentCtgId: acctCtgIdExpenses,
      acctType: 'EXPENSE',
      name: 'Food',
    })
    await s.command('accounts', 'createAccount', {
      id: id('acct', 'chk'),
      parentCtgId: id('actg', 'bank'),
      acctType: 'ASSET',
      name: 'Checking',
    })
    await s.command('accounts', 'createAccount', {
      id: id('acct', 'gro'),
      parentCtgId: id('actg', 'food'),
      acctType: 'EXPENSE',
      name: 'Groceries',
    })
    const txn = {
      id: id('trxn', 'one'),
      postDate: '2026-01-05',
      clearedDate: '2026-01-07',
      description: 'Groceries',
      entries: [
        { acctId: id('acct', 'gro'), debit: 5000, credit: 0 },
        { acctId: id('acct', 'chk'), debit: 0, credit: 5000 },
      ],
    }
    await s.command('transactions', 'createTransaction', txn)
    const del: LedgerCommand = { entity: 'transactions', method: 'deleteTransaction', input: { id: txn.id } }
    const undoDelete = await run(del)
    const live = () => s.query('transactions', 'findTransactionsByAccount', [id('acct', 'chk')]) as Promise<unknown[]>
    expect(await live()).toHaveLength(0)
    await apply(undoDelete) // undo
    expect(await live()).toEqual([
      expect.objectContaining({ id: txn.id, clearedDate: '2026-01-07', entries: txn.entries }),
    ])
    await apply([del]) // redo
    expect(await live()).toHaveLength(0)
    await apply(undoDelete) // undo again
    expect(await live()).toHaveLength(1)

    // A split edit is undone exactly, including clearing a field the edit set.
    const undoSplit = await run({
      entity: 'transactions',
      method: 'patchTransaction',
      input: {
        id: txn.id,
        clearedDate: null,
        entries: [
          { acctId: id('acct', 'gro'), debit: 3000, credit: 0 },
          { acctId: id('acct', 'chk'), debit: 0, credit: 3000 },
        ],
      },
    })
    await apply(undoSplit)
    expect(await live()).toEqual([expect.objectContaining({ clearedDate: '2026-01-07', entries: txn.entries })])
  })
})
