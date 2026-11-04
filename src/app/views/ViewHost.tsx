import { useUi } from '@/state/uiStore.ts'
import { CompareView } from './compare/CompareView.tsx'
import { ConsoleView } from './console/ConsoleView.tsx'
import { ResultsView } from './results/ResultsView.tsx'
import { SetupView } from './setup/SetupView.tsx'

export function ViewHost() {
  const view = useUi((s) => s.view)
  switch (view) {
    case 'setup':
      return <SetupView />
    case 'console':
      return <ConsoleView />
    case 'results':
      return <ResultsView />
    case 'compare':
      return <CompareView />
    default:
      return <div className="p-4 text-muted-foreground">The {view} view is not built yet.</div>
  }
}
