import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import {
  decryptPayload,
  defaultKdfParams,
  deriveKey,
  encryptPayload,
  fromBase64,
  importKey,
  type KdfParams,
  randomBytes,
  toBase64,
  verifyPassword,
} from '@/store/actionLog/encryption/crypto.ts'
import { getMetaValue, setMetaValue } from '@/store/actionLog/meta.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'

// The file key, the password and the recovery key [FR-STO-5, D: OQ-STO-2, D: OQ-STO-3].
//
// A data key encrypts the change log's payloads. Two keys wrap it (AES-GCM over the 32 key bytes):
// - the password key, derived from the password with scrypt (`kdf_salt`, `kdf_params`) → `dek_pw_iv`, `dek_pw`;
// - the recovery key, 32 random bytes shown once as 24 words → `dek_rk_iv`, `dek_rk`.
// So changing the password rewraps the data key without touching the payloads or the recovery key.
//
// Checquery's files use the scrypt output itself as the payload key, with no wrapping. They still open with their
// password; the first password change (or recovery key) keeps that key as the data key and wraps it. In every file,
// `verify_iv`/`verify_ciphertext` hold a known plaintext under the data key, which confirms an unwrapped key.

const verifyPlaintext = 'checquery-verify'
const recoveryKeyBytes = 32

async function encryptBytes(key: CryptoKey, bytes: Uint8Array): Promise<{ iv: string; data: string }> {
  // encryptPayload takes a string; key bytes go through base64 so the stored layout stays AES-GCM over text.
  const { iv, encryptedPayload } = await encryptPayload(key, toBase64(bytes))
  return { iv, data: encryptedPayload }
}

async function decryptBytes(key: CryptoKey, iv: string, data: string): Promise<Uint8Array<ArrayBuffer>> {
  return fromBase64(await decryptPayload(key, iv, data))
}

async function rawKey(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key))
}

async function confirms(db: DbDriver, key: CryptoKey): Promise<boolean> {
  try {
    const iv = getMetaValue(db, 'verify_iv') ?? ''
    return (await decryptPayload(key, iv, getMetaValue(db, 'verify_ciphertext') ?? '')) === verifyPlaintext
  } catch {
    return false
  }
}

/** The recovery key as 24 words (BIP39 English list, with its checksum). */
export function recoveryKeyToWords(key: Uint8Array): string[] {
  return entropyToMnemonic(key, wordlist).split(' ')
}

/** The recovery key from its words, or null if they aren't a valid key (unknown word, wrong count or checksum). */
export function wordsToRecoveryKey(words: string): Uint8Array<ArrayBuffer> | null {
  const normalized = words.toLowerCase().trim().split(/\s+/).join(' ')
  try {
    const key = mnemonicToEntropy(normalized, wordlist)
    return key.length === recoveryKeyBytes ? new Uint8Array(key) : null
  } catch {
    return null
  }
}

/** Wraps the data key with a password: a fresh salt each time. */
async function wrapWithPassword(db: DbDriver, dek: CryptoKey, password: string): Promise<void> {
  const salt = toBase64(randomBytes(16))
  const params: KdfParams = defaultKdfParams
  const kek = await deriveKey(password, salt, params)
  const wrapped = await encryptBytes(kek, await rawKey(dek))
  setMetaValue(db, 'kdf_salt', salt)
  setMetaValue(db, 'kdf_params', JSON.stringify(params))
  setMetaValue(db, 'dek_pw_iv', wrapped.iv)
  setMetaValue(db, 'dek_pw', wrapped.data)
}

/** Wraps the data key with a new recovery key, replacing any earlier one, and returns the key's words. */
async function wrapWithNewRecoveryKey(db: DbDriver, dek: CryptoKey): Promise<string[]> {
  const recovery = randomBytes(recoveryKeyBytes)
  const wrapped = await encryptBytes(await importKey(recovery), await rawKey(dek))
  setMetaValue(db, 'dek_rk_iv', wrapped.iv)
  setMetaValue(db, 'dek_rk', wrapped.data)
  return recoveryKeyToWords(recovery)
}

async function writeVerify(db: DbDriver, dek: CryptoKey): Promise<void> {
  const { iv, encryptedPayload } = await encryptPayload(dek, verifyPlaintext)
  setMetaValue(db, 'verify_iv', iv)
  setMetaValue(db, 'verify_ciphertext', encryptedPayload)
}

/**
 * Sets up encryption for a file with a new random data key, wrapped by the password and a new recovery key. Writes
 * the meta values only; the caller encrypts any existing payloads. Returns the data key and the recovery words.
 */
export async function setUpEncryption(db: DbDriver, password: string): Promise<{ key: CryptoKey; words: string[] }> {
  const key = await importKey(randomBytes(32))
  await writeVerify(db, key)
  await wrapWithPassword(db, key, password)
  const words = await wrapWithNewRecoveryKey(db, key)
  setMetaValue(db, 'encrypted', 'true')
  return { key, words }
}

/** The data key from the password, or null if it's wrong. Opens Checquery's unwrapped files too. */
export async function unlockWithPassword(db: DbDriver, password: string): Promise<CryptoKey | null> {
  const salt = getMetaValue(db, 'kdf_salt')
  const params = getMetaValue(db, 'kdf_params')
  if (!salt || !params) return null
  const wrappedIv = getMetaValue(db, 'dek_pw_iv')
  const wrapped = getMetaValue(db, 'dek_pw')
  if (!wrappedIv || !wrapped) {
    // Checquery's scheme: the scrypt output is the data key.
    return verifyPassword(password, {
      kdfSalt: salt,
      kdfParams: JSON.parse(params),
      verifyIv: getMetaValue(db, 'verify_iv') ?? '',
      verifyCiphertext: getMetaValue(db, 'verify_ciphertext') ?? '',
    })
  }
  const kek = await deriveKey(password, salt, JSON.parse(params) as KdfParams)
  try {
    const dek = await importKey(await decryptBytes(kek, wrappedIv, wrapped))
    return (await confirms(db, dek)) ? dek : null
  } catch {
    return null
  }
}

/** The data key from the recovery key's words, or null if they're wrong or the file has no recovery key. */
export async function unlockWithRecoveryKey(db: DbDriver, words: string): Promise<CryptoKey | null> {
  const recovery = wordsToRecoveryKey(words)
  const iv = getMetaValue(db, 'dek_rk_iv')
  const wrapped = getMetaValue(db, 'dek_rk')
  if (!recovery || !iv || !wrapped) return null
  try {
    const dek = await importKey(await decryptBytes(await importKey(recovery), iv, wrapped))
    return (await confirms(db, dek)) ? dek : null
  } catch {
    return null
  }
}

/** True if the file has a recovery key. */
export function hasRecoveryKey(db: DbDriver): boolean {
  return Boolean(getMetaValue(db, 'dek_rk'))
}

/** Changes the password: rewraps the data key. The payloads and the recovery key are unchanged. */
export async function changePassword(db: DbDriver, dek: CryptoKey, newPassword: string): Promise<void> {
  if (newPassword.length === 0) throw new Error('A password is required.')
  if (!(await confirms(db, dek))) throw new Error('The key does not belong to this file.')
  await wrapWithPassword(db, dek, newPassword)
}

/** Replaces the recovery key (the old one stops working) and returns the new key's words. */
export async function replaceRecoveryKey(db: DbDriver, dek: CryptoKey): Promise<string[]> {
  if (!(await confirms(db, dek))) throw new Error('The key does not belong to this file.')
  return wrapWithNewRecoveryKey(db, dek)
}

/** Removes every key value, for a file whose payloads have been rewritten unencrypted. */
export function clearEncryption(db: DbDriver): void {
  for (const key of [
    'kdf_salt',
    'kdf_params',
    'dek_pw_iv',
    'dek_pw',
    'dek_rk_iv',
    'dek_rk',
    'verify_iv',
    'verify_ciphertext',
  ]) {
    db.run('DELETE FROM _checquery_meta WHERE key = ?', [key])
  }
  setMetaValue(db, 'encrypted', 'false')
}
