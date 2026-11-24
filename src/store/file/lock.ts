// One writer per file [FR-STO-4, D: OQ-UI-8]: a Web Lock named by the file's id, held while the file is open for
// editing. A tab that can't take it opens the file read-only. Main thread; no React.

export interface FileLock {
  release(): void
}

/** Takes the file's write lock, or returns null at once if another tab or window holds it. */
export function tryLockFile(fileId: string): Promise<FileLock | null> {
  return new Promise((resolve, reject) => {
    navigator.locks
      .request(`provisionlens:file:${fileId}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null)
          return undefined
        }
        // Held until release() resolves this promise.
        return new Promise<void>((release) => resolve({ release: () => release() }))
      })
      .catch(reject)
  })
}

/**
 * Waits up to `timeoutMs` for the file's write lock (a tab that just closed or crashed releases it shortly); null if
 * it's still held then.
 */
export function lockFileWithin(fileId: string, timeoutMs: number): Promise<FileLock | null> {
  return new Promise((resolve) => {
    navigator.locks
      .request(
        `provisionlens:file:${fileId}`,
        { signal: AbortSignal.timeout(timeoutMs) },
        () => new Promise<void>((release) => resolve({ release: () => release() })),
      )
      .catch(() => resolve(null))
  })
}

/** This browser profile's device id, distinguishing devices with the same name in a file's open-by marker. */
export function deviceId(): string {
  const key = 'provisionlens.deviceId'
  try {
    let id = localStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(key, id)
    }
    return id
  } catch {
    return 'unknown-device'
  }
}
