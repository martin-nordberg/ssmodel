import type { Page } from '@playwright/test'

/** Replaces the File System Access API with an in-page fake. Files "on disk" live in window.__fsa. */
export async function installFsaMock(page: Page, files: Record<string, string> = {}) {
  await page.addInitScript((initial) => {
    type FakeHandle = {
      kind: 'file'
      name: string
      getFile(): Promise<File>
      createWritable(): Promise<{ write(t: string): Promise<void>; close(): Promise<void> }>
      isSameEntry(o: unknown): Promise<boolean>
      queryPermission(): Promise<PermissionState>
      requestPermission(): Promise<PermissionState>
    }
    const disk: Record<string, string> = { ...initial }
    const handle = (name: string): FakeHandle => {
      const h: FakeHandle = {
        kind: 'file',
        name,
        getFile: async () => new File([disk[name] ?? ''], name),
        createWritable: async () => {
          let buf = ''
          return {
            write: async (t: string) => {
              buf += t
            },
            close: async () => {
              disk[name] = buf
            },
          }
        },
        isSameEntry: async (o) => (o as FakeHandle)?.name === name,
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
      }
      return h
    }
    const state = { disk, nextOpen: Object.keys(initial)[0] ?? '', nextSave: 'saved.yaml' }
    Object.assign(window, {
      __fsa: state,
      showOpenFilePicker: async () => [handle(state.nextOpen)],
      showSaveFilePicker: async () => handle(state.nextSave),
    })
  }, files)
}

export async function readDisk(page: Page, name: string): Promise<string | undefined> {
  return page.evaluate((n) => (window as unknown as { __fsa: { disk: Record<string, string> } }).__fsa.disk[n], name)
}
