import { describe, expect, it } from 'bun:test'
import { createCipheriv, createDecipheriv, scryptSync } from 'node:crypto'
import {
  decryptPayload,
  defaultKdfParams,
  deriveKey,
  encryptPayload,
  fromBase64,
  generateFileCryptoMaterial,
  generateNodeId,
  importKey,
  toBase64,
  verifyPassword,
} from '@/store/actionLog/encryption/crypto.ts'

const rawOf = async (key: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', key))
const salt = (s: string) => toBase64(new TextEncoder().encode(s))

describe('deriveKey', () => {
  it('is deterministic for the same password, salt, and params', async () => {
    const key1 = await rawOf(await deriveKey('correct horse', salt('a fixed salt....'), defaultKdfParams))
    const key2 = await rawOf(await deriveKey('correct horse', salt('a fixed salt....'), defaultKdfParams))
    expect(key1).toEqual(key2)
  })

  it('produces a different key for a different password', async () => {
    const key1 = await rawOf(await deriveKey('correct horse', salt('a fixed salt....'), defaultKdfParams))
    const key2 = await rawOf(await deriveKey('wrong horse', salt('a fixed salt....'), defaultKdfParams))
    expect(key1).not.toEqual(key2)
  })

  it('produces a different key for a different salt', async () => {
    const key1 = await rawOf(await deriveKey('correct horse', salt('salt one........'), defaultKdfParams))
    const key2 = await rawOf(await deriveKey('correct horse', salt('salt two........'), defaultKdfParams))
    expect(key1).not.toEqual(key2)
  })

  it('produces a key of the requested length', async () => {
    const key = await rawOf(await deriveKey('correct horse', salt('a fixed salt....'), defaultKdfParams))
    expect(key.length).toBe(defaultKdfParams.keylen)
  })

  // FR-STO-5: compatible with Checquery's node:crypto scryptSync (the same parameters give the same key).
  it("matches Checquery's node:crypto scrypt", async () => {
    const s = salt('a fixed salt....')
    const node = scryptSync('correct horse', Buffer.from(s, 'base64'), 32, { N: 32768, r: 8, p: 1, maxmem: 64 << 20 })
    expect(await rawOf(await deriveKey('correct horse', s, defaultKdfParams))).toEqual(new Uint8Array(node))
  })
})

const raw = new Uint8Array(32).fill(7)
const key = await importKey(raw)

describe('encryptPayload / decryptPayload', () => {
  it('round-trips a plaintext string', async () => {
    const { iv, encryptedPayload } = await encryptPayload(key, 'hello, checquery')
    expect(await decryptPayload(key, iv, encryptedPayload)).toBe('hello, checquery')
  })

  it('round-trips JSON payloads', async () => {
    const payload = JSON.stringify({ id: 'acct123', amount: '$1,234.56' })
    const { iv, encryptedPayload } = await encryptPayload(key, payload)
    expect(await decryptPayload(key, iv, encryptedPayload)).toBe(payload)
  })

  it('generates a fresh iv on every call', async () => {
    const first = await encryptPayload(key, 'same plaintext')
    const second = await encryptPayload(key, 'same plaintext')
    expect(first.iv).not.toBe(second.iv)
    expect(first.encryptedPayload).not.toBe(second.encryptedPayload)
  })

  it('rejects when decrypting with the wrong key', async () => {
    const { iv, encryptedPayload } = await encryptPayload(key, 'secret')
    const wrongKey = await importKey(new Uint8Array(32).fill(9))
    await expect(decryptPayload(wrongKey, iv, encryptedPayload)).rejects.toThrow()
  })

  it('rejects when the ciphertext has been tampered with', async () => {
    const { iv, encryptedPayload } = await encryptPayload(key, 'secret')
    const tampered = fromBase64(encryptedPayload)
    tampered[0] = tampered[0]! ^ 0xff
    await expect(decryptPayload(key, iv, toBase64(tampered))).rejects.toThrow()
  })

  // FR-STO-5: the same byte layout as Checquery's node:crypto code, in both directions.
  it("decrypts Checquery's node:crypto output", async () => {
    const iv = Buffer.alloc(12, 3)
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(raw), iv)
    const ciphertext = Buffer.concat([cipher.update('from checquery', 'utf8'), cipher.final(), cipher.getAuthTag()])
    expect(await decryptPayload(key, iv.toString('base64'), ciphertext.toString('base64'))).toBe('from checquery')
  })

  it("is decrypted by Checquery's node:crypto code", async () => {
    const { iv, encryptedPayload } = await encryptPayload(key, 'to checquery')
    const combined = Buffer.from(encryptedPayload, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(raw), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(combined.subarray(combined.length - 16))
    const plain = Buffer.concat([decipher.update(combined.subarray(0, combined.length - 16)), decipher.final()])
    expect(plain.toString('utf8')).toBe('to checquery')
  })
})

describe('generateFileCryptoMaterial / verifyPassword', () => {
  it('verifies successfully with the correct password', async () => {
    const { material, key } = await generateFileCryptoMaterial('correct horse battery staple')
    const verifiedKey = await verifyPassword('correct horse battery staple', material)
    expect(verifiedKey).not.toBeNull()
    expect(await rawOf(verifiedKey!)).toEqual(await rawOf(key))
  })

  it('returns null (does not reject) for the wrong password', async () => {
    const { material } = await generateFileCryptoMaterial('correct horse battery staple')
    expect(await verifyPassword('wrong password', material)).toBeNull()
  })

  it('generates a different kdfSalt on every call', async () => {
    const a = await generateFileCryptoMaterial('same password')
    const b = await generateFileCryptoMaterial('same password')
    expect(a.material.kdfSalt).not.toBe(b.material.kdfSalt)
    expect(await rawOf(a.key)).not.toEqual(await rawOf(b.key))
  })
})

describe('generateNodeId', () => {
  it('generates a 3-character uppercase hex nodeId', () => {
    expect(generateNodeId()).toMatch(/^[0-9A-F]{3}$/)
  })

  it('generates different values across calls (not a hard guarantee, but overwhelmingly likely)', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateNodeId()))
    expect(ids.size).toBeGreaterThan(1)
  })
})
