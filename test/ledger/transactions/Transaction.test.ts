import { describe, expect, it } from 'bun:test'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { getHLClock } from '@/ledger/core/HybridLogicalClock.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import {
  transactionBeforeEntriesSchema,
  transactionCreationEventSchema,
  transactionDate,
  transactionDeletionEventSchema,
  transactionPatchEventSchema,
  transactionReadSchema,
} from '@/ledger/transactions/Transaction.ts'
import { genTxnId } from '@/ledger/transactions/TxnId.ts'
import { genVndrId } from '@/ledger/vendors/VndrId.ts'

const validEntries = [
  { acctId: genAcctId(), debit: '$100.00', credit: '$0.00' },
  { acctId: genAcctId(), debit: '$0.00', credit: '$100.00' },
]

describe('transactionReadSchema', () => {
  describe('valid transactions', () => {
    it('parses a transaction with required fields and a vendor', () => {
      const id = genTxnId()
      const origId = genOrigId()
      const vndrId = genVndrId()
      const txn = transactionReadSchema.parse({
        id,
        origId,
        postDate: '2026-01-15',
        code: '',
        vndrId,
        description: '',
        needsReview: false,
        entries: validEntries,
      })

      expect(txn.id).toBe(id)
      expect(txn.origId).toBe(origId)
      expect(txn.postDate as string).toBe('2026-01-15')
      expect(txn.vndrId).toBe(vndrId)
      expect(txn.entries).toHaveLength(2)
    })

    it('parses a transaction with a description instead of a vendor', () => {
      const txn = transactionReadSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        code: '',
        description: 'Monthly payment',
        needsReview: false,
        entries: validEntries,
      })

      expect(txn.description as string).toBe('Monthly payment')
      expect(txn.vndrId).toBeUndefined()
    })

    it('parses a transaction with all optional fields', () => {
      const id = genTxnId()
      const vndrId = genVndrId()
      const txn = transactionReadSchema.parse({
        id,
        origId: genOrigId(),
        postDate: '2026-01-15',
        clearedDate: '2026-01-20',
        code: '1234',
        vndrId,
        description: 'Monthly payment',
        needsReview: true,
        entries: validEntries,
      })

      expect(txn.id).toBe(id)
      expect(txn.clearedDate as string).toBe('2026-01-20')
      expect(txn.code).toBe('1234')
      expect(txn.vndrId).toBe(vndrId)
      expect(txn.description as string).toBe('Monthly payment')
    })

    it('parses a transaction with more than two entries', () => {
      const txn = transactionReadSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        code: '',
        description: 'Split purchase',
        needsReview: false,
        entries: [
          { acctId: genAcctId(), debit: '$50.00', credit: '$0.00' },
          { acctId: genAcctId(), debit: '$50.00', credit: '$0.00' },
          { acctId: genAcctId(), debit: '$0.00', credit: '$100.00' },
        ],
      })

      expect(txn.entries).toHaveLength(3)
    })
  })

  describe('invalid id', () => {
    it('rejects missing id', () => {
      expect(() =>
        transactionReadSchema.parse({
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects invalid id format', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: 'invalid-id',
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects id with wrong prefix', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })
  })

  describe('invalid origId', () => {
    it('rejects missing origId', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects invalid origId format', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: 'not-an-orig-id',
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects an origId with the wrong entity prefix', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genTxnId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })
  })

  describe('invalid postDate', () => {
    it('rejects missing postDate', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects invalid date format - wrong separator', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026/01/15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects invalid date format - wrong order', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '15-01-2026',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects invalid month', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-13-15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects invalid day', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-32',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })
  })

  describe('invalid clearedDate', () => {
    it('rejects an invalid clearedDate format', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          clearedDate: '2026/01/20',
          code: '',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })
  })

  describe('invalid vndrId', () => {
    it('rejects an invalid vndrId format', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          vndrId: 'not-a-vndr-id',
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects a vndrId with the wrong entity prefix', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          vndrId: genAcctId(),
          description: 'x',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })
  })

  describe('invalid description', () => {
    it('rejects missing description', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          vndrId: genVndrId(),
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects description exceeding max length', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x'.repeat(201),
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects description with newlines', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'Line one\nLine two',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })
  })

  describe('invalid entries', () => {
    it('rejects missing entries', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: false,
        }),
      ).toThrow()
    })

    it('rejects a single entry', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: [validEntries[0]],
        }),
      ).toThrow()
    })

    it('rejects unbalanced entries', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: [
            { acctId: genAcctId(), debit: '$100.00', credit: '$0.00' },
            { acctId: genAcctId(), debit: '$0.00', credit: '$50.00' },
          ],
        }),
      ).toThrow()
    })

    it('rejects an empty entries array', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: false,
          entries: [],
        }),
      ).toThrow()
    })
  })

  describe('unknown properties', () => {
    it('rejects unknown properties', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          vndrId: genVndrId(),
          description: 'x',
          needsReview: false,
          entries: validEntries,
          unknownField: 'should fail',
        }),
      ).toThrow()
    })
  })

  describe('needsReview', () => {
    it('rejects a missing needsReview (required on a complete read)', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('rejects a non-boolean needsReview', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: 'x',
          needsReview: 'yes',
          entries: validEntries,
        }),
      ).toThrow()
    })

    it('accepts needsReview true', () => {
      const txn = transactionReadSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        code: '',
        description: 'x',
        needsReview: true,
        entries: validEntries,
      })
      expect(txn.needsReview).toBe(true)
    })
  })

  describe('vendor or description required', () => {
    it('accepts a transaction with vndrId only', () => {
      const vndrId = genVndrId()
      const txn = transactionReadSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        code: '',
        vndrId,
        description: '',
        needsReview: false,
        entries: validEntries,
      })
      expect(txn.vndrId).toBe(vndrId)
    })

    it('accepts a transaction with description only', () => {
      const txn = transactionReadSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        code: '',
        description: 'Monthly payment',
        needsReview: false,
        entries: validEntries,
      })
      expect(txn.description as string).toBe('Monthly payment')
    })

    it('accepts a transaction with both vndrId and description', () => {
      const vndrId = genVndrId()
      const txn = transactionReadSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        code: '',
        vndrId,
        description: 'Monthly payment',
        needsReview: false,
        entries: validEntries,
      })
      expect(txn.vndrId).toBe(vndrId)
      expect(txn.description as string).toBe('Monthly payment')
    })

    it('rejects a transaction with neither vndrId nor description', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: '',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow('A transaction must have a vendor or a description (or both).')
    })

    it('rejects a transaction with a whitespace-only description and no vndrId', () => {
      expect(() =>
        transactionReadSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          code: '',
          description: '   ',
          needsReview: false,
          entries: validEntries,
        }),
      ).toThrow()
    })
  })
})

describe('transactionBeforeEntriesSchema', () => {
  it('parses transaction header fields without entries', () => {
    const id = genTxnId()
    const txn = transactionBeforeEntriesSchema.parse({
      id,
      origId: genOrigId(),
      postDate: '2026-01-15',
      code: '',
      description: 'Monthly payment',
      needsReview: false,
    })

    expect(txn.id).toBe(id)
    expect(txn.postDate as string).toBe('2026-01-15')
  })

  it('rejects a missing origId', () => {
    expect(() =>
      transactionBeforeEntriesSchema.parse({
        id: genTxnId(),
        postDate: '2026-01-15',
        code: '',
        description: 'Monthly payment',
        needsReview: false,
      }),
    ).toThrow()
  })

  it('rejects entries as an unknown property', () => {
    expect(() =>
      transactionBeforeEntriesSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        code: '',
        description: 'Monthly payment',
        needsReview: false,
        entries: validEntries,
      }),
    ).toThrow()
  })

  it('rejects a missing needsReview', () => {
    expect(() =>
      transactionBeforeEntriesSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        code: '',
        description: 'Monthly payment',
      }),
    ).toThrow()
  })

  it('does not enforce vendor-or-description (no such refinement on this sub-schema)', () => {
    const txn = transactionBeforeEntriesSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      code: '',
      description: '',
      needsReview: false,
    })

    expect(txn.description as string).toBe('')
  })
})

describe('transactionCreationEventSchema', () => {
  it('parses valid creation input', () => {
    const txn = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      vndrId: genVndrId(),
      entries: validEntries,
    })

    expect(txn.postDate as string).toBe('2026-01-15')
  })

  it('requires all mandatory fields', () => {
    expect(() =>
      transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        vndrId: genVndrId(),
      }),
    ).toThrow()
  })

  it('requires origId', () => {
    expect(() =>
      transactionCreationEventSchema.parse({
        id: genTxnId(),
        postDate: '2026-01-15',
        vndrId: genVndrId(),
        entries: validEntries,
      }),
    ).toThrow()
  })

  it('requires vndrId or description', () => {
    expect(() =>
      transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        entries: validEntries,
      }),
    ).toThrow('A transaction must have a vendor or a description (or both).')
  })

  it('defaults code to an empty string', () => {
    const txn = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      vndrId: genVndrId(),
      entries: validEntries,
    })

    expect(txn.code).toBe('')
  })

  it('defaults description to an empty string', () => {
    const txn = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      vndrId: genVndrId(),
      entries: validEntries,
    })

    expect(txn.description as string).toBe('')
  })

  it('defaults needsReview to false when absent', () => {
    const txn = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      vndrId: genVndrId(),
      entries: validEntries,
    })

    expect(txn.needsReview).toBe(false)
  })

  it('accepts an explicit needsReview of true', () => {
    const txn = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      vndrId: genVndrId(),
      needsReview: true,
      entries: validEntries,
    })

    expect(txn.needsReview).toBe(true)
  })

  it('rejects a non-boolean needsReview', () => {
    expect(() =>
      transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        vndrId: genVndrId(),
        needsReview: 'true',
        entries: validEntries,
      }),
    ).toThrow()
  })

  it('rejects unbalanced entries', () => {
    expect(() =>
      transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        vndrId: genVndrId(),
        entries: [
          { acctId: genAcctId(), debit: '$100.00', credit: '$0.00' },
          { acctId: genAcctId(), debit: '$0.00', credit: '$50.00' },
        ],
      }),
    ).toThrow()
  })

  it('rejects a single entry', () => {
    expect(() =>
      transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        vndrId: genVndrId(),
        entries: [validEntries[0]],
      }),
    ).toThrow()
  })

  it('rejects postDate after clearedDate', () => {
    expect(() =>
      transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-20',
        clearedDate: '2026-01-15',
        vndrId: genVndrId(),
        entries: validEntries,
      }),
    ).toThrow('Posted date must be on or before cleared date.')
  })

  it('accepts equal postDate and clearedDate', () => {
    const txn = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      clearedDate: '2026-01-15',
      vndrId: genVndrId(),
      entries: validEntries,
    })
    expect(txn.clearedDate as string).toBe('2026-01-15')
  })

  it('accepts postDate before clearedDate', () => {
    const txn = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      clearedDate: '2026-01-20',
      vndrId: genVndrId(),
      entries: validEntries,
    })
    expect(txn.clearedDate as string).toBe('2026-01-20')
  })

  it('accepts a missing clearedDate regardless of postDate', () => {
    const txn = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      vndrId: genVndrId(),
      entries: validEntries,
    })
    expect(txn.clearedDate).toBeUndefined()
  })
})

describe('transactionDeletionEventSchema', () => {
  it('parses with required id and origId only', () => {
    const id = genTxnId()
    const origId = genOrigId()
    const event = transactionDeletionEventSchema.parse({ id, origId })
    expect(event.id).toBe(id)
    expect(event.origId).toBe(origId)
    expect(event.hlc).toBeUndefined()
  })

  it('accepts a valid hlc', () => {
    const hlc = getHLClock('ABC')
    const event = transactionDeletionEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      hlc,
    })
    expect(event.hlc).toBe(hlc)
  })

  it('rejects an invalid hlc', () => {
    expect(() =>
      transactionDeletionEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        hlc: 'not-valid',
      }),
    ).toThrow()
  })

  it('rejects a missing id', () => {
    expect(() =>
      transactionDeletionEventSchema.parse({
        origId: genOrigId(),
      }),
    ).toThrow()
  })

  it('rejects a missing origId', () => {
    expect(() =>
      transactionDeletionEventSchema.parse({
        id: genTxnId(),
      }),
    ).toThrow()
  })
})

describe('transactionPatchEventSchema', () => {
  it('parses an update with all fields', () => {
    const txn = transactionPatchEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-02-15',
      entries: validEntries,
    })

    expect(txn.postDate as string).toBe('2026-02-15')
  })

  it('allows an update without postDate (postDate is optional in updates)', () => {
    const txn = transactionPatchEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      entries: validEntries,
    })

    expect(txn.postDate).toBeUndefined()
  })

  it('requires the id field', () => {
    expect(() =>
      transactionPatchEventSchema.parse({
        origId: genOrigId(),
        postDate: '2026-01-15',
        entries: validEntries,
      }),
    ).toThrow()
  })

  it('requires the origId field, even though other fields are optional', () => {
    expect(() =>
      transactionPatchEventSchema.parse({
        id: genTxnId(),
        postDate: '2026-01-15',
      }),
    ).toThrow()
  })

  it('allows an update without entries', () => {
    const txn = transactionPatchEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
    })
    expect(txn.entries).toBeUndefined()
  })

  it('does not enforce vendor-or-description on a patch that omits both', () => {
    const txn = transactionPatchEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
    })
    expect(txn.vndrId).toBeUndefined()
    expect(txn.description).toBeUndefined()
  })

  it('allows an update without needsReview (unset, not defaulted)', () => {
    const txn = transactionPatchEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
    })
    expect(txn.needsReview).toBeUndefined()
  })

  it('allows patching needsReview alone', () => {
    const txn = transactionPatchEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      needsReview: true,
    })
    expect(txn.needsReview).toBe(true)
  })

  it('rejects a non-boolean needsReview', () => {
    expect(() =>
      transactionPatchEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        needsReview: 'true',
      }),
    ).toThrow()
  })

  it('rejects unbalanced entries when entries are provided', () => {
    expect(() =>
      transactionPatchEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        entries: [
          { acctId: genAcctId(), debit: '$100.00', credit: '$0.00' },
          { acctId: genAcctId(), debit: '$0.00', credit: '$50.00' },
        ],
      }),
    ).toThrow()
  })

  it('rejects unknown properties', () => {
    expect(() =>
      transactionPatchEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        unknownField: 'should fail',
      }),
    ).toThrow()
  })

  it('rejects postDate after clearedDate when both are in the same patch', () => {
    expect(() =>
      transactionPatchEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-20',
        clearedDate: '2026-01-15',
      }),
    ).toThrow('Posted date must be on or before cleared date.')
  })

  it('accepts equal postDate and clearedDate', () => {
    const txn = transactionPatchEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      clearedDate: '2026-01-15',
    })
    expect(txn.clearedDate as string).toBe('2026-01-15')
  })

  it('does not check the constraint when only one of the two dates is in the patch', () => {
    const txn = transactionPatchEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      clearedDate: '2026-01-15',
    })
    expect(txn.clearedDate as string).toBe('2026-01-15')
    expect(txn.postDate).toBeUndefined()
  })
})

describe('hlc field in transaction event schemas', () => {
  describe('transactionCreationEventSchema', () => {
    it('accepts a valid hlc', () => {
      const hlc = getHLClock('ABC')
      const txn = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        vndrId: genVndrId(),
        entries: validEntries,
        hlc,
      })
      expect(txn.hlc).toBe(hlc)
    })

    it('hlc is undefined when absent', () => {
      const txn = transactionCreationEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        postDate: '2026-01-15',
        vndrId: genVndrId(),
        entries: validEntries,
      })
      expect(txn.hlc).toBeUndefined()
    })

    it('rejects an invalid hlc', () => {
      expect(() =>
        transactionCreationEventSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          postDate: '2026-01-15',
          vndrId: genVndrId(),
          entries: validEntries,
          hlc: 'not-valid',
        }),
      ).toThrow()
    })
  })

  describe('transactionPatchEventSchema', () => {
    it('accepts a valid hlc', () => {
      const hlc = getHLClock('ABC')
      const txn = transactionPatchEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
        hlc,
      })
      expect(txn.hlc).toBe(hlc)
    })

    it('hlc is undefined when absent', () => {
      const txn = transactionPatchEventSchema.parse({
        id: genTxnId(),
        origId: genOrigId(),
      })
      expect(txn.hlc).toBeUndefined()
    })

    it('rejects an invalid hlc', () => {
      expect(() =>
        transactionPatchEventSchema.parse({
          id: genTxnId(),
          origId: genOrigId(),
          hlc: 'not-valid',
        }),
      ).toThrow()
    })
  })
})

describe('transactionDate', () => {
  it('returns clearedDate when present', () => {
    const txn = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      clearedDate: '2026-01-20',
      vndrId: genVndrId(),
      entries: validEntries,
    })
    expect(transactionDate(txn) as string).toBe('2026-01-20')
  })

  it('falls back to postDate when clearedDate is absent', () => {
    const txn = transactionCreationEventSchema.parse({
      id: genTxnId(),
      origId: genOrigId(),
      postDate: '2026-01-15',
      vndrId: genVndrId(),
      entries: validEntries,
    })
    expect(transactionDate(txn) as string).toBe('2026-01-15')
  })
})
