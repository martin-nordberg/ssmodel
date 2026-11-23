import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import { acctCtgIdAssets, acctCtgIdEquity, acctCtgIdExpenses } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import {
  accountCreationEventSchema,
  accountDeletionEventSchema,
  accountPatchEventSchema,
  accountReadSchema,
} from '@/ledger/accounts/Account.ts'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import { acctIdNetWorth } from '@/ledger/accounts/NetWorthAccount.ts'
import { getHLClock } from '@/ledger/core/HybridLogicalClock.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'

describe('Sample Accounts', () => {
  it('Should parse without error', () => {
    const id = genAcctId()
    const acct = accountReadSchema.parse({
      id: id,
      origId: genOrigId(),
      parentCtgId: genAcctCtgId(),
      name: 'example',
      acctType: 'ASSET',
      description: 'an example of an account',
      isPrimary: true,
    })

    expect(acct.id).toBe(id)
    expect(acct.name as string).toBe('example')
    expect(acct.acctType).toBe('ASSET')
    expect(acct.description as string).toBe('an example of an account')
    expect(acct.isPrimary).toBe(true)
  })

  it('Should parse without error when optional fields are absent', () => {
    const id = genAcctId()
    const acct = accountCreationEventSchema.parse({
      id: id,
      origId: genOrigId(),
      parentCtgId: genAcctCtgId(),
      name: 'example',
      acctType: 'ASSET',
    })

    expect(acct.id).toBe(id)
    expect(acct.name as string).toBe('example')
    expect(acct.acctType).toBe('ASSET')
    expect(acct.description as string).toBe('')
    expect(acct.isPrimary).toBe(false)
  })

  it('Should convert to JSON', () => {
    const id = genAcctId()
    const origId = genOrigId()
    const parentCtgId = genAcctCtgId()
    const acct = accountCreationEventSchema.parse({
      id: id,
      origId,
      parentCtgId,
      name: 'example',
      acctType: 'LIABILITY',
      description: 'an example of an account',
    })
    const accountJson = JSON.stringify(acct)

    expect(accountJson).toBe(
      `{"id":"${id}","origId":"${origId}","parentCtgId":"${parentCtgId}","acctType":"LIABILITY","name":"example","description":"an example of an account","isPrimary":false}`,
    )
  })

  it('Should parse without error for a name change', () => {
    const id = genAcctId()
    const acct = accountPatchEventSchema.parse({
      id: id,
      origId: genOrigId(),
      name: 'example',
    })

    expect(acct.id).toBe(id)
    expect(acct.name as string).toBe('example')
    expect(acct.description).toBeUndefined()
  })

  it('Should parse without error for a description change', () => {
    const id = genAcctId()
    const acct = accountPatchEventSchema.parse({
      id: id,
      origId: genOrigId(),
      description: 'Revised summary',
    })

    expect(acct.id).toBe(id)
    expect(acct.name).toBeUndefined()
    expect(acct.description as string).toBe('Revised summary')
  })

  it('Should parse without error for a reparent (parentCtgId change)', () => {
    const id = genAcctId()
    const newParentCtgId = genAcctCtgId()
    const acct = accountPatchEventSchema.parse({
      id: id,
      origId: genOrigId(),
      parentCtgId: newParentCtgId,
    })

    expect(acct.id).toBe(id)
    expect(acct.parentCtgId).toBe(newParentCtgId)
  })

  it('Should generate JSON schema', () => {
    const jsonSchema = z.toJSONSchema(accountCreationEventSchema)
    expect(jsonSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      additionalProperties: false,
      properties: {
        acctType: {
          enum: ['ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'INCOME'],
          type: 'string',
        },
        id: {
          allOf: expect.arrayContaining([
            {
              pattern: '^[0-9a-z]+$',
            },
            {
              pattern: '^acct.*',
            },
          ]),
          maxLength: 28,
          minLength: 28,
          type: 'string',
        },
        origId: {
          allOf: expect.arrayContaining([
            {
              pattern: '^[0-9a-z]+$',
            },
            {
              pattern: '^orig.*',
            },
          ]),
          maxLength: 28,
          minLength: 28,
          type: 'string',
        },
        name: {
          maxLength: 200,
          minLength: 1,
          pattern: '^[^\\r\\n]*$',
          type: 'string',
        },
        description: {
          default: '',
          maxLength: 200,
          pattern: '^[^\\r\\n]*$',
          type: 'string',
        },
        isPrimary: {
          default: false,
          type: 'boolean',
        },
      },
      readOnly: true,
      required: ['id', 'origId', 'parentCtgId', 'acctType', 'name', 'description', 'isPrimary'],
      type: 'object',
    })
  })
})

describe('Invalid Accounts', () => {
  describe('invalid id', () => {
    it('rejects missing id', () => {
      expect(() =>
        accountReadSchema.parse({
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects invalid id format', () => {
      expect(() =>
        accountReadSchema.parse({
          id: 'not-a-cuid2',
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects id with wrong prefix', () => {
      expect(() =>
        accountReadSchema.parse({
          id: 'orgabcdefghij1234567890ab',
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })
  })

  describe('invalid parentCtgId', () => {
    it('rejects missing parentCtgId', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          name: 'example',
          acctType: 'ASSET',
          description: '',
          isPrimary: false,
        }),
      ).toThrow()
    })

    it('rejects a parentCtgId that is an AcctId rather than an AcctCtgId', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctId(),
          name: 'example',
          acctType: 'ASSET',
          description: '',
          isPrimary: false,
        }),
      ).toThrow()
    })
  })

  describe('invalid origId', () => {
    it('rejects missing origId', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
          description: '',
          isPrimary: false,
        }),
      ).toThrow()
    })

    it('rejects invalid origId format', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: 'not-a-cuid2',
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
          description: '',
          isPrimary: false,
        }),
      ).toThrow()
    })

    it('rejects origId with the wrong entity prefix (an account ID, not an origin ID)', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genAcctId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
          description: '',
          isPrimary: false,
        }),
      ).toThrow()
    })

    it('rejects a creation event with missing origId', () => {
      expect(() =>
        accountCreationEventSchema.parse({
          id: genAcctId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects a patch with missing origId, even though other fields are optional', () => {
      expect(() =>
        accountPatchEventSchema.parse({
          id: genAcctId(),
          name: 'Renamed',
        }),
      ).toThrow()
    })

    it('rejects a deletion event with missing origId', () => {
      expect(() =>
        accountDeletionEventSchema.parse({
          id: genAcctId(),
        }),
      ).toThrow()
    })
  })

  describe('invalid name', () => {
    it('rejects missing name', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects empty name', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: '',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects whitespace-only name', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: '   ',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects name exceeding max length', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'x'.repeat(201),
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects name with newlines', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'Line one\nLine two',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects name with carriage return', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'Line one\rLine two',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })
  })

  describe('invalid acctType', () => {
    it('rejects missing acctType', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
        }),
      ).toThrow()
    })

    it('rejects invalid acctType value', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'INVALID',
        }),
      ).toThrow()
    })

    it('rejects lowercase acctType', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'asset',
        }),
      ).toThrow()
    })
  })

  describe('invalid description', () => {
    it('rejects description exceeding max length', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
          description: 'x'.repeat(201),
        }),
      ).toThrow()
    })

    it('rejects description with newlines', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
          description: 'Line one\nLine two',
        }),
      ).toThrow()
    })
  })

  describe('unknown properties', () => {
    it('rejects unknown properties', () => {
      expect(() =>
        accountReadSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
          unknownField: 'should fail',
        }),
      ).toThrow()
    })
  })

  describe('accountUpdateSchema invalid inputs', () => {
    it('rejects missing id', () => {
      expect(() =>
        accountPatchEventSchema.parse({
          origId: genOrigId(),
          name: 'Updated Name',
        }),
      ).toThrow()
    })

    it('rejects empty name when provided', () => {
      expect(() =>
        accountPatchEventSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          name: '',
        }),
      ).toThrow()
    })

    it('rejects a patch that includes acctType at all -- it is immutable after creation', () => {
      expect(() =>
        accountPatchEventSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          acctType: 'ASSET',
        }),
      ).toThrow()
    })
  })

  describe('accountCreationSchema invalid inputs', () => {
    it('rejects missing required fields', () => {
      expect(() =>
        accountCreationEventSchema.parse({
          id: genAcctId(),
        }),
      ).toThrow()
    })

    it('rejects missing id', () => {
      expect(() =>
        accountCreationEventSchema.parse({
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })
  })
})

describe('hlc field in account event schemas', () => {
  describe('accountCreationEventSchema', () => {
    it('accepts a valid hlc', () => {
      const hlc = getHLClock('ABC')
      const acct = accountCreationEventSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        parentCtgId: genAcctCtgId(),
        name: 'example',
        acctType: 'ASSET',
        hlc,
      })
      expect(acct.hlc).toBe(hlc)
    })

    it('hlc is undefined when absent', () => {
      const acct = accountCreationEventSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        parentCtgId: genAcctCtgId(),
        name: 'example',
        acctType: 'ASSET',
      })
      expect(acct.hlc).toBeUndefined()
    })

    it('rejects an invalid hlc', () => {
      expect(() =>
        accountCreationEventSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          parentCtgId: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
          hlc: 'not-valid',
        }),
      ).toThrow()
    })
  })

  describe('accountDeletionEventSchema', () => {
    it('parses with required id and origId only', () => {
      const id = genAcctId()
      const origId = genOrigId()
      const event = accountDeletionEventSchema.parse({ id, origId })
      expect(event.id).toBe(id)
      expect(event.origId).toBe(origId)
      expect(event.hlc).toBeUndefined()
    })

    it('accepts a valid hlc', () => {
      const hlc = getHLClock('ABC')
      const event = accountDeletionEventSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        hlc,
      })
      expect(event.hlc).toBe(hlc)
    })

    it('rejects an invalid hlc', () => {
      expect(() =>
        accountDeletionEventSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          hlc: 'not-valid',
        }),
      ).toThrow()
    })

    it('rejects a missing id', () => {
      expect(() =>
        accountDeletionEventSchema.parse({
          origId: genOrigId(),
        }),
      ).toThrow()
    })

    it('rejects a missing origId', () => {
      expect(() =>
        accountDeletionEventSchema.parse({
          id: genAcctId(),
        }),
      ).toThrow()
    })
  })

  describe('accountPatchEventSchema', () => {
    it('accepts a valid hlc', () => {
      const hlc = getHLClock('ABC')
      const acct = accountPatchEventSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        name: 'example',
        hlc,
      })
      expect(acct.hlc).toBe(hlc)
    })

    it('hlc is undefined when absent', () => {
      const acct = accountPatchEventSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        name: 'example',
      })
      expect(acct.hlc).toBeUndefined()
    })

    it('rejects an invalid hlc', () => {
      expect(() =>
        accountPatchEventSchema.parse({
          id: genAcctId(),
          origId: genOrigId(),
          name: 'example',
          hlc: 'not-valid',
        }),
      ).toThrow()
    })
  })
})

describe('Net Worth / EQUITY invariants', () => {
  it('accepts Net Worth: EQUITY, predefined id, parented directly under the Equity root category', () => {
    const acct = accountReadSchema.parse({
      id: acctIdNetWorth,
      origId: genOrigId(),
      parentCtgId: acctCtgIdEquity,
      acctType: 'EQUITY',
      name: 'Net Worth',
      description: '',
      isPrimary: false,
    })
    expect(acct.id).toBe(acctIdNetWorth)
    expect(acct.parentCtgId).toBe(acctCtgIdEquity)
  })

  it('rejects an EQUITY account whose id is not the predefined Net Worth id', () => {
    expect(() =>
      accountReadSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdEquity,
        acctType: 'EQUITY',
        name: 'Retained Earnings',
        description: '',
        isPrimary: false,
      }),
    ).toThrow('Net Worth is the only EQUITY account, and only Net Worth may use its predefined ID.')
  })

  it('rejects Net Worth if its parentCtgId is anything other than the Equity root category', () => {
    expect(() =>
      accountReadSchema.parse({
        id: acctIdNetWorth,
        origId: genOrigId(),
        parentCtgId: genAcctCtgId(),
        acctType: 'EQUITY',
        name: 'Net Worth',
        description: '',
        isPrimary: false,
      }),
    ).toThrow('Net Worth is the only EQUITY account, and only Net Worth may use its predefined ID.')
  })

  it('rejects a non-EQUITY account that claims the predefined Net Worth id', () => {
    expect(() =>
      accountReadSchema.parse({
        id: acctIdNetWorth,
        origId: genOrigId(),
        parentCtgId: genAcctCtgId(),
        acctType: 'ASSET',
        name: 'Not Actually Net Worth',
        description: '',
        isPrimary: false,
      }),
    ).toThrow('Net Worth is the only EQUITY account, and only Net Worth may use its predefined ID.')
  })

  it('a creation event for Net Worth passes the same invariant', () => {
    expect(() =>
      accountCreationEventSchema.parse({
        id: acctIdNetWorth,
        origId: genOrigId(),
        parentCtgId: acctCtgIdEquity,
        acctType: 'EQUITY',
        name: 'Net Worth',
      }),
    ).not.toThrow()
  })
})

describe('non-equity accounts must be categorized beyond the root', () => {
  it('accepts a non-equity account parented under a non-root category', () => {
    const acct = accountReadSchema.parse({
      id: genAcctId(),
      origId: genOrigId(),
      parentCtgId: genAcctCtgId(),
      acctType: 'ASSET',
      name: 'Checking',
      description: '',
      isPrimary: false,
    })
    expect(acct.acctType).toBe('ASSET')
  })

  it("rejects a non-equity account parented directly under its type's root category", () => {
    expect(() =>
      accountReadSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        acctType: 'ASSET',
        name: 'Checking',
        description: '',
        isPrimary: false,
      }),
    ).toThrow(
      "Every account other than Net Worth must be categorized at least one level beneath its type's root category.",
    )
  })

  it('rejects an EXPENSE account parented directly under the Expenses root category', () => {
    expect(() =>
      accountCreationEventSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdExpenses,
        acctType: 'EXPENSE',
        name: 'Groceries',
      }),
    ).toThrow(
      "Every account other than Net Worth must be categorized at least one level beneath its type's root category.",
    )
  })

  it('does not apply this rule to a patch, since acctType is absent there', () => {
    expect(() =>
      accountPatchEventSchema.parse({
        id: genAcctId(),
        origId: genOrigId(),
        parentCtgId: genAcctCtgId(),
      }),
    ).not.toThrow()
  })
})
