// Thin wrapper over the File System Access API [FR-FILE-1, FR-FILE-7].

const types: FilePickerAcceptType[] = [
  { description: 'Household model (YAML)', accept: { 'application/yaml': ['.yaml', '.yml'] } },
]

export function isFileAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'
}

export type OpenedFile = { handle: FileSystemFileHandle; name: string; text: string }

function isAbort(e: unknown) {
  return e instanceof DOMException && e.name === 'AbortError'
}

/** Returns null when the user cancels the picker. */
export async function pickAndOpen(): Promise<OpenedFile | null> {
  try {
    const [handle] = await window.showOpenFilePicker!({ types, id: 'ssmodel' })
    if (!handle) return null
    return await readHandle(handle)
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

export async function readHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
  const file = await handle.getFile()
  return { handle, name: handle.name, text: await file.text() }
}

export async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

/** Returns null when the user cancels the picker. */
export async function pickSaveTarget(suggestedName: string): Promise<FileSystemFileHandle | null> {
  try {
    return await window.showSaveFilePicker!({ types, suggestedName, id: 'ssmodel' })
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

/** Re-acquire read/write permission for a handle restored from IndexedDB [FR-FILE-6]. */
export async function ensurePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const }
  if (!handle.queryPermission || !handle.requestPermission) return true
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}
