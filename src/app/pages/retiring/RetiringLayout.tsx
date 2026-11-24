import { Outlet } from '@tanstack/react-router'
import { useFileCommands } from '@/app/files/useFileCommands.ts'
import { ScenarioTabs } from '@/app/shell/ScenarioTabs.tsx'
import { CompareView } from '@/app/views/compare/CompareView.tsx'
import { ConsoleView } from '@/app/views/console/ConsoleView.tsx'
import { ResultsView } from '@/app/views/results/ResultsView.tsx'
import { SetupView } from '@/app/views/setup/SetupView.tsx'
import { Button } from '@/components/ui/button'
import { useDocument } from '@/state/documentStore.ts'

// Retiring Years [FR-UI-19, FR-UI-21]: ssmodel's Console, Setup, Results and Compare, unchanged, with the scenario
// tabs (only on scenario pages, FR-UI-25). They still use the household YAML file until P6.

export function RetiringLayout() {
  const hasFile = useDocument((s) => s.file !== null)
  return (
    <div className="flex h-full min-h-0 flex-col">
      {hasFile && <ScenarioTabs />}
      <div className="min-h-0 flex-1 overflow-auto">{hasFile ? <Outlet /> : <NoHousehold />}</div>
    </div>
  )
}

export function RetiringView({ view }: { view: 'console' | 'setup' | 'results' | 'compare' }) {
  switch (view) {
    case 'console':
      return <ConsoleView />
    case 'setup':
      return <SetupView />
    case 'results':
      return <ResultsView />
    case 'compare':
      return <CompareView />
  }
}

function NoHousehold() {
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
