// Recent files: FileSystemFileHandles persisted in IndexedDB [FR-FILE-6, FR-STO-1]. Household YAML files and
// ProvisionLens files keep separate lists (`kind`).

const DB = 'ssmodel'
const STORE = 'recentFiles'
const MAX = 8

export type RecentFile = { name: string; handle: FileSystemFileHandle; openedAt: number }
export type RecentKind = 'yaml' | 'plens'
const keyOf = (kind: RecentKind) => (kind === 'yaml' ? 'list' : 'plens')

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Reads a value kept alongside the recent files (e.g. the backup folder handle). */
export async function getStored<T>(key: string): Promise<T | undefined> {
  try {
    return (await withStore('readonly', (s) => s.get(key))) as T | undefined
  } catch {
    return undefined
  }
}

export async function putStored(key: string, value: unknown): Promise<void> {
  try {
    await withStore(
      'readwrite',
      (s) => (value === undefined ? s.delete(key) : s.put(value, key)) as IDBRequest<unknown>,
    )
  } catch {
    // Storage may be unavailable (private window).
  }
}

export async function listRecent(kind: RecentKind = 'yaml'): Promise<RecentFile[]> {
  try {
    return ((await withStore('readonly', (s) => s.get(keyOf(kind)))) as RecentFile[] | undefined) ?? []
  } catch {
    return []
  }
}

export async function rememberRecent(handle: FileSystemFileHandle, kind: RecentKind = 'yaml'): Promise<RecentFile[]> {
  const current = await listRecent(kind)
  const kept: RecentFile[] = []
  for (const r of current) {
    if (!(await r.handle.isSameEntry(handle))) kept.push(r)
  }
  const next = [{ name: handle.name, handle, openedAt: Date.now() }, ...kept].slice(0, MAX)
  try {
    await withStore('readwrite', (s) => s.put(next, keyOf(kind)))
  } catch {
    // Storage may be unavailable (private window); recent files are a convenience only.
  }
  return next
}

export async function forgetRecent(handle: FileSystemFileHandle, kind: RecentKind = 'yaml'): Promise<void> {
  const current = await listRecent(kind)
  const kept: RecentFile[] = []
  for (const r of current) if (!(await r.handle.isSameEntry(handle))) kept.push(r)
  try {
    await withStore('readwrite', (s) => s.put(kept, keyOf(kind)))
  } catch {}
}
