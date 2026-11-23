import { describe, expect, it } from 'bun:test'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { genAsrtId } from '@/ledger/balanceAssertions/AsrtId.ts'
import { getHLClock, type HLClock } from '@/ledger/core/HybridLogicalClock.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { genTxnId } from '@/ledger/transactions/TxnId.ts'
import { genVndrId } from '@/ledger/vendors/VndrId.ts'
import { ActionLog } from '@/store/actionLog/ActionLog.ts'
import { PlaintextCodec } from '@/store/actionLog/encryption/PlaintextCodec.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import { collect, createInMemoryActionLog, testAesCodec } from './inMemory.ts'

function rawInMemoryLog() {
  const db = openBunDriver()
  const codec = testAesCodec()
  const nodeId = 'AAA'
  const log = new ActionLog(db, codec, nodeId)
  return { db, codec, nodeId, log }
}

/** A typed test fixture -- routing literals through this (rather than passing them inline) avoids a known
 * TypeScript quirk where a fresh object literal gets excess-property-checked against a generic constraint
 * rather than against its own inferred type. Defaults `id` to a fresh OrigId since every test here appends
 * 'create-origin' actions unless it overrides it. */
function fixture(fields: { id?: string; name?: string; ipAddress?: string; hlc?: HLClock }) {
  return { id: fields.id ?? genOrigId(), ...fields }
}

describe('appendAction', () => {
  it('generates a fresh hlc for an event with none', async () => {
    const log = createInMemoryActionLog()
    const result = await log.appendAction('create-origin', fixture({ name: 'Jane', ipAddress: '1.2.3.4' }))
    expect(result.hlc).toBeDefined()
  })

  it('generates strictly increasing hlcs across successive calls', async () => {
    const log = createInMemoryActionLog()
    const first = await log.appendAction('create-origin', fixture({ name: 'A' }))
    const second = await log.appendAction('create-origin', fixture({ name: 'B' }))
    const third = await log.appendAction('create-origin', fixture({ name: 'C' }))
    expect(first.hlc! < second.hlc!).toBe(true)
    expect(second.hlc! < third.hlc!).toBe(true)
  })

  it('uses an already-present hlc as-is rather than replacing it', async () => {
    const log = createInMemoryActionLog()
    const externalHlc = getHLClock('DEF')
    const result = await log.appendAction('create-origin', fixture({ name: 'Remote', hlc: externalHlc }))
    expect(result.hlc).toBe(externalHlc)
  })

  it('merges an externally-supplied hlc into the master clock', async () => {
    const log = createInMemoryActionLog({ nodeId: 'AAA' })
    // A far-future ms component (real "now" will never catch up to it in this test run), zero counter.
    const farFutureHlc = 'FFFFFFFFFF000DEF' as HLClock
    const merged = await log.appendAction('create-origin', fixture({ name: 'Remote', hlc: farFutureHlc }))
    expect(merged.hlc).toBe(farFutureHlc)

    const next = await log.appendAction('create-origin', fixture({ name: 'Local' }))
    // The master must have advanced past the merged-in external hlc, not reset to the local clock's own pace.
    expect(next.hlc! > farFutureHlc).toBe(true)
    expect(next.hlc!.startsWith('FFFFFFFFFF')).toBe(true)
  })

  it('records the entity id in the right lookup table', async () => {
    const { db, log } = rawInMemoryLog()
    const acctId = genAcctId()
    await log.appendAction('create-account', fixture({ id: acctId }))

    const row = db.get(`SELECT acct_id FROM account_actions`) as { acct_id: string }
    expect(row.acct_id).toBe(acctId)
  })
})

describe('readActions', () => {
  it('returns actions oldest-first with their decrypted payload', async () => {
    const log = createInMemoryActionLog()
    await log.appendAction('create-origin', fixture({ name: 'first' }))
    await log.appendAction('create-origin', fixture({ name: 'second' }))
    await log.appendAction('create-origin', fixture({ name: 'third' }))

    const actions = await collect(log.readActions())
    expect(actions).toHaveLength(3)
    expect(actions.map((a) => (a.payload as { name: string }).name)).toEqual(['first', 'second', 'third'])
    expect(actions.every((a) => a.actionType === 'create-origin')).toBe(true)
    expect(actions[0]!.hlc < actions[1]!.hlc && actions[1]!.hlc < actions[2]!.hlc).toBe(true)
  })

  it('respects afterHlc, returning only strictly later actions', async () => {
    const log = createInMemoryActionLog()
    await log.appendAction('create-origin', fixture({ name: 'first' }))
    const second = await log.appendAction('create-origin', fixture({ name: 'second' }))
    await log.appendAction('create-origin', fixture({ name: 'third' }))

    const actions = await collect(log.readActions(second.hlc))
    expect(actions.map((a) => (a.payload as { name: string }).name)).toEqual(['third'])
  })

  it('returns nothing for an empty log', async () => {
    const log = createInMemoryActionLog()
    expect(await collect(log.readActions())).toEqual([])
  })

  it('throws, naming the offending row, when a payload has been tampered with', async () => {
    const { db, log } = rawInMemoryLog()
    const appended = await log.appendAction('create-origin', fixture({ name: 'victim' }))

    db.run(`UPDATE actions SET encrypted_payload = 'bm90LXZhbGlkLWNpcGhlcnRleHQ=' WHERE hlc = ?`, [
      appended.hlc as string,
    ])

    await expect(collect(log.readActions())).rejects.toThrow(new RegExp(appended.hlc as string))
  })
})

describe('countActions', () => {
  it('is 0 for an empty log', () => {
    const log = createInMemoryActionLog()
    expect(log.countActions()).toBe(0)
  })

  it('counts every appended action, regardless of type', async () => {
    const log = createInMemoryActionLog()
    await log.appendAction('create-origin', fixture({ name: 'first' }))
    await log.appendAction('create-origin', fixture({ name: 'second' }))
    expect(log.countActions()).toBe(2)
  })
})

describe('readActionsForXxx (per-entity lookup)', () => {
  it("readActionsForAccount returns only that account's own actions, in hlc order", async () => {
    const log = createInMemoryActionLog()
    const acctId1 = genAcctId()
    const acctId2 = genAcctId()

    const created = await log.appendAction('create-account', fixture({ id: acctId1 }))
    const patched = await log.appendAction('update-account', fixture({ id: acctId1 }))
    await log.appendAction('create-account', fixture({ id: acctId2 })) // a different account, must not show up
    await log.appendAction('create-origin', fixture({ name: 'unrelated' })) // a different entity type entirely

    const actions = await collect(log.readActionsForAccount(acctId1))
    expect(actions).toHaveLength(2)
    expect(actions.map((a) => a.actionType)).toEqual(['create-account', 'update-account'])
    expect(actions[0]!.hlc).toBe(created.hlc!)
    expect(actions[1]!.hlc).toBe(patched.hlc!)
  })

  it("readActionsForOrigin returns only that origin's own actions", async () => {
    const log = createInMemoryActionLog()
    const origId1 = genOrigId()
    const origId2 = genOrigId()

    await log.appendAction('create-origin', fixture({ id: origId1, name: 'first' }))
    await log.appendAction('create-origin', fixture({ id: origId2, name: 'second' }))

    const actions = await collect(log.readActionsForOrigin(origId1))
    expect(actions).toHaveLength(1)
    expect((actions[0]!.payload as { name: string }).name).toBe('first')
  })

  it('returns nothing for an entity with no actions', async () => {
    const log = createInMemoryActionLog()
    expect(await collect(log.readActionsForAccount(genAcctId()))).toEqual([])
  })

  it('readActionsForVendor / readActionsForTransaction / readActionsForBalanceAssertion each isolate their own entity', async () => {
    const log = createInMemoryActionLog()
    const vndrId1 = genVndrId()
    const vndrId2 = genVndrId()
    const txnId1 = genTxnId()
    const asrtId1 = genAsrtId()

    await log.appendAction('create-vendor', fixture({ id: vndrId1 }))
    await log.appendAction('delete-vendor', fixture({ id: vndrId1 }))
    await log.appendAction('create-vendor', fixture({ id: vndrId2 }))

    await log.appendAction('create-transaction', fixture({ id: txnId1 }))
    await log.appendAction('create-balance-assertion', fixture({ id: asrtId1 }))

    const vendorActions = await collect(log.readActionsForVendor(vndrId1))
    expect(vendorActions.map((a) => a.actionType)).toEqual(['create-vendor', 'delete-vendor'])

    const transactionActions = await collect(log.readActionsForTransaction(txnId1))
    expect(transactionActions).toHaveLength(1)
    expect(transactionActions[0]!.actionType).toBe('create-transaction')

    const balanceAssertionActions = await collect(log.readActionsForBalanceAssertion(asrtId1))
    expect(balanceAssertionActions).toHaveLength(1)
    expect(balanceAssertionActions[0]!.actionType).toBe('create-balance-assertion')
  })
})

describe('replayInto', () => {
  it('dispatches create-origin to the target createOrigin method', async () => {
    const log = createInMemoryActionLog()
    await log.appendAction('create-origin', fixture({ name: 'Jane', ipAddress: '1.2.3.4' }))

    const calls: unknown[] = []
    const target = {
      accounts: {} as never,
      vendors: {} as never,
      transactions: {} as never,
      balanceAssertions: {} as never,
      origins: {
        createOrigin: async (e: unknown) => {
          calls.push(e)
          return e
        },
      },
    }

    await log.replayInto(target as never)
    expect(calls).toHaveLength(1)
    expect((calls[0] as { name: string }).name).toBe('Jane')
  })
})

describe('codec is a swappable link, not something ActionLog cares about', () => {
  it('works end-to-end with PlaintextCodec, with no encryption involved', async () => {
    const log = createInMemoryActionLog({ codec: new PlaintextCodec() })
    await log.appendAction('create-origin', fixture({ name: 'Jane' }))

    const [action] = await collect(log.readActions())
    expect((action!.payload as { name: string }).name).toBe('Jane')
  })

  it('stores the row as literal, human-readable JSON when the codec is plaintext', async () => {
    const { db } = rawInMemoryLog()
    const log = new ActionLog(db, new PlaintextCodec(), 'AAA')
    await log.appendAction('create-origin', fixture({ name: 'Jane' }))

    const row = db.get(`SELECT iv, encrypted_payload FROM actions`) as { iv: string; encrypted_payload: string }
    expect(row.iv).toBe('')
    expect(row.encrypted_payload).toContain('"name":"Jane"')
  })
})

describe('multiple simultaneous ActionLogs', () => {
  it('two independently-keyed logs do not interfere with each other', async () => {
    const logA = createInMemoryActionLog()
    const logB = createInMemoryActionLog()

    await logA.appendAction('create-origin', fixture({ name: 'a1' }))
    await logA.appendAction('create-origin', fixture({ name: 'a2' }))
    await logB.appendAction('create-origin', fixture({ name: 'b1' }))

    expect(await collect(logA.readActions())).toHaveLength(2)
    expect(await collect(logB.readActions())).toHaveLength(1)
  })
})

describe('master hlc bootstrap', () => {
  it('resumes from the existing max hlc when re-wrapping the same database', async () => {
    const db = openBunDriver()
    const codec = testAesCodec()
    const nodeId = 'AAA'

    const firstSession = new ActionLog(db, codec, nodeId)
    const lastOfFirstSession = await firstSession.appendAction('create-origin', fixture({ name: 'before close' }))

    // Simulates closing and reopening the same file: a fresh ActionLog wrapping the same populated db.
    const secondSession = new ActionLog(db, codec, nodeId)
    const firstOfSecondSession = await secondSession.appendAction('create-origin', fixture({ name: 'after reopen' }))

    expect(firstOfSecondSession.hlc! > lastOfFirstSession.hlc!).toBe(true)
  })
})
