import { useMemo } from 'react'
import { prepare } from '@/engine/model/prepare.ts'
import type { HouseholdFile, ScenarioT } from '@/schema/model.ts'
import { activeScenario, useDocument } from './documentStore.ts'

export function useActiveScenario(): ScenarioT | null {
  return useDocument(activeScenario)
}

export function useFile(): HouseholdFile | null {
  return useDocument((s) => s.file)
}

/** Update the active scenario in place (one undo step). */
export function updateScenario(recipe: (s: ScenarioT) => void, label?: string) {
  const st = useDocument.getState()
  const id = st.activeScenarioId
  st.update((d) => {
    const s = d.scenarios.find((x) => x.id === id) ?? d.scenarios[0]
    if (s) recipe(s)
  }, label)
}

export function updateFile(recipe: (f: HouseholdFile) => void, label?: string) {
  useDocument.getState().update(recipe, label)
}

/** Engine preparation for the active scenario (PIA, candidates, statement check); null if it fails. */
export function usePrepared() {
  const file = useFile()
  const id = useDocument((s) => s.activeScenarioId)
  return useMemo(() => {
    if (!file) return null
    try {
      return prepare(file, id ?? undefined)
    } catch {
      return null
    }
  }, [file, id])
}
