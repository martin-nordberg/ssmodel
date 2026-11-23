// Backups [FR-STO-6, D: OQ-STO-4]:
// - rolling copies in OPFS: one per close, keeping the last 10;
// - an optional backup folder chosen once: a dated copy on close, at most once a day, keeping 30 days of copies
//   plus the newest copy of each earlier month.
// Main thread; no React. The pruning rule is a pure function, tested on its own.

const rollingRoot = 'provisionlens-backups'
export const rollingKept = 10

export interface RollingBackup {
  /** The OPFS file name: an ISO timestamp, sortable. */
  name: string
  at: Date
  size: number
}

async function rollingDir(fileId: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory()
    const all = await root.getDirectoryHandle(rollingRoot, { create })
    return await all.getDirectoryHandle(fileId, { create })
  } catch {
    return null
  }
}

function timestampName(at: Date): string {
  return `${at.toISOString().replace(/[:.]/g, '-')}.plens`
}

function parseTimestampName(name: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.plens$/.exec(name)
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null
}

/** Lists a file's rolling backups, newest first. */
export async function listRollingBackups(fileId: string): Promise<RollingBackup[]> {
  const dir = await rollingDir(fileId, false)
  if (!dir) return []
  const out: RollingBackup[] = []
  for await (const [name, handle] of dir.entries()) {
    const at = parseTimestampName(name)
    if (at && handle.kind === 'file')
      out.push({ name, at, size: (await (handle as FileSystemFileHandle).getFile()).size })
  }
  return out.sort((a, b) => b.name.localeCompare(a.name))
}

/** Adds a rolling backup and deletes all but the newest `rollingKept`. */
export async function saveRollingBackup(fileId: string, bytes: Uint8Array, at = new Date()): Promise<void> {
  const dir = await rollingDir(fileId, true)
  if (!dir) return
  const handle = await dir.getFileHandle(timestampName(at), { create: true })
  const writable = await handle.createWritable()
  await writable.write(bytes as Uint8Array<ArrayBuffer>)
  await writable.close()
  for (const old of (await listRollingBackups(fileId)).slice(rollingKept)) await dir.removeEntry(old.name)
}

export async function readRollingBackup(fileId: string, name: string): Promise<Uint8Array> {
  const dir = await rollingDir(fileId, false)
  if (!dir) throw new Error('No backups for this file.')
  return new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer())
}

/** A local calendar date, YYYY-MM-DD. */
function localDate(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`
}

/** The backup folder file name for a file on a day: "Household 2026-11-23.plens". */
export function folderBackupName(fileName: string, at: Date): string {
  return `${fileName.replace(/\.plens$/i, '')} ${localDate(at)}.plens`
}

/**
 * Which of a file's folder backups to delete: keep every copy from the last 30 days (counting today), and the newest
 * copy of each earlier month. Names that aren't this file's dated backups are never touched.
 */
export function folderBackupsToPrune(names: string[], fileName: string, today: Date): string[] {
  const base = fileName.replace(/\.plens$/i, '')
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escaped} (\\d{4}-\\d{2}-\\d{2})\\.plens$`)
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)
  const cutoffDate = localDate(cutoff)
  const dated = names
    .map((name) => ({ name, date: pattern.exec(name)?.[1] }))
    .filter((d): d is { name: string; date: string } => d.date !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date))
  const keptMonths = new Set<string>()
  const prune: string[] = []
  for (const d of dated) {
    if (d.date >= cutoffDate) continue
    const month = d.date.slice(0, 7)
    if (keptMonths.has(month)) prune.push(d.name)
    else keptMonths.add(month)
  }
  return prune
}

/**
 * Writes today's copy to the backup folder unless one exists, then prunes old copies. Returns true if it wrote one.
 */
export async function writeFolderBackup(
  folder: FileSystemDirectoryHandle,
  fileName: string,
  bytes: Uint8Array,
  now = new Date(),
): Promise<boolean> {
  const name = folderBackupName(fileName, now)
  const names: string[] = []
  for await (const key of folder.keys()) names.push(key)
  let wrote = false
  if (!names.includes(name)) {
    const handle = await folder.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(bytes as Uint8Array<ArrayBuffer>)
    await writable.close()
    names.push(name)
    wrote = true
  }
  for (const old of folderBackupsToPrune(names, fileName, now)) await folder.removeEntry(old)
  return wrote
}
