import { createId } from '@paralleldrive/cuid2'
import { ActionLog } from '@/store/actionLog/ActionLog.ts'
import { AesGcmCodec } from '@/store/actionLog/encryption/AesGcmCodec.ts'
import { generateNodeId } from '@/store/actionLog/encryption/crypto.ts'
import { setUpEncryption, unlockWithPassword } from '@/store/actionLog/encryption/keys.ts'
import type { PayloadCodec } from '@/store/actionLog/encryption/PayloadCodec.ts'
import { PlaintextCodec } from '@/store/actionLog/encryption/PlaintextCodec.ts'
import { setMetaValue } from '@/store/actionLog/meta.ts'
import { runAllMigrations, runMigrations } from '@/store/actionLog/migrations/runMigrations.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'
import { LedgerStore } from '@/store/ledger/LedgerStore.ts'
import { bootstrapOrigin, inspectLedgerFile, LedgerFileError, type OpenedLedger } from '@/store/ledger/ledgerFile.ts'
import { MaterializedStore } from '@/store/materialized/MaterializedStore.ts'

// Converting the household's .checquery file to a new .plens file, once [FR-MIG-1, D: OQ-STO-7]: decrypt it with its
// password, migrate a copy (amounts to cents), and copy every action, with its original timestamp (HLC), into a
// new file encrypted with ProvisionLens's key scheme and a new recovery key. The original is never modified: `src`
// is an in-memory copy of its bytes. Roles come later (P3); the accounts carry over as they are.

export interface ConvertOptions {
  /** The Checquery file's password. */
  password: string
  /** The new file's password; the Checquery password when omitted. Undefined: the new file is not encrypted. */
  newPassword?: string | undefined
  deviceName: string
  /** The new file's id (the store names its working copy by it); a new one when omitted. */
  fileId?: string
}

export interface ConvertResult extends OpenedLedger {
  /** Actions copied. */
  actions: number
}

export async function convertChecquery(
  src: DbDriver,
  dst: DbDriver,
  memory: DbDriver,
  opts: ConvertOptions,
): Promise<ConvertResult> {
  const info = inspectLedgerFile(src)
  let srcCodec: PayloadCodec
  if (info.encrypted) {
    const key = await unlockWithPassword(src, opts.password)
    if (!key) throw new LedgerFileError('wrong-password', 'Incorrect password.')
    srcCodec = new AesGcmCodec(key)
  } else {
    srcCodec = new PlaintextCodec()
  }
  await runAllMigrations(src, srcCodec)
  const source = new ActionLog(src, srcCodec, 'CNV')

  // The new file: its own id and node, ProvisionLens encryption, and the same actions in the same order.
  runMigrations(dst)
  const fileId = opts.fileId ?? createId()
  const nodeId = generateNodeId()
  setMetaValue(dst, 'file_id', fileId)
  setMetaValue(dst, 'created_at', new Date().toISOString())
  setMetaValue(dst, 'node_id', nodeId)
  setMetaValue(dst, 'converted_from', `checquery:${info.fileId}`)
  const newPassword = 'newPassword' in opts ? opts.newPassword : opts.password
  let codec: PayloadCodec
  let recoveryWords: string[] | null = null
  if (newPassword !== undefined) {
    const { key, words } = await setUpEncryption(dst, newPassword)
    codec = new AesGcmCodec(key)
    recoveryWords = words
  } else {
    codec = new PlaintextCodec()
    setMetaValue(dst, 'encrypted', 'false')
  }
  const target = await ActionLog.open(dst, codec, nodeId)
  let actions = 0
  for await (const action of source.readActions()) {
    // The payload carries its hlc, so the copy keeps the original order and timestamps.
    await target.appendAction(action.actionType, action.payload as { id: string })
    actions++
  }
  const store = await LedgerStore.open(target, new MaterializedStore(memory))
  const origId = await bootstrapOrigin(store, opts.deviceName)
  return { store, origId, fileId, encrypted: newPassword !== undefined, codec, recoveryWords, actions }
}
