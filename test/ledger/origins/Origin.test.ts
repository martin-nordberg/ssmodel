import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { getHLClock } from '@/ledger/core/HybridLogicalClock.ts'
import { genOrigId } from '@/ledger/origins/OrigId.ts'
import { originCreationEventSchema, originReadSchema } from '@/ledger/origins/Origin.ts'

describe('originReadSchema', () => {
  it('parses a valid origin', () => {
    const id = genOrigId()
    const origin = originReadSchema.parse({
      id,
      name: 'Jane Doe',
      ipAddress: '192.168.1.1',
    })

    expect(origin.id).toBe(id)
    expect(origin.name as string).toBe('Jane Doe')
    expect(origin.ipAddress as string).toBe('192.168.1.1')
  })

  it('trims whitespace from name', () => {
    const origin = originReadSchema.parse({
      id: genOrigId(),
      name: '  Jane Doe  ',
      ipAddress: '192.168.1.1',
    })

    expect(origin.name as string).toBe('Jane Doe')
  })

  it('rejects a missing id', () => {
    expect(() =>
      originReadSchema.parse({
        name: 'Jane Doe',
        ipAddress: '192.168.1.1',
      }),
    ).toThrow()
  })

  it('rejects an id with the wrong entity prefix', () => {
    expect(() =>
      originReadSchema.parse({
        id: 'acctabcdefghij1234567890ab',
        name: 'Jane Doe',
        ipAddress: '192.168.1.1',
      }),
    ).toThrow()
  })

  it('rejects a missing name', () => {
    expect(() =>
      originReadSchema.parse({
        id: genOrigId(),
        ipAddress: '192.168.1.1',
      }),
    ).toThrow()
  })

  it('rejects an empty name', () => {
    expect(() =>
      originReadSchema.parse({
        id: genOrigId(),
        name: '',
        ipAddress: '192.168.1.1',
      }),
    ).toThrow()
  })

  it('rejects a missing ipAddress', () => {
    expect(() =>
      originReadSchema.parse({
        id: genOrigId(),
        name: 'Jane Doe',
      }),
    ).toThrow()
  })

  it('rejects a malformed ipAddress', () => {
    expect(() =>
      originReadSchema.parse({
        id: genOrigId(),
        name: 'Jane Doe',
        ipAddress: 'not-an-ip',
      }),
    ).toThrow()
  })

  it('rejects unknown properties', () => {
    expect(() =>
      originReadSchema.parse({
        id: genOrigId(),
        name: 'Jane Doe',
        ipAddress: '192.168.1.1',
        unknownField: 'should fail',
      }),
    ).toThrow()
  })
})

describe('originCreationEventSchema', () => {
  it('parses valid creation input', () => {
    const id = genOrigId()
    const origin = originCreationEventSchema.parse({
      id,
      name: 'Jane Doe',
      ipAddress: '192.168.1.1',
    })

    expect(origin.id).toBe(id)
    expect(origin.name as string).toBe('Jane Doe')
    expect(origin.ipAddress as string).toBe('192.168.1.1')
  })

  it('requires id', () => {
    expect(() =>
      originCreationEventSchema.parse({
        name: 'Jane Doe',
        ipAddress: '192.168.1.1',
      }),
    ).toThrow()
  })

  it('requires name', () => {
    expect(() =>
      originCreationEventSchema.parse({
        id: genOrigId(),
        ipAddress: '192.168.1.1',
      }),
    ).toThrow()
  })

  it('requires ipAddress', () => {
    expect(() =>
      originCreationEventSchema.parse({
        id: genOrigId(),
        name: 'Jane Doe',
      }),
    ).toThrow()
  })

  it('rejects unknown properties', () => {
    expect(() =>
      originCreationEventSchema.parse({
        id: genOrigId(),
        name: 'Jane Doe',
        ipAddress: '192.168.1.1',
        unknownField: 'should fail',
      }),
    ).toThrow()
  })

  it('generates the expected JSON schema', () => {
    const jsonSchema = z.toJSONSchema(originCreationEventSchema)
    expect(jsonSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      additionalProperties: false,
      properties: {
        id: {
          allOf: expect.arrayContaining([{ pattern: '^[0-9a-z]+$' }, { pattern: '^orig.*' }]),
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
        ipAddress: {
          format: 'ipv4',
          type: 'string',
        },
      },
      readOnly: true,
      required: ['id', 'name', 'ipAddress'],
      type: 'object',
    })
  })
})

describe('hlc field in origin event schemas', () => {
  describe('originCreationEventSchema', () => {
    it('accepts a valid hlc', () => {
      const hlc = getHLClock('ABC')
      const origin = originCreationEventSchema.parse({
        id: genOrigId(),
        name: 'Jane Doe',
        ipAddress: '192.168.1.1',
        hlc,
      })
      expect(origin.hlc).toBe(hlc)
    })

    it('hlc is undefined when absent', () => {
      const origin = originCreationEventSchema.parse({
        id: genOrigId(),
        name: 'Jane Doe',
        ipAddress: '192.168.1.1',
      })
      expect(origin.hlc).toBeUndefined()
    })

    it('rejects an invalid hlc', () => {
      expect(() =>
        originCreationEventSchema.parse({
          id: genOrigId(),
          name: 'Jane Doe',
          ipAddress: '192.168.1.1',
          hlc: 'not-valid',
        }),
      ).toThrow()
    })
  })
})
