import { scrypt } from '@noble/hashes/scrypt.js'

// Checquery's file encryption, on Web Crypto plus noble's scrypt so it runs in the store worker [FR-STO-5]. The
// formats are unchanged, so files written by Checquery's node:crypto code open here and the reverse: a base64
// salt, scrypt key derivation, AES-256-GCM with a fresh 12-byte IV per payload and the 16-byte auth tag appended
// to the ciphertext (Web Crypto's own layout), all base64-encoded.

/** scrypt parameters, stored per file so new files can use stronger ones without breaking old files. */
export interface KdfParams {
  N: number
  r: number
  p: number
  keylen: number
}

export const defaultKdfParams: KdfParams = { N: 32768, r: 8, p: 1, keylen: 32 }

const ivLength = 12

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

/**
 * Imports raw key bytes as an AES-GCM key. Extractable, so a recovery key can wrap it later [FR-STO-5]; it never
 * leaves the store worker.
 */
export function importKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt'])
}

/** Derives the file key from a password and a base64 salt, as Checquery's deriveKey does. */
export function deriveKey(password: string, saltB64: string, params: KdfParams): Promise<CryptoKey> {
  const raw = scrypt(password, fromBase64(saltB64), { N: params.N, r: params.r, p: params.p, dkLen: params.keylen })
  return importKey(raw as Uint8Array<ArrayBuffer>)
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Encrypts a string under a fresh random IV, returning both base64-encoded. */
export async function encryptPayload(
  key: CryptoKey,
  plaintext: string,
): Promise<{ iv: string; encryptedPayload: string }> {
  const iv = randomBytes(ivLength)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext))
  return { iv: toBase64(iv), encryptedPayload: toBase64(new Uint8Array(ciphertext)) }
}

/** Decrypts a payload from encryptPayload. Rejects if the key is wrong or the payload was tampered with. */
export async function decryptPayload(key: CryptoKey, ivB64: string, encryptedPayloadB64: string): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64) },
    key,
    fromBase64(encryptedPayloadB64),
  )
  return decoder.decode(plain)
}

/** Known plaintext encrypted under each file's key, so a password can be checked without reading the actions. */
const verifyPlaintext = 'checquery-verify'

export interface FileCryptoMaterial {
  kdfSalt: string
  kdfParams: KdfParams
  verifyIv: string
  verifyCiphertext: string
}

/** The 3-hex-digit node ID in this file's HLC values. Every file has one, encrypted or not. */
export function generateNodeId(): string {
  const [a = 0, b = 0] = randomBytes(2)
  return ((a << 8) | b).toString(16).padStart(4, '0').slice(0, 3).toUpperCase()
}

/** Fresh crypto material for a new password: what to store in the file's meta table, and the key to use now. */
export async function generateFileCryptoMaterial(
  password: string,
): Promise<{ material: FileCryptoMaterial; key: CryptoKey }> {
  const kdfSalt = toBase64(randomBytes(16))
  const kdfParams = defaultKdfParams
  const key = await deriveKey(password, kdfSalt, kdfParams)
  const { iv, encryptedPayload } = await encryptPayload(key, verifyPlaintext)
  return { material: { kdfSalt, kdfParams, verifyIv: iv, verifyCiphertext: encryptedPayload }, key }
}

/** The file key if the password is right (it decrypts the verify ciphertext); otherwise null. Never rejects. */
export async function verifyPassword(password: string, material: FileCryptoMaterial): Promise<CryptoKey | null> {
  const key = await deriveKey(password, material.kdfSalt, material.kdfParams)
  try {
    return (await decryptPayload(key, material.verifyIv, material.verifyCiphertext)) === verifyPlaintext ? key : null
  } catch {
    return null
  }
}
