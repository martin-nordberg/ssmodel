import type { Page } from '@playwright/test'

/**
 * Replaces the File System Access API with an in-page fake. Files "on disk" live in window.__fsa: text files as
 * strings, binary files (.plens) as byte arrays (pass them in as number[]).
 */
export async function installFsaMock(page: Page, files: Record<string, string | number[]> = {}) {
  await page.addInitScript((initial) => {
    type Content = string | Uint8Array
    type FakeWritable = {
      write(data: string | BufferSource | Blob): Promise<void>
      close(): Promise<void>
      abort(): Promise<void>
    }
    type FakeHandle = {
      kind: 'file'
      name: string
      getFile(): Promise<File>
      createWritable(): Promise<FakeWritable>
      isSameEntry(o: unknown): Promise<boolean>
      queryPermission(): Promise<PermissionState>
      requestPermission(): Promise<PermissionState>
    }
    const disk: Record<string, Content> = {}
    for (const [name, content] of Object.entries(initial)) {
      disk[name] = typeof content === 'string' ? content : new Uint8Array(content)
    }
    const handle = (name: string): FakeHandle => {
      const h: FakeHandle = {
        kind: 'file',
        name,
        getFile: async () => {
          const c = disk[name]
          if (c === undefined) throw new DOMException(`${name} not found`, 'NotFoundError')
          return new File([c as BlobPart], name)
        },
        // Like the real API, writes go to a temporary buffer that replaces the file only on close().
        createWritable: async () => {
          const parts: BlobPart[] = []
          let binary = false
          return {
            write: async (data) => {
              if (typeof data !== 'string') binary = true
              parts.push(data as BlobPart)
            },
            close: async () => {
              const blob = new Blob(parts)
              disk[name] = binary ? new Uint8Array(await blob.arrayBuffer()) : await blob.text()
            },
            abort: async () => {},
          }
        },
        isSameEntry: async (o) => (o as FakeHandle)?.name === name,
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
      }
      return h
    }
    const state = { disk, nextOpen: Object.keys(initial)[0] ?? '', nextSave: 'saved.yaml', writes: 0 }
    Object.assign(window, {
      __fsa: state,
      showOpenFilePicker: async () => [handle(state.nextOpen)],
      showSaveFilePicker: async () => handle(state.nextSave),
    })
  }, files)
}

export async function readDisk(page: Page, name: string): Promise<string | undefined> {
  return page.evaluate((n) => {
    const c = (window as unknown as { __fsa: { disk: Record<string, unknown> } }).__fsa.disk[n]
    return typeof c === 'string' ? c : undefined
  }, name)
}

/** A binary file's bytes as number[] (to pass to installFsaMock in another page), or undefined. */
export async function readDiskBytes(page: Page, name: string): Promise<number[] | undefined> {
  return page.evaluate((n) => {
    const c = (window as unknown as { __fsa: { disk: Record<string, unknown> } }).__fsa.disk[n]
    return c instanceof Uint8Array ? [...c] : undefined
  }, name)
}

/** Sets the names the next open and save pickers return. */
export async function setPickers(page: Page, pick: { open?: string; save?: string }): Promise<void> {
  await page.evaluate((p) => {
    const fsa = (window as unknown as { __fsa: { nextOpen: string; nextSave: string } }).__fsa
    if (p.open !== undefined) fsa.nextOpen = p.open
    if (p.save !== undefined) fsa.nextSave = p.save
  }, pick)
}
