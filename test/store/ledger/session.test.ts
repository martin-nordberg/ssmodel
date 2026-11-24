import { describe, expect, test } from 'bun:test'
import { genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import { acctCtgIdAssets } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { createLedgerFile } from '@/store/ledger/ledgerFile.ts'
import { type Change, InvalidRequestError, LedgerSession } from '@/store/ledger/session.ts'
import { collect } from '../actionLog/inMemory.ts'

// NFR-ARCH-8, FR-LED-4: the store worker's session logic, without the worker.

async function newSession() {
  const opened = await createLedgerFile(openBunDriver(), openBunDriver(), { password: undefined, deviceName: 'Laptop' })
  const changes: Change[] = []
  const session = new LedgerSession(opened.store, opened.origId, (c) => changes.push(c))
  return { session, changes, opened }
}

const category = (id = genAcctCtgId()) => ({
  id,
  parentCtgId: acctCtgIdAssets,
  acctType: 'ASSET',
  name: `Bank ${id.slice(-8)}`,
})

describe('LedgerSession', () => {
  test('a command is validated, stamped with the origin, stored, and reported', async () => {
    const { session, changes, opened } = await newSession()
    const ctgId = genAcctCtgId()
    await session.command('accountCategories', 'createAccountCategory', category(ctgId))
    const acctId = genAcctId()
    await session.command('accounts', 'createAccount', {
      id: acctId,
      parentCtgId: ctgId,
      acctType: 'ASSET',
      name: 'Checking',
    })
    expect(changes).toEqual([
      { entity: 'accountCategories', op: 'create', id: ctgId },
      { entity: 'accounts', op: 'create', id: acctId },
    ])
    const account = await session.query('accounts', 'findAccountById', [acctId])
    expect(account).toMatchObject({ name: 'Checking', origId: opened.origId })
    const [action] = (await collect(opened.store.actionLog.readActionsForAccount(acctId))) as { payload: unknown }[]
    expect(action?.payload).toMatchObject({ origId: opened.origId })
  })

  test("the session's origin wins over one in the input", async () => {
    const { session, opened } = await newSession()
    const id = genAcctCtgId()
    await session.command('accountCategories', 'createAccountCategory', { ...category(id), origId: 'orig-spoofed' })
    expect(await session.query('accountCategories', 'findAccountCategoryById', [id])).toMatchObject({
      origId: opened.origId,
    })
  })

  test('commands run one at a time, in the order sent', async () => {
    const { session, changes } = await newSession()
    const ids = Array.from({ length: 20 }, () => genAcctCtgId())
    await Promise.all(ids.map((id) => session.command('accountCategories', 'createAccountCategory', category(id))))
    expect(changes.map((c) => c.id)).toEqual(ids)
  })

  test('an invalid command is refused without a change, and later commands still run', async () => {
    const { session, changes } = await newSession()
    const bad = session.command('accountCategories', 'createAccountCategory', { ...category(), name: '' })
    const good = session.command('accountCategories', 'createAccountCategory', category())
    await expect(bad).rejects.toBeInstanceOf(InvalidRequestError)
    await good
    expect(changes).toHaveLength(1)
  })

  test('refuses unknown methods, origin commands and commands sent as queries', async () => {
    const { session } = await newSession()
    await expect(session.query('accounts', 'dropEverything', [])).rejects.toBeInstanceOf(InvalidRequestError)
    await expect(session.query('nope', 'findAll', [])).rejects.toBeInstanceOf(InvalidRequestError)
    await expect(session.query('accounts', 'createAccount', [{}])).rejects.toBeInstanceOf(InvalidRequestError)
    await expect(session.command('origins', 'createOrigin', { name: 'x' })).rejects.toBeInstanceOf(InvalidRequestError)
  })
})
