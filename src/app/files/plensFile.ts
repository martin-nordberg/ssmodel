import { toast } from 'sonner'
import { create } from 'zustand'
import { useSettings } from '@/state/settingsStore.ts'
import { getStoreClient, StoreError } from '@/state/storeClient.ts'
import { Autosaver, type AutosaveStatus } from '@/store/file/autosave.ts'
import { readRollingBackup, saveRollingBackup, writeFolderBackup } from '@/store/file/backup.ts'
import { FileChannel } from '@/store/file/broadcast.ts'
import { pickPlensToOpen, pickPlensToSave, readBytes, writeBytes } from '@/store/file/handles.ts'
import { deviceId, type FileLock, lockFileWithin, tryLockFile } from '@/store/file/lock.ts'
import type { OpenBy } from '@/store/ledger/ledgerFile.ts'
import { pickChecquery } from './convertChecquery.ts'
import { ensurePermission } from './fileAccess.ts'
import { forgetRecent, getStored, putStored, type RecentFile, rememberRecent } from './recentFiles.ts'

// The open .plens file [FR-STO-1 … FR-STO-4, FR-STO-7]: New, Open…, Close, Save a copy… and recent files, with the
// working copy in the store worker and autosave back to the user's file. One tab edits a file (Web Lock); another tab
// opens it read-only and follows the editor's changes over a BroadcastChannel. The editing device is recorded in the
// file with a heartbeat, so opening it on another device warns first. Questions for the user are posted as a
// `prompt` that PlensDialogs renders and answers.

/** How the user unlocks an encrypted file: its password, or its recovery key's words [FR-STO-5]. */
export type Unlock = { password: string } | { recoveryWords: string }

export type Prompt = { id: number } & (
  | { kind: 'new-password'; resolve: (answer: { password: string | undefined } | null) => void }
  | {
      kind: 'password'
      name: string
      error: string | null
      /** The dialog's title; "Open <name>" when omitted. */
      title?: string
      /** Offer the recovery key instead (not for a Checquery file, which has none). */
      allowRecovery?: boolean
      resolve: (answer: Unlock | null) => void
    }
  | { kind: 'set-password'; title: string; description: string; resolve: (password: string | null) => void }
  | { kind: 'recovery-key'; words: string[]; resolve: (done: true) => void }
  | { kind: 'confirm'; title: string; description: string; action: string; resolve: (ok: boolean) => void }
  | { kind: 'recover'; name: string; resolve: (source: 'working-copy' | 'file' | null) => void }
  | { kind: 'migrate'; name: string; resolve: (ok: boolean) => void }
  | { kind: 'other-device'; name: string; openBy: OpenBy; resolve: (ok: boolean) => void }
)

export interface OpenPlens {
  name: string
  handle: FileSystemFileHandle
  fileId: string
  encrypted: boolean
  /** Open for editing in another tab or window: this one follows it and refuses edits. */
  readOnly: boolean
}

interface PlensState {
  file: OpenPlens | null
  autosave: AutosaveStatus
  prompt: Prompt | null
}

export const usePlensFile = create<PlensState>()(() => ({
  file: null,
  autosave: { state: 'saved', lastSavedAt: null, error: null },
  prompt: null,
}))

/** How often the editing tab refreshes the file's open-by marker, and how old a marker is taken as stale. */
const heartbeatMs = 5 * 60_000
const staleOpenByMs = 15 * 60_000

/** Everything that lives while a file is open, torn down by closePlens. */
let session: {
  autosaver: Autosaver | null
  lock: FileLock | null
  channel: FileChannel
  cleanups: (() => void)[]
} | null = null

/** Autosave pause; `?autosaveMs=N` overrides it (e2e tests). */
function autosaveDelay(): number {
  const requested = Number(new URLSearchParams(globalThis.location?.search ?? '').get('autosaveMs'))
  return requested > 0 ? requested : 5000
}

let nextPromptId = 1

function ask<P extends Prompt>(prompt: Omit<P, 'resolve' | 'id'>): Promise<Parameters<P['resolve']>[0]> {
  return new Promise((resolve) => {
    usePlensFile.setState({
      prompt: {
        ...prompt,
        id: nextPromptId++,
        resolve: (answer: unknown) => {
          usePlensFile.setState({ prompt: null })
          resolve(answer as Parameters<P['resolve']>[0])
        },
      } as Prompt,
    })
  })
}

function deviceName(): string {
  return useSettings.getState().deviceName.trim() || 'This device'
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Starts editing the newly open file: autosave, the open-by heartbeat, and serving read-only tabs. */
async function attachWriter(file: Omit<OpenPlens, 'readOnly'>, lock: FileLock, channel: FileChannel): Promise<void> {
  const client = getStoreClient()
  const autosaver = new Autosaver({
    delayMs: autosaveDelay(),
    save: async () => writeBytes(file.handle, await client.request('export', {})),
  })
  autosaver.subscribe((autosave) => usePlensFile.setState({ autosave }))
  const markOpen = () =>
    client.request('setOpenBy', { openBy: { deviceId: deviceId(), deviceName: deviceName(), at: Date.now() } })
  const heartbeat = setInterval(() => {
    void markOpen().then(() => {
      autosaver.noteChange()
      return autosaver.flush()
    })
  }, heartbeatMs)
  const cleanups = [
    client.subscribe((n) => {
      if (n.kind !== 'change') return
      autosaver.noteChange()
      channel.announceChange()
    }),
    channel.serveSnapshots(() => client.request('export', {})),
    () => clearInterval(heartbeat),
  ]
  session = { autosaver, lock, channel, cleanups }
  // The file is saved at once (below), so it shows as pending until then, never "Saved" before the first save.
  autosaver.noteChange()
  usePlensFile.setState({ file: { ...file, readOnly: false }, autosave: autosaver.current })
  await rememberRecent(file.handle, 'plens')
  // Record this device in the file and save, with any new, recovered or migrated content [FR-STO-4].
  await markOpen()
  await autosaver.flush()
}

/** Follows a file that another tab is editing: reload its snapshot after each announced change. */
function attachReader(file: Omit<OpenPlens, 'readOnly'>, channel: FileChannel): void {
  const client = getStoreClient()
  let timer: ReturnType<typeof setTimeout> | null = null
  let reloading = Promise.resolve()
  const refresh = () => {
    reloading = reloading.then(async () => {
      const bytes = await channel.requestSnapshot()
      if (bytes) await client.request('reload', { bytes }).catch(() => undefined)
    })
  }
  const cleanups = [
    channel.onChanged(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 50)
    }),
    channel.onClosed(() => toast.info(`${file.name} was closed in the other window. Reopen it here to edit.`)),
    () => timer && clearTimeout(timer),
  ]
  session = { autosaver: null, lock: null, channel, cleanups }
  usePlensFile.setState({ file: { ...file, readOnly: true } })
}

/** Closes the open file after saving it. Returns false if the user chose to keep it open. */
export async function closePlens(): Promise<boolean> {
  const { file } = usePlensFile.getState()
  if (!file || !session) return true
  const client = getStoreClient()
  const { autosaver, lock, channel, cleanups } = session
  let saved = true
  if (autosaver) {
    await client.request('setOpenBy', { openBy: null }).catch(() => undefined)
    autosaver.noteChange()
    saved = await autosaver.flush()
    if (!saved) {
      const close = window.confirm(
        `${file.name} could not be saved (${usePlensFile.getState().autosave.error}). Close anyway? ` +
          'The unsaved changes stay in this browser and are offered the next time you open the file.',
      )
      if (!close) return false
    }
    if (saved) await backUp(file)
    autosaver.dispose()
    channel.announceClosed()
  }
  for (const cleanup of cleanups) cleanup()
  channel.close()
  session = null
  await client.request('close', { keepWorkingCopy: !saved })
  lock?.release()
  usePlensFile.setState({ file: null, autosave: { state: 'saved', lastSavedAt: null, error: null } })
  return true
}

/** File › New: asks for a password (or no encryption) and where to save, then creates the file. */
export async function newPlens(): Promise<void> {
  if (!(await closePlens())) return
  const answer = await ask<Extract<Prompt, { kind: 'new-password' }>>({ kind: 'new-password' })
  if (!answer) return
  const handle = await pickPlensToSave('Household.plens')
  if (!handle) return
  try {
    const client = getStoreClient()
    const opened = await client.request('create', { password: answer.password, deviceName: deviceName() })
    const lock = await tryLockFile(opened.fileId)
    if (!lock) throw new Error('the new file is locked by another tab')
    const file = { name: handle.name, handle, fileId: opened.fileId, encrypted: opened.encrypted }
    await attachWriter(file, lock, new FileChannel(opened.fileId))
    if (opened.recoveryWords) await showRecoveryKey(opened.recoveryWords)
    toast.success(`Created ${handle.name}`)
  } catch (err) {
    toast.error(`Could not create the file: ${errorText(err)}`)
  }
}

/**
 * Asks for the password (or the recovery key) until it's right or the user cancels, then opens with it. Resolves
 * with the result and whether the recovery key was used.
 */
async function withUnlock<T>(
  name: string,
  encrypted: boolean,
  open: (unlock: { password: string | undefined; recoveryWords?: string }) => Promise<T>,
): Promise<{ result: T; usedRecoveryKey: boolean } | null> {
  if (!encrypted) return { result: await open({ password: undefined }), usedRecoveryKey: false }
  let error: string | null = null
  for (;;) {
    const answer = await ask<Extract<Prompt, { kind: 'password' }>>({ kind: 'password', name, error })
    if (answer === null) return null
    try {
      if ('recoveryWords' in answer) {
        return {
          result: await open({ password: undefined, recoveryWords: answer.recoveryWords }),
          usedRecoveryKey: true,
        }
      }
      return { result: await open({ password: answer.password }), usedRecoveryKey: false }
    } catch (err) {
      if (err instanceof StoreError && err.code === 'wrong-password') {
        error = 'That password is not right. Try again.'
        continue
      }
      if (err instanceof StoreError && err.code === 'wrong-recovery-key') {
        error = "Those words aren't this file's recovery key. Check them and try again."
        continue
      }
      throw err
    }
  }
}

/** Opens a file handle: lock, recovery, migration, other-device and password questions as needed. */
export async function openPlensHandle(handle: FileSystemFileHandle): Promise<void> {
  if (!(await closePlens())) return
  const client = getStoreClient()
  let lock: FileLock | null = null
  let channel: FileChannel | null = null
  try {
    const bytes = await readBytes(handle)
    const info = await client.request('inspect', { bytes: bytes.slice() })
    const file = { name: handle.name, handle, fileId: info.fileId, encrypted: info.encrypted }
    channel = new FileChannel(info.fileId)
    lock = await tryLockFile(info.fileId)
    let snapshot: Uint8Array | null = null
    if (!lock) {
      // A tab editing the file answers at once. No answer means the lock belongs to a tab that just closed or
      // crashed, which releases it shortly.
      snapshot = await channel.requestSnapshot()
      if (snapshot === null) lock = await lockFileWithin(info.fileId, 3000)
    }

    if (!lock) {
      // Open for editing in another tab or window: follow it read-only [FR-STO-4].
      const reader = channel
      const opened = await withUnlock(handle.name, info.encrypted, async (unlock) => {
        const latest = (await reader.requestSnapshot()) ?? snapshot ?? bytes
        return client.request('openReadOnly', { bytes: latest, ...unlock })
      })
      if (!opened) return reader.close()
      attachReader(file, reader)
      await rememberRecent(handle, 'plens')
      toast.info(`${handle.name} is open for editing in another window, so it opened read-only here.`)
      return
    }

    let source: 'file' | 'working-copy' = 'file'
    const workingVersion = await client.request('workingCopyVersion', { fileId: info.fileId })
    if (workingVersion !== null && workingVersion > info.contentVersion) {
      const choice = await ask<Extract<Prompt, { kind: 'recover' }>>({ kind: 'recover', name: handle.name })
      if (!choice) return cancel()
      source = choice
    }
    if (info.needsMigration) {
      const ok = await ask<Extract<Prompt, { kind: 'migrate' }>>({ kind: 'migrate', name: handle.name })
      if (!ok) return cancel()
    }
    const openBy = info.openBy
    if (openBy && openBy.deviceId !== deviceId() && Date.now() - openBy.at < staleOpenByMs) {
      const ok = await ask<Extract<Prompt, { kind: 'other-device' }>>({
        kind: 'other-device',
        name: handle.name,
        openBy,
      })
      if (!ok) return cancel()
    }
    const opened = await withUnlock(handle.name, info.encrypted, (unlock) =>
      client.request('open', {
        bytes: bytes.slice(),
        ...unlock,
        deviceName: deviceName(),
        allowMigration: info.needsMigration,
        source,
      }),
    )
    if (!opened) return cancel()
    await attachWriter(file, lock, channel)
    if (opened.usedRecoveryKey) {
      // Opened with the recovery key: the password was forgotten, so set a new one now.
      const password = await ask<Extract<Prompt, { kind: 'set-password' }>>({
        kind: 'set-password',
        title: 'Set a new password',
        description: `You opened ${handle.name} with its recovery key. Choose a new password; the recovery key keeps working.`,
      })
      if (password) await changePlensPassword(password)
    }
    toast.success(source === 'working-copy' ? `Recovered unsaved changes in ${handle.name}` : `Opened ${handle.name}`)
  } catch (err) {
    cancel()
    toast.error(`Could not open ${handle.name}: ${errorText(err)}`)
  }

  function cancel(): void {
    lock?.release()
    channel?.close()
  }
}

/** File › Open… */
export async function openPlens(): Promise<void> {
  const handle = await pickPlensToOpen()
  if (handle) await openPlensHandle(handle)
}

export async function openRecentPlens(recent: RecentFile): Promise<void> {
  if (!(await ensurePermission(recent.handle))) return
  try {
    await recent.handle.getFile()
  } catch {
    await forgetRecent(recent.handle, 'plens')
    toast.error(`${recent.name} is no longer available.`)
    return
  }
  await openPlensHandle(recent.handle)
}

/** File › Save a copy…: writes the current database to another file; the open file stays the same. */
export async function savePlensCopy(): Promise<void> {
  const { file } = usePlensFile.getState()
  if (!file) return
  const handle = await pickPlensToSave(file.name.replace(/\.plens$/, ' copy.plens'))
  if (!handle) return
  try {
    await writeBytes(handle, await getStoreClient().request('export', {}))
    toast.success(`Saved a copy as ${handle.name}`)
  } catch (err) {
    toast.error(`Could not save a copy: ${errorText(err)}`)
  }
}

/** Saves now (the app being hidden, FR-STO-3). */
export function flushPlens(): Promise<boolean> {
  return session?.autosaver ? session.autosaver.flush() : Promise.resolve(true)
}

/** True while changes aren't yet in the user's file. */
export function hasUnsavedPlens(): boolean {
  const { file, autosave } = usePlensFile.getState()
  return file !== null && !file.readOnly && autosave.state !== 'saved'
}

/** Shows a recovery key once, until the user confirms they've kept it [FR-STO-5]. */
async function showRecoveryKey(words: string[]): Promise<void> {
  await ask<Extract<Prompt, { kind: 'recovery-key' }>>({ kind: 'recovery-key', words })
}

/** A change made outside the change log (password, encryption): save it now. */
async function saveFileChange(): Promise<void> {
  session?.autosaver?.noteChange()
  await flushPlens()
}

/** Copies the file to the rolling OPFS backups and, at most daily, to the backup folder [FR-STO-6]. */
async function backUp(file: OpenPlens): Promise<void> {
  try {
    const bytes = await getStoreClient().request('export', {})
    await saveRollingBackup(file.fileId, bytes)
    const folder = await backupFolder()
    if (folder && (await ensurePermission(folder as unknown as FileSystemFileHandle))) {
      await writeFolderBackup(folder, file.name, bytes)
    }
  } catch (err) {
    toast.warning(`The backup of ${file.name} failed: ${errorText(err)}`)
  }
}

// File settings [FR-STO-5, FR-STO-6].

export async function changePlensPassword(password?: string): Promise<void> {
  const next =
    password ??
    (await ask<Extract<Prompt, { kind: 'set-password' }>>({
      kind: 'set-password',
      title: 'Change password',
      description: 'The recovery key keeps working with the new password.',
    }))
  if (!next) return
  try {
    await getStoreClient().request('changePassword', { newPassword: next })
    await saveFileChange()
    toast.success('Password changed')
  } catch (err) {
    toast.error(`Could not change the password: ${errorText(err)}`)
  }
}

export async function replacePlensRecoveryKey(): Promise<void> {
  const ok = await ask<Extract<Prompt, { kind: 'confirm' }>>({
    kind: 'confirm',
    title: 'Create a new recovery key?',
    description: 'The current recovery key will stop working. Keep the new one somewhere safe.',
    action: 'Create new key',
  })
  if (!ok) return
  try {
    const { words } = await getStoreClient().request('newRecoveryKey', {})
    await saveFileChange()
    await showRecoveryKey(words)
  } catch (err) {
    toast.error(`Could not create a recovery key: ${errorText(err)}`)
  }
}

export async function setPlensEncryption(on: boolean): Promise<void> {
  const { file } = usePlensFile.getState()
  if (!file) return
  let password: string | undefined
  if (on) {
    const answer = await ask<Extract<Prompt, { kind: 'set-password' }>>({
      kind: 'set-password',
      title: 'Turn on encryption',
      description: 'Choose the password that will be needed to open this file.',
    })
    if (!answer) return
    password = answer
  } else {
    const ok = await ask<Extract<Prompt, { kind: 'confirm' }>>({
      kind: 'confirm',
      title: 'Turn off encryption?',
      description:
        "Anyone who gets the file, or a backup of it, will be able to read your household's finances. Use this only for test files.",
      action: 'Turn off encryption',
    })
    if (!ok) return
  }
  try {
    const { recoveryWords } = await getStoreClient().request('setEncryption', { password })
    usePlensFile.setState({ file: { ...file, encrypted: on } })
    await saveFileChange()
    if (recoveryWords) await showRecoveryKey(recoveryWords)
    toast.success(on ? 'Encryption turned on' : 'Encryption turned off')
  } catch (err) {
    toast.error(`Could not change encryption: ${errorText(err)}`)
  }
}

/** The backup folder: kept in memory for this session and in IndexedDB across sessions. */
let backupFolderHandle: FileSystemDirectoryHandle | null | undefined

async function backupFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (backupFolderHandle === undefined) {
    backupFolderHandle = (await getStored<FileSystemDirectoryHandle>('backupFolder')) ?? null
  }
  return backupFolderHandle
}

export async function chooseBackupFolder(): Promise<string | null> {
  try {
    const folder = await window.showDirectoryPicker!({ id: 'plens-backups', mode: 'readwrite' })
    backupFolderHandle = folder
    await putStored('backupFolder', folder)
    return folder.name
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    toast.error(`Could not use that folder: ${errorText(e)}`)
    return null
  }
}

export async function stopBackupFolder(): Promise<void> {
  backupFolderHandle = null
  await putStored('backupFolder', undefined)
}

export async function backupFolderName(): Promise<string | null> {
  return (await backupFolder())?.name ?? null
}

/** Saves one of the open file's rolling backups as a new file. */
export async function saveRollingBackupAs(name: string): Promise<void> {
  const { file } = usePlensFile.getState()
  if (!file) return
  const handle = await pickPlensToSave(`${file.name.replace(/\.plens$/, '')} backup ${name.slice(0, 10)}.plens`)
  if (!handle) return
  try {
    await writeBytes(handle, await readRollingBackup(file.fileId, name))
    toast.success(`Saved the backup as ${handle.name}`)
  } catch (err) {
    toast.error(`Could not save the backup: ${errorText(err)}`)
  }
}

/**
 * File › Convert a Checquery file… [FR-MIG-1]: asks for the .checquery file, its password and where to save the new
 * .plens file; converts it (the original is never modified) and opens the new file, showing its new recovery key.
 */
export async function convertChecqueryFile(): Promise<void> {
  if (!(await closePlens())) return
  const source = await pickChecquery()
  if (!source) return
  const client = getStoreClient()
  try {
    const bytes = await readBytes(source)
    const baseName = source.name.replace(/\.checquery$/i, '')
    let error: string | null = null
    let opened: Awaited<ReturnType<typeof client.request<'convertChecquery'>>> | null = null
    while (!opened) {
      const answer = await ask<Extract<Prompt, { kind: 'password' }>>({
        kind: 'password',
        name: source.name,
        title: `Convert ${source.name}`,
        allowRecovery: false,
        error,
      })
      if (answer === null || 'recoveryWords' in answer) return
      try {
        opened = await client.request('convertChecquery', {
          bytes: bytes.slice(),
          password: answer.password,
          deviceName: deviceName(),
        })
      } catch (err) {
        if (!(err instanceof StoreError && err.code === 'wrong-password')) throw err
        error = 'That password is not right. Try again.'
      }
    }
    const target = await pickPlensToSave(`${baseName}.plens`)
    if (!target) {
      await client.request('close', { keepWorkingCopy: false })
      return
    }
    const lock = await tryLockFile(opened.fileId)
    if (!lock) throw new Error('the new file is locked by another tab')
    const file = { name: target.name, handle: target, fileId: opened.fileId, encrypted: opened.encrypted }
    await attachWriter(file, lock, new FileChannel(opened.fileId))
    if (opened.recoveryWords) await showRecoveryKey(opened.recoveryWords)
    toast.success(`Converted ${source.name} to ${target.name}`)
  } catch (err) {
    toast.error(`Could not convert ${source.name}: ${errorText(err)}`)
  }
}
