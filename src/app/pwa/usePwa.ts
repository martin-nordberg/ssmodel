// Service worker registration and the update prompt [NFR-ARCH-7].

import { registerSW } from 'virtual:pwa-register'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useDocument } from '@/state/documentStore.ts'

let registered = false

/**
 * Registers the service worker once. A new build waits until the user chooses Reload, so the app never swaps code
 * (and rule tables) under an open household. With unsaved changes the reload is refused until the user saves.
 */
export function usePwa() {
  useEffect(() => {
    if (registered || !('serviceWorker' in navigator)) return
    registered = true
    const updateSW = registerSW({
      onNeedRefresh() {
        toast.info('A new version of the app is available.', {
          id: 'pwa-update',
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: 'Reload',
            onClick: (e) => {
              if (useDocument.getState().dirty) {
                e.preventDefault()
                toast.warning('Save your changes first, then reload.')
                return
              }
              void updateSW(true)
            },
          },
        })
      },
      onRegisterError(error) {
        console.warn('Service worker registration failed', error)
      },
    })
  }, [])
}
