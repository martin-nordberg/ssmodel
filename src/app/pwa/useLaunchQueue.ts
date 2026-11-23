// Opens a file the OS launched the installed app with [FR-FILE-9, FR-STO-1]: household YAML or a .plens file.
import { useEffect } from 'react'

export function useLaunchQueue(
  openHandle: (handle: FileSystemFileHandle) => Promise<void>,
  openPlensHandle: (handle: FileSystemFileHandle) => Promise<void>,
) {
  useEffect(() => {
    if (!window.launchQueue) return
    window.launchQueue.setConsumer((params) => {
      const handle = params.files.find((f): f is FileSystemFileHandle => f.kind === 'file')
      if (!handle) return
      void (handle.name.toLowerCase().endsWith('.plens') ? openPlensHandle(handle) : openHandle(handle))
    })
  }, [openHandle, openPlensHandle])
}
