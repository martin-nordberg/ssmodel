import { describe, expect, it } from 'bun:test'
import { AesGcmCodec } from '@/store/actionLog/encryption/AesGcmCodec.ts'
import { fromBase64, importKey, toBase64 } from '@/store/actionLog/encryption/crypto.ts'

const keyOf = (fill: number) => importKey(new Uint8Array(32).fill(fill))

const codec = new AesGcmCodec(await keyOf(7))

describe('AesGcmCodec', () => {
  it('round-trips a plaintext string', async () => {
    const { iv, payload } = await codec.encode('hello, checquery')
    expect(await codec.decode(iv, payload)).toBe('hello, checquery')
  })

  it('generates a fresh iv on every call', async () => {
    const first = await codec.encode('same plaintext')
    const second = await codec.encode('same plaintext')
    expect(first.iv).not.toBe(second.iv)
    expect(first.payload).not.toBe(second.payload)
  })

  it('rejects when decoding with a different key', async () => {
    const { iv, payload } = await codec.encode('secret')
    const other = new AesGcmCodec(await keyOf(9))
    await expect(other.decode(iv, payload)).rejects.toThrow()
  })

  it('rejects when the payload has been tampered with', async () => {
    const { iv, payload } = await codec.encode('secret')
    const tampered = fromBase64(payload)
    tampered[0] = tampered[0]! ^ 0xff
    await expect(codec.decode(iv, toBase64(tampered))).rejects.toThrow()
  })
})
