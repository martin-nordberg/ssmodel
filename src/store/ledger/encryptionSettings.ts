import { AesGcmCodec } from '@/store/actionLog/encryption/AesGcmCodec.ts'
import {
  changePassword,
  clearEncryption,
  replaceRecoveryKey,
  setUpEncryption,
} from '@/store/actionLog/encryption/keys.ts'
import type { PayloadCodec } from '@/store/actionLog/encryption/PayloadCodec.ts'
import { PlaintextCodec } from '@/store/actionLog/encryption/PlaintextCodec.ts'
import { bumpContentVersion } from '@/store/actionLog/meta.ts'
import { type DbDriver, exclusiveAsyncTransaction } from '@/store/driver/DbDriver.ts'
import type { LedgerStore } from '@/store/ledger/LedgerStore.ts'

// File encryption settings [FR-STO-5, D: OQ-STO-2, D: OQ-STO-3]: change the password, replace the recovery key, turn
// encryption on or off. Each is one transaction on the open file and counts as a change (it must be saved). Callers
// run these through LedgerSession.exclusive so no command interleaves.

export class EncryptionSettingsError extends Error {}

function dataKey(codec: PayloadCodec): CryptoKey {
  if (!(codec instanceof AesGcmCodec)) throw new EncryptionSettingsError('This file is not encrypted.')
  return codec.key
}

export async function changeFilePassword(db: DbDriver, codec: PayloadCodec, newPassword: string): Promise<void> {
  if (newPassword.length === 0) throw new EncryptionSettingsError('A password is required.')
  const key = dataKey(codec)
  await exclusiveAsyncTransaction(db, async () => {
    await changePassword(db, key, newPassword)
    bumpContentVersion(db)
  })
}

/** Replaces the recovery key; the old one stops working. Returns the new key's words, to show once. */
export async function newRecoveryKey(db: DbDriver, codec: PayloadCodec): Promise<string[]> {
  const key = dataKey(codec)
  return exclusiveAsyncTransaction(db, async () => {
    const words = await replaceRecoveryKey(db, key)
    bumpContentVersion(db)
    return words
  })
}

/** Encrypts an unencrypted file: a new data key, every payload rewritten. Returns the new codec and recovery words. */
export async function turnEncryptionOn(
  db: DbDriver,
  store: LedgerStore,
  codec: PayloadCodec,
  password: string,
): Promise<{ codec: PayloadCodec; words: string[] }> {
  if (codec instanceof AesGcmCodec) throw new EncryptionSettingsError('This file is already encrypted.')
  if (password.length === 0) throw new EncryptionSettingsError('A password is required.')
  return exclusiveAsyncTransaction(db, async () => {
    const { key, words } = await setUpEncryption(db, password)
    bumpContentVersion(db)
    const next = new AesGcmCodec(key)
    await store.actionLog.rewritePayloads(next) // last: it switches the log's codec only when it succeeds
    return { codec: next, words }
  })
}

/** Decrypts an encrypted file: every payload rewritten as plain JSON, every key removed. */
export async function turnEncryptionOff(db: DbDriver, store: LedgerStore, codec: PayloadCodec): Promise<PayloadCodec> {
  dataKey(codec)
  return exclusiveAsyncTransaction(db, async () => {
    clearEncryption(db)
    bumpContentVersion(db)
    const next = new PlaintextCodec()
    await store.actionLog.rewritePayloads(next)
    return next
  })
}
