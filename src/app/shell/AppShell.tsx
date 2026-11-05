import { useEffect } from 'react'
import { useFileCommands } from '@/app/files/useFileCommands.ts'
import { ViewHost } from '@/app/views/ViewHost.tsx'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDocument } from '@/state/documentStore.ts'
import { useSettings } from '@/state/settingsStore.ts'
import { useUi, type View } from '@/state/uiStore.ts'
import { CommandPalette } from './CommandPalette.tsx'
import { FileMenu } from './FileMenu.tsx'
import { NewHouseholdDialog } from './NewHouseholdDialog.tsx'
import { ScenarioTabs } from './ScenarioTabs.tsx'
import { SettingsMenu } from './SettingsMenu.tsx'
import { StatusBar } from './StatusBar.tsx'
import { useDisplaySettings } from './useDisplaySettings.ts'
import { useShortcuts } from './useShortcuts.ts'

export function AppShell() {
  useShortcuts()
  useDisplaySettings()
  useSettings((s) => s.numberFormat)
  const name = useDocument((s) => s.name)
  const dirty = useDocument((s) => s.dirty)
  const hasFile = useDocument((s) => s.file !== null)
  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)

  useEffect(() => {
    document.title = hasFile ? `${dirty ? '• ' : ''}${name} — SS Claiming Model` : 'SS Claiming Model'
  }, [name, dirty, hasFile])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useDocument.getState().dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground text-sm">
      <header className="no-print flex h-10 items-center gap-2 border-b px-2">
        <FileMenu />
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="console" disabled={!hasFile}>
              Console
            </TabsTrigger>
            <TabsTrigger value="setup" disabled={!hasFile}>
              Setup
            </TabsTrigger>
            <TabsTrigger value="results" disabled={!hasFile}>
              Results
            </TabsTrigger>
            <TabsTrigger value="compare" disabled={!hasFile}>
              Compare
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <h1 className="ml-auto font-semibold text-sm">Social Security Claiming Model</h1>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => useUi.getState().setPaletteOpen(true)}
        >
          Commands <kbd className="font-mono text-[10px]">Ctrl+K</kbd>
        </Button>
        <SettingsMenu />
      </header>
      {hasFile && <ScenarioTabs />}
      <LoadErrors />
      <div className="min-h-0 flex-1 overflow-auto">{hasFile ? <ViewHost /> : <Welcome />}</div>
      <StatusBar />
      <NewHouseholdDialog />
      <CommandPalette />
    </div>
  )
}

function Welcome() {
  const cmd = useFileCommands()
  return (
    <div className="mx-auto mt-24 flex max-w-md flex-col items-center gap-4 text-center">
      <p className="text-muted-foreground">
        Model when to start Social Security, using your savings, taxes, expected expenses and uncertainty.
      </p>
      <div className="flex gap-2">
        <Button onClick={cmd.newHousehold}>New household…</Button>
        <Button variant="outline" onClick={() => void cmd.open()}>
          Open…
        </Button>
      </div>
    </div>
  )
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
