import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getStoreClient } from '@/state/storeClient.ts'
import { isPlensSupported } from '@/store/file/handles.ts'
import { AppShell } from './shell/AppShell.tsx'
import { UnsupportedBrowser } from './shell/UnsupportedBrowser.tsx'

// e2e tests drive the store worker directly until the ledger pages exist (P2): `?e2e` exposes the client.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e')) {
  Object.assign(window, { provisionlensStore: getStoreClient() })
}

export function App() {
  // File pickers and the origin-private file system are both required [FR-FILE-7, FR-STO-10].
  if (!isPlensSupported()) return <UnsupportedBrowser />
  return (
    <TooltipProvider delayDuration={5000}>
      <AppShell />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
