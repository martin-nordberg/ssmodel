import { describe, expect, it } from 'bun:test'
import { actionReadSchema } from '@/ledger/actions/Action.ts'
import { genActnId } from '@/ledger/actions/ActnId.ts'
import { getHLClock } from '@/ledger/core/HybridLogicalClock.ts'

describe('actionReadSchema', () => {
  it('parses a valid action', () => {
    const id = genActnId()
    const hlc = getHLClock('ABC')
    const action = actionReadSchema.parse({
      id,
      actionType: 'create-account',
      hlc,
      payload: { id: 'acct123', name: 'Checking' },
    })

    expect(action.id).toBe(id)
    expect(action.actionType).toBe('create-account')
    expect(action.hlc).toBe(hlc)
    expect(action.payload).toEqual({ id: 'acct123', name: 'Checking' })
  })

  it('accepts each of the 13 known action types', () => {
    const actionTypes = [
      'create-account',
      'update-account',
      'delete-account',
      'create-vendor',
      'update-vendor',
      'delete-vendor',
      'create-transaction',
      'update-transaction',
      'delete-transaction',
      'create-balance-assertion',
      'update-balance-assertion',
      'delete-balance-assertion',
      'create-origin',
    ]
    for (const actionType of actionTypes) {
      expect(() =>
        actionReadSchema.parse({
          id: genActnId(),
          actionType,
          hlc: getHLClock('ABC'),
          payload: {},
        }),
      ).not.toThrow()
    }
  })

  it('accepts arbitrary payload shapes (object, array, string, number, null)', () => {
    for (const payload of [{ a: 1 }, [1, 2, 3], 'text', 42, null]) {
      expect(() =>
        actionReadSchema.parse({
          id: genActnId(),
          actionType: 'create-origin',
          hlc: getHLClock('ABC'),
          payload,
        }),
      ).not.toThrow()
    }
  })

  describe('invalid id', () => {
    it('rejects a missing id', () => {
      expect(() =>
        actionReadSchema.parse({
          actionType: 'create-account',
          hlc: getHLClock('ABC'),
          payload: {},
        }),
      ).toThrow()
    })

    it('rejects an id with the wrong entity prefix', () => {
      expect(() =>
        actionReadSchema.parse({
          id: 'acctabcdefghij1234567890ab',
          actionType: 'create-account',
          hlc: getHLClock('ABC'),
          payload: {},
        }),
      ).toThrow()
    })
  })

  describe('invalid actionType', () => {
    it('rejects a missing actionType', () => {
      expect(() =>
        actionReadSchema.parse({
          id: genActnId(),
          hlc: getHLClock('ABC'),
          payload: {},
        }),
      ).toThrow()
    })

    it('rejects an unknown actionType value', () => {
      expect(() =>
        actionReadSchema.parse({
          id: genActnId(),
          actionType: 'not-a-real-action',
          hlc: getHLClock('ABC'),
          payload: {},
        }),
      ).toThrow()
    })
  })

  describe('invalid hlc', () => {
    it('rejects a missing hlc', () => {
      expect(() =>
        actionReadSchema.parse({
          id: genActnId(),
          actionType: 'create-account',
          payload: {},
        }),
      ).toThrow()
    })

    it('rejects a malformed hlc', () => {
      expect(() =>
        actionReadSchema.parse({
          id: genActnId(),
          actionType: 'create-account',
          hlc: 'not-valid',
          payload: {},
        }),
      ).toThrow()
    })
  })

  describe('payload', () => {
    it('rejects a missing payload key', () => {
      expect(() =>
        actionReadSchema.parse({
          id: genActnId(),
          actionType: 'create-account',
          hlc: getHLClock('ABC'),
        }),
      ).toThrow()
    })
  })

  describe('unknown properties', () => {
    it('rejects unknown properties', () => {
      expect(() =>
        actionReadSchema.parse({
          id: genActnId(),
          actionType: 'create-account',
          hlc: getHLClock('ABC'),
          payload: {},
          unknownField: 'should fail',
        }),
      ).toThrow()
    })
  })
})
