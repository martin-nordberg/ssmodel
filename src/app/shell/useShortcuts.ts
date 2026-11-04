import { useEffect } from 'react'
import { useFileCommands } from '@/app/files/useFileCommands.ts'
import { useDocument } from '@/state/documentStore.ts'

function inTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Global keyboard shortcuts [FR-FILE-1, FR-UI-13]. Browsers reserve Ctrl+N, so New is Ctrl+Alt+N. */
export function useShortcuts() {
  const cmd = useFileCommands()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        void (e.shiftKey ? cmd.saveAs() : cmd.save())
      } else if (key === 'o') {
        e.preventDefault()
        void cmd.open()
      } else if (key === 'n' && e.altKey) {
        e.preventDefault()
        cmd.newHousehold()
      } else if ((key === 'z' || key === 'y') && !inTextField(e.target)) {
        e.preventDefault()
        const doc = useDocument.getState()
        if (key === 'y' || e.shiftKey) doc.redo()
        else doc.undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cmd])
}
