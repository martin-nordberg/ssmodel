// Autosave to the user's file [FR-STO-3, D: OQ-STO-1]: the whole database is written back after a short pause in
// editing (default 5 s, and at most every minute during continuous editing), and on demand (close, the app being
// hidden). A failed write leaves the changes pending and is retried. No DOM: the app wires visibility and close.

export type AutosaveState = 'saved' | 'pending' | 'saving' | 'error'

export interface AutosaveStatus {
  state: AutosaveState
  lastSavedAt: number | null
  error: string | null
}

export interface AutosaveOptions {
  /** Writes the current database to the user's file. */
  save: () => Promise<void>
  /** Pause after the last change before saving. */
  delayMs?: number
  /** Longest a change waits during continuous editing. */
  maxWaitMs?: number
  /** Wait before retrying a failed save. */
  retryMs?: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}

export class Autosaver {
  private readonly opts: Required<AutosaveOptions>
  private status: AutosaveStatus = { state: 'saved', lastSavedAt: null, error: null }
  private readonly listeners = new Set<(s: AutosaveStatus) => void>()
  private timer: unknown = null
  private firstPendingAt: number | null = null
  private dirty = false
  private inFlight: Promise<void> | null = null

  constructor(opts: AutosaveOptions) {
    this.opts = {
      delayMs: 5000,
      maxWaitMs: 60_000,
      retryMs: 30_000,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      ...opts,
    }
  }

  get current(): AutosaveStatus {
    return this.status
  }

  subscribe(listener: (s: AutosaveStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<AutosaveStatus>): void {
    this.status = { ...this.status, ...patch }
    for (const l of this.listeners) l(this.status)
  }

  private schedule(ms: number): void {
    if (this.timer !== null) this.opts.clearTimer(this.timer)
    this.timer = this.opts.setTimer(() => {
      this.timer = null
      void this.flush()
    }, ms)
  }

  /** Records a committed change and (re)starts the pause timer. */
  noteChange(): void {
    this.dirty = true
    const now = this.opts.now()
    this.firstPendingAt ??= now
    if (this.status.state !== 'saving') this.set({ state: 'pending' })
    if (this.inFlight) return // the save in flight reschedules when it finishes
    const waited = now - this.firstPendingAt
    this.schedule(Math.max(0, Math.min(this.opts.delayMs, this.opts.maxWaitMs - waited)))
  }

  /** Saves now if anything is pending. Resolves true when everything is saved. */
  async flush(): Promise<boolean> {
    if (this.timer !== null) {
      this.opts.clearTimer(this.timer)
      this.timer = null
    }
    while (this.inFlight) await this.inFlight
    if (!this.dirty) return this.status.state !== 'error'
    this.dirty = false
    this.firstPendingAt = null
    this.set({ state: 'saving' })
    let ok = false
    this.inFlight = this.opts.save().then(
      () => {
        ok = true
      },
      (err: unknown) => {
        this.dirty = true
        this.set({ state: 'error', error: err instanceof Error ? err.message : String(err) })
      },
    )
    await this.inFlight
    this.inFlight = null
    if (ok) {
      if (this.dirty) {
        // Changes arrived during the save.
        this.set({ state: 'pending', lastSavedAt: this.opts.now(), error: null })
        this.schedule(this.opts.delayMs)
      } else {
        this.set({ state: 'saved', lastSavedAt: this.opts.now(), error: null })
      }
      return !this.dirty
    }
    this.schedule(this.opts.retryMs)
    return false
  }

  /** Stops the timer (call after a final flush). */
  dispose(): void {
    if (this.timer !== null) this.opts.clearTimer(this.timer)
    this.timer = null
    this.listeners.clear()
  }
}
