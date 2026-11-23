import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import {
  accountCategoryCreationEventSchema,
  accountCategoryDeletionEventSchema,
  accountCategoryPatchEventSchema,
  accountCategoryReadSchema,
} from '@/ledger/accountCategories/AccountCategory.ts'
import { genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import {
  acctCtgIdAssets,
  acctCtgIdEquity,
  acctCtgIdExpenses,
  acctCtgIdIncome,
  acctCtgIdLiabilities,
} from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { getHLClock } from '@/ledger/core/HybridLogicalClock.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'

describe('Sample Account Categories', () => {
  it('Should parse without error', () => {
    const id = genAcctCtgId()
    const ctg = accountCategoryReadSchema.parse({
      id: id,
      origId: genOrigId(),
      parentCtgId: acctCtgIdAssets,
      name: 'example',
      acctType: 'ASSET',
      description: 'an example of a category',
    })

    expect(ctg.id).toBe(id)
    expect(ctg.name as string).toBe('example')
    expect(ctg.acctType).toBe('ASSET')
    expect(ctg.description as string).toBe('an example of a category')
  })

  it('Should parse without error when optional fields are absent', () => {
    const id = genAcctCtgId()
    const ctg = accountCategoryCreationEventSchema.parse({
      id: id,
      origId: genOrigId(),
      parentCtgId: acctCtgIdAssets,
      name: 'example',
      acctType: 'ASSET',
    })

    expect(ctg.id).toBe(id)
    expect(ctg.name as string).toBe('example')
    expect(ctg.acctType).toBe('ASSET')
    expect(ctg.description as string).toBe('')
  })

  it('Should convert to JSON', () => {
    const id = genAcctCtgId()
    const origId = genOrigId()
    const ctg = accountCategoryCreationEventSchema.parse({
      id: id,
      origId,
      parentCtgId: acctCtgIdLiabilities,
      name: 'example',
      acctType: 'LIABILITY',
      description: 'an example of a category',
    })
    const ctgJson = JSON.stringify(ctg)

    expect(ctgJson).toBe(
      `{"id":"${id}","origId":"${origId}","parentCtgId":"${acctCtgIdLiabilities}","acctType":"LIABILITY","name":"example","description":"an example of a category"}`,
    )
  })

  it('Should parse without error for a name change', () => {
    const id = genAcctCtgId()
    const ctg = accountCategoryPatchEventSchema.parse({
      id: id,
      origId: genOrigId(),
      name: 'example',
    })

    expect(ctg.id).toBe(id)
    expect(ctg.name as string).toBe('example')
    expect(ctg.description).toBeUndefined()
  })

  it('Should parse without error for a description change', () => {
    const id = genAcctCtgId()
    const ctg = accountCategoryPatchEventSchema.parse({
      id: id,
      origId: genOrigId(),
      description: 'Revised summary',
    })

    expect(ctg.id).toBe(id)
    expect(ctg.name).toBeUndefined()
    expect(ctg.description as string).toBe('Revised summary')
  })

  it('Should generate JSON schema', () => {
    const jsonSchema = z.toJSONSchema(accountCategoryCreationEventSchema)
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
              pattern: '^actg.*',
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
      },
      readOnly: true,
      required: ['id', 'origId', 'acctType', 'name', 'description'],
      type: 'object',
    })
  })
})

describe('Invalid Account Categories', () => {
  describe('invalid id', () => {
    it('rejects missing id', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          origId: genOrigId(),
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects invalid id format', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: 'not-a-cuid2',
          origId: genOrigId(),
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects id with wrong prefix', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: 'orgabcdefghij1234567890ab',
          origId: genOrigId(),
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })
  })

  describe('invalid origId', () => {
    it('rejects missing origId', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: genAcctCtgId(),
          name: 'example',
          acctType: 'ASSET',
          description: '',
        }),
      ).toThrow()
    })

    it('rejects a creation event with missing origId', () => {
      expect(() =>
        accountCategoryCreationEventSchema.parse({
          id: genAcctCtgId(),
          parentCtgId: acctCtgIdAssets,
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects a patch with missing origId, even though other fields are optional', () => {
      expect(() =>
        accountCategoryPatchEventSchema.parse({
          id: genAcctCtgId(),
          name: 'Renamed',
        }),
      ).toThrow()
    })

    it('rejects a deletion event with missing origId', () => {
      expect(() =>
        accountCategoryDeletionEventSchema.parse({
          id: genAcctCtgId(),
        }),
      ).toThrow()
    })
  })

  describe('invalid name', () => {
    it('rejects missing name', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: genAcctCtgId(),
          origId: genOrigId(),
          acctType: 'ASSET',
        }),
      ).toThrow()
    })

    it('rejects empty name', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: genAcctCtgId(),
          origId: genOrigId(),
          name: '',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })
  })

  describe('invalid acctType', () => {
    it('rejects missing acctType', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: genAcctCtgId(),
          origId: genOrigId(),
          name: 'example',
        }),
      ).toThrow()
    })

    it('rejects invalid acctType value', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: genAcctCtgId(),
          origId: genOrigId(),
          name: 'example',
          acctType: 'INVALID',
        }),
      ).toThrow()
    })
  })

  describe('unknown properties', () => {
    it('rejects unknown properties', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: genAcctCtgId(),
          origId: genOrigId(),
          name: 'example',
          acctType: 'ASSET',
          unknownField: 'should fail',
        }),
      ).toThrow()
    })
  })

  describe('accountCategoryPatchEventSchema invalid inputs', () => {
    it('rejects missing id', () => {
      expect(() =>
        accountCategoryPatchEventSchema.parse({
          origId: genOrigId(),
          name: 'Updated Name',
        }),
      ).toThrow()
    })

    it('rejects empty name when provided', () => {
      expect(() =>
        accountCategoryPatchEventSchema.parse({
          id: genAcctCtgId(),
          origId: genOrigId(),
          name: '',
        }),
      ).toThrow()
    })

    it('rejects a patch that includes acctType at all -- it is immutable after creation', () => {
      expect(() =>
        accountCategoryPatchEventSchema.parse({
          id: genAcctCtgId(),
          origId: genOrigId(),
          acctType: 'ASSET',
        }),
      ).toThrow()
    })
  })

  describe('accountCategoryCreationEventSchema invalid inputs', () => {
    it('rejects missing required fields', () => {
      expect(() =>
        accountCategoryCreationEventSchema.parse({
          id: genAcctCtgId(),
        }),
      ).toThrow()
    })

    it('rejects missing id', () => {
      expect(() =>
        accountCategoryCreationEventSchema.parse({
          origId: genOrigId(),
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow()
    })
  })
})

describe('hlc field in account category event schemas', () => {
  describe('accountCategoryCreationEventSchema', () => {
    it('accepts a valid hlc', () => {
      const hlc = getHLClock('ABC')
      const ctg = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        name: 'example',
        acctType: 'ASSET',
        hlc,
      })
      expect(ctg.hlc).toBe(hlc)
    })

    it('hlc is undefined when absent', () => {
      const ctg = accountCategoryCreationEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        name: 'example',
        acctType: 'ASSET',
      })
      expect(ctg.hlc).toBeUndefined()
    })

    it('rejects an invalid hlc', () => {
      expect(() =>
        accountCategoryCreationEventSchema.parse({
          id: genAcctCtgId(),
          origId: genOrigId(),
          parentCtgId: acctCtgIdAssets,
          name: 'example',
          acctType: 'ASSET',
          hlc: 'not-valid',
        }),
      ).toThrow()
    })
  })

  describe('accountCategoryDeletionEventSchema', () => {
    it('parses with required id and origId only', () => {
      const id = genAcctCtgId()
      const origId = genOrigId()
      const event = accountCategoryDeletionEventSchema.parse({ id, origId })
      expect(event.id).toBe(id)
      expect(event.origId).toBe(origId)
      expect(event.hlc).toBeUndefined()
    })

    it('rejects a missing id', () => {
      expect(() =>
        accountCategoryDeletionEventSchema.parse({
          origId: genOrigId(),
        }),
      ).toThrow()
    })

    it('rejects a missing origId', () => {
      expect(() =>
        accountCategoryDeletionEventSchema.parse({
          id: genAcctCtgId(),
        }),
      ).toThrow()
    })
  })

  describe('accountCategoryPatchEventSchema', () => {
    it('accepts a valid hlc', () => {
      const hlc = getHLClock('ABC')
      const ctg = accountCategoryPatchEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        name: 'example',
        hlc,
      })
      expect(ctg.hlc).toBe(hlc)
    })

    it('hlc is undefined when absent', () => {
      const ctg = accountCategoryPatchEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        name: 'example',
      })
      expect(ctg.hlc).toBeUndefined()
    })
  })
})

describe('Account category hierarchy invariants', () => {
  describe('self-parent rejection', () => {
    it('rejects a category whose parentCtgId is its own id (accountCategoryReadSchema)', () => {
      const id = genAcctCtgId()
      expect(() =>
        accountCategoryReadSchema.parse({
          id,
          origId: genOrigId(),
          parentCtgId: id,
          name: 'example',
          acctType: 'ASSET',
          description: '',
        }),
      ).toThrow('An account category cannot be its own parent.')
    })

    it('rejects a category whose parentCtgId is its own id (accountCategoryCreationEventSchema)', () => {
      const id = genAcctCtgId()
      expect(() =>
        accountCategoryCreationEventSchema.parse({
          id,
          origId: genOrigId(),
          parentCtgId: id,
          name: 'example',
          acctType: 'ASSET',
        }),
      ).toThrow('An account category cannot be its own parent.')
    })

    it('rejects a patch whose parentCtgId is its own id, even though other fields are optional', () => {
      const id = genAcctCtgId()
      expect(() =>
        accountCategoryPatchEventSchema.parse({
          id,
          origId: genOrigId(),
          parentCtgId: id,
        }),
      ).toThrow('An account category cannot be its own parent.')
    })
  })

  describe('root has no parent, non-root always has one', () => {
    it('accepts a root category (well-known id, acctType ASSET) with no parentCtgId', () => {
      const ctg = accountCategoryReadSchema.parse({
        id: acctCtgIdAssets,
        origId: genOrigId(),
        name: 'Assets',
        acctType: 'ASSET',
        description: '',
      })
      expect(ctg.parentCtgId).toBeUndefined()
    })

    it('accepts the Equity root with no parentCtgId', () => {
      const ctg = accountCategoryReadSchema.parse({
        id: acctCtgIdEquity,
        origId: genOrigId(),
        name: 'Equity',
        acctType: 'EQUITY',
        description: '',
      })
      expect(ctg.parentCtgId).toBeUndefined()
    })

    it('rejects a root category that has a parentCtgId set', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: acctCtgIdAssets,
          origId: genOrigId(),
          parentCtgId: acctCtgIdLiabilities,
          name: 'Assets',
          acctType: 'ASSET',
          description: '',
        }),
      ).toThrow('An account category has no parent if and only if it is one of the five predefined root categories.')
    })

    it('rejects a non-root category (accountCategoryReadSchema) with no parentCtgId', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: genAcctCtgId(),
          origId: genOrigId(),
          name: 'Checking Accounts',
          acctType: 'ASSET',
          description: '',
        }),
      ).toThrow('An account category has no parent if and only if it is one of the five predefined root categories.')
    })

    it('accepts a non-root category with a parentCtgId pointing at its type root', () => {
      const ctg = accountCategoryReadSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdAssets,
        name: 'Checking Accounts',
        acctType: 'ASSET',
        description: '',
      })
      expect(ctg.parentCtgId).toBe(acctCtgIdAssets)
    })

    it('does not enforce root-iff-no-parent on patches that omit parentCtgId', () => {
      const ctg = accountCategoryPatchEventSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        name: 'Renamed',
      })
      expect(ctg.parentCtgId).toBeUndefined()
      expect(ctg.name as string).toBe('Renamed')
    })
  })

  describe("a predefined root's acctType must match the type it represents", () => {
    it('accepts each root with its correct acctType (accountCategoryReadSchema)', () => {
      const roots: Array<[typeof acctCtgIdAssets, string]> = [
        [acctCtgIdAssets, 'ASSET'],
        [acctCtgIdLiabilities, 'LIABILITY'],
        [acctCtgIdEquity, 'EQUITY'],
        [acctCtgIdIncome, 'INCOME'],
        [acctCtgIdExpenses, 'EXPENSE'],
      ]
      for (const [id, acctType] of roots) {
        expect(() =>
          accountCategoryReadSchema.parse({
            id,
            origId: genOrigId(),
            acctType,
            name: 'example',
            description: '',
          }),
        ).not.toThrow()
      }
    })

    it('rejects a root whose acctType does not match what it represents (accountCategoryReadSchema)', () => {
      expect(() =>
        accountCategoryReadSchema.parse({
          id: acctCtgIdAssets,
          origId: genOrigId(),
          acctType: 'LIABILITY',
          name: 'Assets',
          description: '',
        }),
      ).toThrow("A predefined root category's acctType must match the type it represents.")
    })

    it('rejects a patch that includes acctType on a root category, even a matching value', () => {
      expect(() =>
        accountCategoryPatchEventSchema.parse({
          id: acctCtgIdExpenses,
          origId: genOrigId(),
          acctType: 'EXPENSE',
        }),
      ).toThrow()
    })

    it("imposes no constraint on a non-root category's acctType", () => {
      const ctg = accountCategoryReadSchema.parse({
        id: genAcctCtgId(),
        origId: genOrigId(),
        parentCtgId: acctCtgIdLiabilities,
        acctType: 'LIABILITY',
        name: 'Credit Cards',
        description: '',
      })
      expect(ctg.acctType).toBe('LIABILITY')
    })
  })
})
