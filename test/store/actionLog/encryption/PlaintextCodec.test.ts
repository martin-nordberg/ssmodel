import { describe, expect, it } from 'bun:test'
import { PlaintextCodec } from '@/store/actionLog/encryption/PlaintextCodec.ts'

describe('PlaintextCodec', () => {
  const codec = new PlaintextCodec()

  it('round-trips a plaintext string unchanged', async () => {
    const { iv, payload } = await codec.encode('hello, checquery')
    expect(payload).toBe('hello, checquery')
    expect(await codec.decode(iv, payload)).toBe('hello, checquery')
  })

  it('produces an empty iv', async () => {
    const { iv } = await codec.encode('anything')
    expect(iv).toBe('')
  })

  it('round-trips JSON payloads', async () => {
    const json = JSON.stringify({ id: 'acct123', amount: '$1,234.56' })
    const { iv, payload } = await codec.encode(json)
    expect(await codec.decode(iv, payload)).toBe(json)
  })
})
