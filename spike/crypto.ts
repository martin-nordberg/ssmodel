import { scrypt } from '@noble/hashes/scrypt.js'

// Checquery's file encryption, ported to browser APIs [FR-STO-5]: scrypt (from @noble/hashes) derives the key
// from the file password, and AES-256-GCM (Web Crypto) decrypts each action's payload. The formats match
// Checquery's node:crypto code (packages/server/src/persistence/actionLog/encryption/crypto.ts): base64 salt,
// 12-byte IV, and the 16-byte auth tag appended to the ciphertext, which is also Web Crypto's layout.

export interface KdfParams {
  N: number
  r: number
  p: number
  keylen: number
}

export interface FileCryptoMaterial {
  kdfSalt: string
  kdfParams: KdfParams
  verifyIv: string
  verifyCiphertext: string
}

const verifyPlaintext = 'checquery-verify'

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Derives the AES key from a password, as Checquery's deriveKey does. */
export async function deriveKey(password: string, saltB64: string, params: KdfParams): Promise<CryptoKey> {
  const raw = scrypt(password, fromBase64(saltB64), { N: params.N, r: params.r, p: params.p, dkLen: params.keylen })
  return crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['decrypt', 'encrypt'])
}

const decoder = new TextDecoder()

/** Decrypts one payload. Throws if the key is wrong or the payload was tampered with. */
export async function decryptPayload(key: CryptoKey, ivB64: string, payloadB64: string): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivB64) }, key, fromBase64(payloadB64))
  return decoder.decode(plain)
}

/** Returns the key if the password is right (it decrypts the file's verify ciphertext), otherwise null. */
export async function verifyPassword(password: string, material: FileCryptoMaterial): Promise<CryptoKey | null> {
  const key = await deriveKey(password, material.kdfSalt, material.kdfParams)
  try {
    return (await decryptPayload(key, material.verifyIv, material.verifyCiphertext)) === verifyPlaintext ? key : null
  } catch {
    return null
  }
}
