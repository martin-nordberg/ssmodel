import { useMemo } from 'react'
import { prepare } from '@/engine/model/prepare.ts'
import type { HouseholdFile, ScenarioT } from '@/schema/model.ts'
import { activeScenario, useDocument, withOverrides } from './documentStore.ts'

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

/** The file with the active scenario's what-if overrides applied; what the Console and Results compute on. */
export function useEffectiveFile(): HouseholdFile | null {
  const file = useDocument((s) => s.file)
  const id = useDocument((s) => s.activeScenarioId)
  const ov = useDocument((s) => (id ? s.overrides[id] : undefined))
  return useMemo(() => {
    if (!file) return null
    if (!ov || Object.keys(ov).length === 0) return file
    return { ...file, scenarios: file.scenarios.map((s) => (s.id === id ? withOverrides(s, ov) : s)) }
  }, [file, id, ov])
}

export function useOverrideCount(scenarioId: string | null): number {
  return useDocument((s) => (scenarioId ? Object.keys(s.overrides[scenarioId] ?? {}).length : 0))
}

function usePreparedFor(file: HouseholdFile | null) {
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

/** Engine preparation for the saved active scenario (Setup's computed values). */
export function usePrepared() {
  return usePreparedFor(useFile())
}

/** Engine preparation including what-if overrides (Console and Results). */
export function useEffectivePrepared() {
  return usePreparedFor(useEffectiveFile())
}
