import { createId } from '@paralleldrive/cuid2'
import { acctCtgIdEquity } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { accountCreationEventSchema } from '@/ledger/accounts/Account.ts'
import { acctIdNetWorth, netWorthAccountName } from '@/ledger/accounts/NetWorthAccount.ts'
import { nameSchema } from '@/ledger/core/Name.ts'
import { genOrigId, type OrigId } from '@/ledger/origins/OrigId.ts'
import { originCreationEventSchema } from '@/ledger/origins/Origin.ts'
import { ActionLog } from '@/store/actionLog/ActionLog.ts'
import { AesGcmCodec } from '@/store/actionLog/encryption/AesGcmCodec.ts'
import {
  type FileCryptoMaterial,
  generateFileCryptoMaterial,
  generateNodeId,
  verifyPassword,
} from '@/store/actionLog/encryption/crypto.ts'
import type { PayloadCodec } from '@/store/actionLog/encryption/PayloadCodec.ts'
import { PlaintextCodec } from '@/store/actionLog/encryption/PlaintextCodec.ts'
import { getMetaValue, metaTableExists, setMetaValue } from '@/store/actionLog/meta.ts'
import {
  hasPendingMigrations,
  latestKnownVersion,
  readSchemaVersion,
  runMigrations,
} from '@/store/actionLog/migrations/runMigrations.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'
import { LedgerStore } from '@/store/ledger/LedgerStore.ts'
import { MaterializedStore } from '@/store/materialized/MaterializedStore.ts'

// Creating and opening a ledger file, from Checquery's db.ts without the file system or the server: the caller
// passes the file's database (the OPFS working copy in the app, bun:sqlite in tests) and a fresh in-memory database
// for the materialized store [NFR-ARCH-9, NFR-ARCH-10].

export interface OpenedLedger {
  store: LedgerStore
  /** The origin stamped on every change made in this session [FR-LED-4]; null when opened read-only. */
  origId: OrigId | null
  fileId: string
  encrypted: boolean
  /** The payload codec (holding the file key), reusable to reopen a fresh snapshot without the password. */
  codec: PayloadCodec
}

export type LedgerFileErrorCode =
  | 'not-a-ledger-file'
  | 'wrong-password'
  | 'password-required'
  | 'unsupported-version'
  | 'migration-required'

export class LedgerFileError extends Error {
  readonly code: LedgerFileErrorCode

  constructor(code: LedgerFileErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Finds or creates the origin for a device/user name [FR-LED-4], reusing an existing origin with the same name
 * rather than minting one per session.
 */
export async function bootstrapOrigin(store: LedgerStore, deviceName: string): Promise<OrigId> {
  const name = nameSchema.parse(deviceName)
  const existing = await store.svcs.origins.findOriginsAll()
  const match = existing.find((origin) => origin.name === name && origin.ipAddress === undefined)
  if (match) return match.id
  const created = await store.svcs.origins.createOrigin(originCreationEventSchema.parse({ id: genOrigId(), name }))
  return created!.id
}

/** Seeds Net Worth, the one EQUITY account, in a new file (an existing file's comes back through replay). */
async function bootstrapNetWorthAccount(store: LedgerStore, origId: OrigId): Promise<void> {
  await store.svcs.accounts.createAccount(
    accountCreationEventSchema.parse({
      id: acctIdNetWorth,
      origId,
      parentCtgId: acctCtgIdEquity,
      acctType: 'EQUITY',
      name: netWorthAccountName,
      isPrimary: false,
    }),
  )
}

/**
 * Initializes an empty database as a new ledger file: tables, metadata, encryption [FR-STO-5] (on unless `password`
 * is undefined), the session's origin and the Net Worth account.
 */
export async function createLedgerFile(
  db: DbDriver,
  memory: DbDriver,
  opts: { password: string | undefined; deviceName: string; fileId?: string },
): Promise<OpenedLedger> {
  if (opts.password !== undefined && opts.password.length === 0) {
    throw new LedgerFileError('password-required', 'A password is required.')
  }
  runMigrations(db)
  const fileId = opts.fileId ?? createId()
  const nodeId = generateNodeId()
  setMetaValue(db, 'file_id', fileId)
  setMetaValue(db, 'created_at', new Date().toISOString())
  setMetaValue(db, 'node_id', nodeId)

  let codec: PayloadCodec
  if (opts.password !== undefined) {
    const { material, key } = await generateFileCryptoMaterial(opts.password)
    setMetaValue(db, 'kdf_salt', material.kdfSalt)
    setMetaValue(db, 'kdf_params', JSON.stringify(material.kdfParams))
    setMetaValue(db, 'verify_iv', material.verifyIv)
    setMetaValue(db, 'verify_ciphertext', material.verifyCiphertext)
    codec = new AesGcmCodec(key)
  } else {
    codec = new PlaintextCodec()
  }
  setMetaValue(db, 'encrypted', opts.password !== undefined ? 'true' : 'false')

  const actionLog = await ActionLog.open(db, codec, nodeId)
  const store = await LedgerStore.open(actionLog, new MaterializedStore(memory))
  const origId = await bootstrapOrigin(store, opts.deviceName)
  await bootstrapNetWorthAccount(store, origId)
  return { store, origId, fileId, encrypted: opts.password !== undefined, codec }
}

/** Facts about a file readable before its password: is it a ledger, is it encrypted, does it need migrating. */
export interface LedgerFileInfo {
  fileId: string
  encrypted: boolean
  schemaVersion: number
  needsMigration: boolean
  /** The device that has (or last had) the file open for editing, if it didn't close it [FR-STO-4]. */
  openBy: OpenBy | null
}

/** Who has a file open for editing, refreshed by a heartbeat and cleared on close [FR-STO-4, D: OQ-STO-5]. */
export interface OpenBy {
  deviceId: string
  deviceName: string
  /** Last heartbeat, ms since the epoch. */
  at: number
}

export function readOpenBy(db: DbDriver): OpenBy | null {
  const value = getMetaValue(db, 'open_by')
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as OpenBy
    return typeof parsed.deviceId === 'string' && typeof parsed.at === 'number' ? parsed : null
  } catch {
    return null
  }
}

/** Records (or with null, clears) who has the file open. Not a change: content_version is untouched. */
export function writeOpenBy(db: DbDriver, openBy: OpenBy | null): void {
  setMetaValue(db, 'open_by', openBy ? JSON.stringify(openBy) : '')
}

export function inspectLedgerFile(db: DbDriver): LedgerFileInfo {
  const fileId = metaTableExists(db) ? getMetaValue(db, 'file_id') : null
  if (!fileId || !getMetaValue(db, 'node_id')) {
    throw new LedgerFileError('not-a-ledger-file', 'This is not a ProvisionLens or Checquery file (missing metadata).')
  }
  const schemaVersion = readSchemaVersion(db)
  if (schemaVersion > latestKnownVersion) {
    throw new LedgerFileError(
      'unsupported-version',
      'This file was created by a newer version of ProvisionLens. Please update the app.',
    )
  }
  // Files from before Checquery's "encrypted" flag were always encrypted [FR-STO-7].
  return {
    fileId,
    encrypted: getMetaValue(db, 'encrypted') !== 'false',
    schemaVersion,
    needsMigration: hasPendingMigrations(db),
    openBy: readOpenBy(db),
  }
}

function cryptoMaterial(db: DbDriver): FileCryptoMaterial {
  const kdfSalt = getMetaValue(db, 'kdf_salt')
  const kdfParams = getMetaValue(db, 'kdf_params')
  const verifyIv = getMetaValue(db, 'verify_iv')
  const verifyCiphertext = getMetaValue(db, 'verify_ciphertext')
  if (!kdfSalt || !kdfParams || !verifyIv || !verifyCiphertext) {
    throw new LedgerFileError('not-a-ledger-file', 'This file is missing its encryption metadata.')
  }
  return { kdfSalt, kdfParams: JSON.parse(kdfParams), verifyIv, verifyCiphertext }
}

export interface OpenLedgerOptions {
  password: string | undefined
  deviceName: string
  allowMigration: boolean
  /** Opens without writing anything: no migration, no origin (a second tab's snapshot, FR-STO-4). */
  readOnly?: boolean
  /** A codec from an earlier open of the same file, instead of the password. */
  codec?: PayloadCodec
}

/**
 * Opens an existing ledger file (ProvisionLens or Checquery): checks it, verifies the password, migrates it (only
 * with `allowMigration`, since a migrated file can't be opened by an older build [FR-STO-7]), replays the log into
 * the materialized store and records the session's origin.
 */
export async function openLedgerFile(db: DbDriver, memory: DbDriver, opts: OpenLedgerOptions): Promise<OpenedLedger> {
  const info = inspectLedgerFile(db)
  if (info.needsMigration && (!opts.allowMigration || opts.readOnly)) {
    throw new LedgerFileError('migration-required', 'This file needs to be upgraded before it can be opened.')
  }
  let codec: PayloadCodec
  if (opts.codec) {
    codec = opts.codec
  } else if (info.encrypted) {
    const key = await verifyPassword(opts.password ?? '', cryptoMaterial(db))
    if (!key) throw new LedgerFileError('wrong-password', 'Incorrect password.')
    codec = new AesGcmCodec(key)
  } else {
    codec = new PlaintextCodec()
  }
  const nodeId = getMetaValue(db, 'node_id')!
  const actionLog = opts.readOnly ? new ActionLog(db, codec, nodeId) : await ActionLog.open(db, codec, nodeId)
  const store = await LedgerStore.open(actionLog, new MaterializedStore(memory))
  const origId = opts.readOnly ? null : await bootstrapOrigin(store, opts.deviceName)
  return { store, origId, fileId: info.fileId, encrypted: info.encrypted, codec }
}
