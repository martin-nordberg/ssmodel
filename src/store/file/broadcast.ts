// Live second window [FR-STO-4, D: OQ-UI-8]: the tab editing a file announces each change on a BroadcastChannel
// named by the file's id, and sends its current database to a read-only tab that asks for it, so the read-only tab
// follows edits within a second without touching the working copy. Main thread; no React.

type Message =
  | { type: 'changed' }
  | { type: 'closed' }
  | { type: 'snapshot-request'; from: string }
  | { type: 'snapshot'; to: string; bytes: Uint8Array }

export class FileChannel {
  private readonly channel: BroadcastChannel
  private readonly id = crypto.randomUUID()
  private readonly handlers = new Set<(m: Message) => void>()

  constructor(fileId: string) {
    this.channel = new BroadcastChannel(`provisionlens:file:${fileId}`)
    this.channel.onmessage = (event: MessageEvent<Message>) => {
      for (const h of this.handlers) h(event.data)
    }
  }

  private on(handler: (m: Message) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  // The writer's side.

  /** Answers read-only tabs' snapshot requests with the current database. */
  serveSnapshots(snapshot: () => Promise<Uint8Array>): () => void {
    return this.on((m) => {
      if (m.type !== 'snapshot-request') return
      void snapshot().then(
        (bytes) => this.channel.postMessage({ type: 'snapshot', to: m.from, bytes } satisfies Message),
        () => undefined,
      )
    })
  }

  announceChange(): void {
    this.channel.postMessage({ type: 'changed' } satisfies Message)
  }

  announceClosed(): void {
    this.channel.postMessage({ type: 'closed' } satisfies Message)
  }

  // A read-only tab's side.

  /** Asks the writer for its current database; null if no answer within `timeoutMs`. */
  requestSnapshot(timeoutMs = 1500): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      const stop = this.on((m) => {
        if (m.type === 'snapshot' && m.to === this.id) {
          stop()
          clearTimeout(timer)
          resolve(m.bytes)
        }
      })
      const timer = setTimeout(() => {
        stop()
        resolve(null)
      }, timeoutMs)
      this.channel.postMessage({ type: 'snapshot-request', from: this.id } satisfies Message)
    })
  }

  onChanged(callback: () => void): () => void {
    return this.on((m) => m.type === 'changed' && callback())
  }

  onClosed(callback: () => void): () => void {
    return this.on((m) => m.type === 'closed' && callback())
  }

  close(): void {
    this.handlers.clear()
    this.channel.close()
  }
}
