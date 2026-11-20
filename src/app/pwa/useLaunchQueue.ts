// Opens a household file the OS launched the installed app with [FR-FILE-9].
import { useEffect } from 'react'

export function useLaunchQueue(openHandle: (handle: FileSystemFileHandle) => Promise<void>) {
  useEffect(() => {
    if (!window.launchQueue) return
    window.launchQueue.setConsumer((params) => {
      const handle = params.files.find((f): f is FileSystemFileHandle => f.kind === 'file')
      if (handle) void openHandle(handle)
    })
  }, [openHandle])
}
