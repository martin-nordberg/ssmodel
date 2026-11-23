import { toast } from 'sonner'
import { create } from 'zustand'
import { useSettings } from '@/state/settingsStore.ts'
import { getStoreClient, StoreError } from '@/state/storeClient.ts'
import { Autosaver, type AutosaveStatus } from '@/store/file/autosave.ts'
import { pickPlensToOpen, pickPlensToSave, readBytes, writeBytes } from '@/store/file/handles.ts'
import { ensurePermission } from './fileAccess.ts'
import { forgetRecent, type RecentFile, rememberRecent } from './recentFiles.ts'

// The open .plens file [FR-STO-1 … FR-STO-3, FR-STO-7]: New, Open…, Close, Save a copy… and recent files, with the
// working copy in the store worker and autosave back to the user's file. Questions for the user (password, recovery,
// migration) are posted as a `prompt` that PlensDialogs renders and answers.

export type Prompt = { id: number } & (
  | { kind: 'new-password'; resolve: (answer: { password: string | undefined } | null) => void }
  | { kind: 'password'; name: string; error: string | null; resolve: (password: string | null) => void }
  | { kind: 'recover'; name: string; resolve: (source: 'working-copy' | 'file' | null) => void }
  | { kind: 'migrate'; name: string; resolve: (ok: boolean) => void }
)

export interface OpenPlens {
  name: string
  handle: FileSystemFileHandle
  fileId: string
  encrypted: boolean
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

let autosaver: Autosaver | null = null
let unsubscribeChanges: (() => void) | null = null

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

/** Starts autosave for the newly open file; `saveNow` writes it back at once (recovered or migrated). */
async function attach(file: OpenPlens, saveNow: boolean): Promise<void> {
  const client = getStoreClient()
  autosaver = new Autosaver({
    delayMs: autosaveDelay(),
    save: async () => writeBytes(file.handle, await client.request('export', {})),
  })
  autosaver.subscribe((autosave) => usePlensFile.setState({ autosave }))
  unsubscribeChanges = client.subscribe((n) => {
    if (n.kind === 'change') autosaver?.noteChange()
  })
  usePlensFile.setState({ file, autosave: autosaver.current })
  await rememberRecent(file.handle, 'plens')
  if (saveNow) {
    autosaver.noteChange()
    await autosaver.flush()
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Closes the open file after saving it. Returns false if the user chose to keep it open. */
export async function closePlens(): Promise<boolean> {
  const { file } = usePlensFile.getState()
  if (!file) return true
  const saved = autosaver ? await autosaver.flush() : true
  if (!saved) {
    const close = window.confirm(
      `${file.name} could not be saved (${usePlensFile.getState().autosave.error}). Close anyway? ` +
        'The unsaved changes stay in this browser and are offered the next time you open the file.',
    )
    if (!close) return false
  }
  autosaver?.dispose()
  autosaver = null
  unsubscribeChanges?.()
  unsubscribeChanges = null
  await getStoreClient().request('close', { keepWorkingCopy: !saved })
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
    await writeBytes(handle, await client.request('export', {}))
    await attach({ name: handle.name, handle, fileId: opened.fileId, encrypted: opened.encrypted }, false)
    toast.success(`Created ${handle.name}`)
  } catch (err) {
    toast.error(`Could not create the file: ${errorText(err)}`)
  }
}

/** Opens a file handle: recovery, migration and password questions as needed [FR-STO-3, FR-STO-7]. */
export async function openPlensHandle(handle: FileSystemFileHandle): Promise<void> {
  if (!(await closePlens())) return
  const client = getStoreClient()
  try {
    const bytes = await readBytes(handle)
    const info = await client.request('inspect', { bytes: bytes.slice() })
    let source: 'file' | 'working-copy' = 'file'
    if (info.newerWorkingCopy) {
      const choice = await ask<Extract<Prompt, { kind: 'recover' }>>({ kind: 'recover', name: handle.name })
      if (!choice) return
      source = choice
    }
    if (info.needsMigration) {
      const ok = await ask<Extract<Prompt, { kind: 'migrate' }>>({ kind: 'migrate', name: handle.name })
      if (!ok) return
    }
    let error: string | null = null
    for (;;) {
      let password: string | undefined
      if (info.encrypted) {
        const answer = await ask<Extract<Prompt, { kind: 'password' }>>({ kind: 'password', name: handle.name, error })
        if (answer === null) return
        password = answer
      }
      try {
        const opened = await client.request('open', {
          bytes: bytes.slice(),
          password,
          deviceName: deviceName(),
          allowMigration: info.needsMigration,
          source,
        })
        const file = { name: handle.name, handle, fileId: opened.fileId, encrypted: opened.encrypted }
        await attach(file, source === 'working-copy' || info.needsMigration)
        toast.success(
          source === 'working-copy' ? `Recovered unsaved changes in ${handle.name}` : `Opened ${handle.name}`,
        )
        return
      } catch (err) {
        if (err instanceof StoreError && err.code === 'wrong-password' && info.encrypted) {
          error = 'That password is not right. Try again.'
          continue
        }
        throw err
      }
    }
  } catch (err) {
    toast.error(`Could not open ${handle.name}: ${errorText(err)}`)
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
  return autosaver ? autosaver.flush() : Promise.resolve(true)
}

/** True while changes aren't yet in the user's file. */
export function hasUnsavedPlens(): boolean {
  const { file, autosave } = usePlensFile.getState()
  return file !== null && autosave.state !== 'saved'
}
