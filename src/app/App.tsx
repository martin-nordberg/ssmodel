import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getStoreClient } from '@/state/storeClient.ts'
import { isPlensSupported } from '@/store/file/handles.ts'
import { router } from './routes.tsx'
import { UnsupportedBrowser } from './shell/UnsupportedBrowser.tsx'

// e2e tests may drive the store worker directly: `?e2e` exposes its client.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e')) {
  Object.assign(window, { provisionlensStore: getStoreClient() })
}

export function App() {
  // File pickers and the origin-private file system are both required [FR-FILE-7, FR-STO-10].
  if (!isPlensSupported()) return <UnsupportedBrowser />
  return (
    <TooltipProvider delayDuration={5000}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
