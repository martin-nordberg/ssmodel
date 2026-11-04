import { useUi } from '@/state/uiStore.ts'
import { ResultsView } from './results/ResultsView.tsx'
import { SetupView } from './setup/SetupView.tsx'

export function ViewHost() {
  const view = useUi((s) => s.view)
  switch (view) {
    case 'setup':
      return <SetupView />
    case 'results':
      return <ResultsView />
    default:
      return <div className="p-4 text-muted-foreground">The {view} view is not built yet.</div>
  }
}
