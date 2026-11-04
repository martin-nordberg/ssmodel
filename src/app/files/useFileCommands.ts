import { useCallback } from 'react'
import { toast } from 'sonner'
import { useDocument } from '@/state/documentStore.ts'
import { useUi } from '@/state/uiStore.ts'
import { ensurePermission, pickAndOpen, pickSaveTarget, readHandle, writeHandle } from './fileAccess.ts'
import { forgetRecent, type RecentFile, rememberRecent } from './recentFiles.ts'

function confirmDiscard(): boolean {
  if (!useDocument.getState().dirty) return true
  return window.confirm('Discard unsaved changes?')
}

/** File menu commands [FR-FILE-1, FR-FILE-5, FR-FILE-6]. */
export function useFileCommands() {
  const newHousehold = useCallback(() => {
    if (!confirmDiscard()) return
    useUi.getState().setNewDialogOpen(true)
  }, [])

  const loadOpened = useCallback(async (opened: { handle: FileSystemFileHandle; name: string; text: string }) => {
    if (useDocument.getState().loadText(opened.text, opened.handle, opened.name)) {
      await rememberRecent(opened.handle)
      toast.success(`Opened ${opened.name}`)
    }
  }, [])

  const open = useCallback(async () => {
    if (!confirmDiscard()) return
    try {
      const opened = await pickAndOpen()
      if (opened) await loadOpened(opened)
    } catch (e) {
      toast.error(`Could not open file: ${String(e)}`)
    }
  }, [loadOpened])

  const openRecent = useCallback(
    async (recent: RecentFile) => {
      if (!confirmDiscard()) return
      try {
        if (!(await ensurePermission(recent.handle))) return
        await loadOpened(await readHandle(recent.handle))
      } catch (e) {
        await forgetRecent(recent.handle)
        toast.error(`Could not open ${recent.name}: ${String(e)}`)
      }
    },
    [loadOpened],
  )

  const saveAs = useCallback(async () => {
    const doc = useDocument.getState()
    if (!doc.file) return
    try {
      const handle = await pickSaveTarget(doc.name)
      if (!handle) return
      await writeHandle(handle, doc.serialize())
      doc.markSaved(handle, handle.name)
      await rememberRecent(handle)
      toast.success(`Saved ${handle.name}`)
    } catch (e) {
      toast.error(`Could not save: ${String(e)}`)
    }
  }, [])

  const save = useCallback(async () => {
    const doc = useDocument.getState()
    if (!doc.file) return
    if (!doc.handle) return saveAs()
    try {
      if (!(await ensurePermission(doc.handle))) return
      await writeHandle(doc.handle, doc.serialize())
      doc.markSaved(doc.handle, doc.name)
      toast.success(`Saved ${doc.name}`)
    } catch (e) {
      toast.error(`Could not save: ${String(e)}`)
    }
  }, [saveAs])

  const close = useCallback(() => {
    if (!confirmDiscard()) return
    useDocument.getState().close()
  }, [])

  return { newHousehold, open, openRecent, save, saveAs, close }
}
