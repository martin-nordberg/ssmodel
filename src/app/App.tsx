import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isFileAccessSupported } from './files/fileAccess.ts'
import { AppShell } from './shell/AppShell.tsx'
import { UnsupportedBrowser } from './shell/UnsupportedBrowser.tsx'

export function App() {
  if (!isFileAccessSupported()) return <UnsupportedBrowser />
  return (
    <TooltipProvider delayDuration={5000}>
      <AppShell />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
