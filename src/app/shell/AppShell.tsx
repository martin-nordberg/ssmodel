import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { CircleHelp } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { PlensDialogs } from '@/app/files/PlensDialogs.tsx'
import { flushPlens, hasUnsavedPlens, openPlensHandle, usePlensFile } from '@/app/files/plensFile.ts'
import { useFileCommands } from '@/app/files/useFileCommands.ts'
import { useLaunchQueue } from '@/app/pwa/useLaunchQueue.ts'
import { usePwa } from '@/app/pwa/usePwa.ts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useDocument } from '@/state/documentStore.ts'
import { useSettings } from '@/state/settingsStore.ts'
import { useUi } from '@/state/uiStore.ts'
import { CommandPalette } from './CommandPalette.tsx'
import { FileMenu } from './FileMenu.tsx'
import { NewHouseholdDialog } from './NewHouseholdDialog.tsx'
import { SectionTabs } from './SectionTabs.tsx'
import { SettingsMenu } from './SettingsMenu.tsx'
import { StatusBar } from './StatusBar.tsx'
import { useDisplaySettings } from './useDisplaySettings.ts'
import { useShortcuts } from './useShortcuts.ts'

// The app shell [FR-UI-20]: a toolbar (file commands, section tabs, the command palette, settings and help), the
// page, and the status bar.

export function AppShell() {
  useShortcuts()
  usePwa()
  const { openHandle } = useFileCommands()
  useLaunchQueue(openHandle, openPlensHandle)
  useDisplaySettings()
  useSettings((s) => s.numberFormat)
  useYamlNavigation()
  const name = useDocument((s) => s.name)
  const dirty = useDocument((s) => s.dirty)
  const hasFile = useDocument((s) => s.file !== null)
  const plens = usePlensFile((s) => s.file)
  const navigate = useNavigate()

  useEffect(() => {
    const parts = [plens?.name, hasFile ? `${dirty ? '• ' : ''}${name}` : null].filter(Boolean)
    document.title = parts.length > 0 ? `${parts.join(' · ')} — ProvisionLens` : 'ProvisionLens'
  }, [name, dirty, hasFile, plens])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useDocument.getState().dirty) e.preventDefault()
      if (hasUnsavedPlens()) {
        void flushPlens()
        e.preventDefault()
      }
    }
    // Save the .plens file when the app is hidden (switching apps, closing the laptop) [FR-STO-3].
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flushPlens()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground text-sm">
      <header className="no-print flex h-10 items-center gap-2 border-b px-2">
        <FileMenu />
        <SectionTabs />
        <span className="ml-auto font-semibold text-sm">ProvisionLens</span>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => useUi.getState().setPaletteOpen(true)}
        >
          Commands <kbd className="font-mono text-[10px]">Ctrl+K</kbd>
        </Button>
        <SettingsMenu />
        <Button variant="ghost" size="icon" aria-label="Help" onClick={() => void navigate({ to: '/help' })}>
          <CircleHelp className="size-4" />
        </Button>
      </header>
      <LoadErrors />
      <div className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </div>
      <StatusBar />
      <NewHouseholdDialog />
      <PlensDialogs />
      <CommandPalette />
    </div>
  )
}

/** Opening or creating a household YAML file goes to Retiring Years › Setup, where it is edited. */
function useYamlNavigation() {
  const hasFile = useDocument((s) => s.file !== null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const had = useRef(hasFile)
  useEffect(() => {
    if (hasFile && !had.current && !pathname.startsWith('/retiring')) void navigate({ to: '/retiring/setup' })
    had.current = hasFile
  }, [hasFile, pathname, navigate])
}

function LoadErrors() {
  const errors = useDocument((s) => s.loadErrors)
  const clear = useDocument((s) => s.clearLoadErrors)
  if (!errors) return null
  return (
    <Alert variant="destructive" className="m-2 w-auto">
      <AlertTitle>The file could not be opened</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {errors.slice(0, 20).map((e) => (
            <li key={`${e.path}-${e.line}-${e.message}`}>
              {e.line !== undefined && `line ${e.line}: `}
              {e.path && <code>{e.path}</code>} {e.message}
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" className="mt-2" onClick={clear}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  )
}
