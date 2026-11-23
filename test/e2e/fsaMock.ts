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
    // Folders (the backup folder): name → file name → content.
    const folders: Record<string, Record<string, Content>> = {}
    const folderHandle = (folderName: string) => {
      folders[folderName] ??= {}
      const files = folders[folderName]
      const fileIn = (name: string): FakeHandle => {
        const h = handle(`${folderName}/${name}`)
        return {
          ...h,
          name,
          getFile: async () => new File([files[name] as BlobPart], name),
          createWritable: async () => {
            const parts: BlobPart[] = []
            return {
              write: async (data: string | BufferSource | Blob) => {
                parts.push(data as BlobPart)
              },
              close: async () => {
                files[name] = new Uint8Array(await new Blob(parts).arrayBuffer())
              },
              abort: async () => {},
            }
          },
        }
      }
      return {
        kind: 'directory' as const,
        name: folderName,
        async getFileHandle(name: string, opts?: { create?: boolean }) {
          if (!(name in files)) {
            if (!opts?.create) throw new DOMException(`${name} not found`, 'NotFoundError')
            files[name] = new Uint8Array()
          }
          return fileIn(name)
        },
        async removeEntry(name: string) {
          delete files[name]
        },
        async *keys() {
          yield* Object.keys(files)
        },
        async *entries() {
          for (const name of Object.keys(files)) yield [name, fileIn(name)] as const
        },
        isSameEntry: async (o: unknown) => (o as { name?: string })?.name === folderName,
        queryPermission: async () => 'granted' as PermissionState,
        requestPermission: async () => 'granted' as PermissionState,
      }
    }
    const state = {
      disk,
      folders,
      nextOpen: Object.keys(initial)[0] ?? '',
      nextSave: 'saved.yaml',
      nextFolder: 'Backups',
    }
    Object.assign(window, {
      __fsa: state,
      showOpenFilePicker: async () => [handle(state.nextOpen)],
      showSaveFilePicker: async () => handle(state.nextSave),
      showDirectoryPicker: async () => folderHandle(state.nextFolder),
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

/** The names of the files in a picked folder. */
export async function readFolder(page: Page, folder: string): Promise<string[]> {
  return page.evaluate(
    (f) => Object.keys((window as unknown as { __fsa: { folders: Record<string, object> } }).__fsa.folders[f] ?? {}),
    folder,
  )
}
