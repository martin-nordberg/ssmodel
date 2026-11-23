// The user's .plens file through the File System Access API [FR-STO-1]: pickers and whole-file reads and writes.
// Main thread only (pickers need a user gesture); no React.

const types: FilePickerAcceptType[] = [
  { description: 'ProvisionLens file', accept: { 'application/x-provisionlens': ['.plens'] } },
]

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/** Asks for a .plens file to open; null when the user cancels. */
export async function pickPlensToOpen(): Promise<FileSystemFileHandle | null> {
  try {
    const [handle] = await window.showOpenFilePicker!({ types, id: 'plens' })
    return handle ?? null
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

/** Asks where to save a .plens file; null when the user cancels. */
export async function pickPlensToSave(suggestedName: string): Promise<FileSystemFileHandle | null> {
  try {
    return await window.showSaveFilePicker!({ types, suggestedName, id: 'plens' })
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

export async function readBytes(handle: FileSystemFileHandle): Promise<Uint8Array> {
  return new Uint8Array(await (await handle.getFile()).arrayBuffer())
}

/** Replaces the file's contents. The browser writes to a temporary file and swaps it in on close. */
export async function writeBytes(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable()
  try {
    await writable.write(bytes as Uint8Array<ArrayBuffer>)
    await writable.close()
  } catch (err) {
    await writable.abort().catch(() => undefined)
    throw err
  }
}

/** True when this browser has what .plens files need: file pickers and the origin-private file system [FR-STO-10]. */
export function isPlensSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.showOpenFilePicker === 'function' &&
    typeof navigator.storage?.getDirectory === 'function'
  )
}
