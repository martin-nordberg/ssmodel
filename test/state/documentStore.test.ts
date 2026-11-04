import { beforeEach, expect, test } from 'bun:test'
import { useDocument } from '@/state/documentStore.ts'

const minimal = await Bun.file(new URL('../fixtures/minimal.yaml', import.meta.url)).text()

beforeEach(() => useDocument.getState().close())

test('load, update, undo, redo', () => {
  const doc = useDocument.getState()
  expect(doc.loadText(minimal, null, 'minimal.yaml')).toBe(true)
  expect(useDocument.getState().dirty).toBe(false)
  useDocument.getState().update((d) => {
    d.household.baseDate = '2028-01'
  })
  expect(useDocument.getState().file?.household.baseDate).toBe('2028-01')
  expect(useDocument.getState().dirty).toBe(true)
  useDocument.getState().undo()
  expect(useDocument.getState().file?.household.baseDate).toBe('2027-01')
  useDocument.getState().redo()
  expect(useDocument.getState().file?.household.baseDate).toBe('2028-01')
})

test('a failed load keeps the current file and records errors', () => {
  useDocument.getState().loadText(minimal, null, 'minimal.yaml')
  expect(useDocument.getState().loadText('schemaVersion: 1\n', null, 'bad.yaml')).toBe(false)
  expect(useDocument.getState().name).toBe('minimal.yaml')
  expect(useDocument.getState().loadErrors?.length).toBeGreaterThan(0)
})

test('serialize keeps comments', () => {
  useDocument.getState().loadText(minimal, null, 'minimal.yaml')
  expect(useDocument.getState().serialize()).toContain('# Minimal synthetic household')
})

import { withOverrides } from '@/state/documentStore.ts'

test('what-if overrides: set, undo, apply, reset', () => {
  const d = useDocument.getState()
  d.loadText(minimal, null, 'minimal.yaml')
  const id = useDocument.getState().activeScenarioId!
  useDocument.getState().setOverride('assumptions.inflation.mean', 0.04)
  expect(useDocument.getState().overrides[id]).toEqual({ 'assumptions.inflation.mean': 0.04 })
  expect(useDocument.getState().dirty).toBe(false)
  const s = useDocument.getState().file!.scenarios[0]!
  expect(withOverrides(s, useDocument.getState().overrides[id]).assumptions.inflation.mean).toBe(0.04)
  expect(s.assumptions.inflation.mean).toBe(0.025)
  useDocument.getState().undo()
  expect(useDocument.getState().overrides[id]).toBeUndefined()
  useDocument.getState().redo()
  useDocument.getState().applyOverrides()
  expect(useDocument.getState().file!.scenarios[0]!.assumptions.inflation.mean).toBe(0.04)
  expect(useDocument.getState().overrides[id]).toBeUndefined()
  expect(useDocument.getState().dirty).toBe(true)
  useDocument.getState().setOverride('expenses.survivorFraction', 0.6)
  useDocument.getState().resetOverrides()
  expect(useDocument.getState().overrides[id]).toBeUndefined()
})

test('save what-ifs as a new scenario', () => {
  useDocument.getState().loadText(minimal, null, 'minimal.yaml')
  useDocument.getState().setOverride('expenses.survivorFraction', 0.6)
  useDocument.getState().saveOverridesAsScenario('Lower survivor spending')
  const st = useDocument.getState()
  expect(st.file!.scenarios.map((s) => s.name)).toEqual(['Base case', 'Lower survivor spending'])
  expect(st.file!.scenarios[1]!.expenses.survivorFraction).toBe(0.6)
  expect(st.file!.scenarios[0]!.expenses.survivorFraction).toBe(0.75)
  expect(st.activeScenarioId).toBe(st.file!.scenarios[1]!.id)
})

test('scenario tabs: add, clone, rename, move, delete', () => {
  useDocument.getState().loadText(minimal, null, 'minimal.yaml')
  const base = useDocument.getState().file!.scenarios[0]!.id
  useDocument.getState().cloneScenario(base)
  useDocument.getState().addScenario()
  let names = useDocument.getState().file!.scenarios.map((s) => s.name)
  expect(names).toEqual(['Base case', 'Base case (copy)', 'Scenario 3'])
  const third = useDocument.getState().file!.scenarios[2]!.id
  useDocument.getState().renameScenario(third, 'Retire 2028')
  useDocument.getState().moveScenario(third, 0)
  names = useDocument.getState().file!.scenarios.map((s) => s.name)
  expect(names).toEqual(['Retire 2028', 'Base case', 'Base case (copy)'])
  useDocument.getState().deleteScenario(third)
  expect(useDocument.getState().file!.scenarios.length).toBe(2)
  expect(useDocument.getState().activeScenarioId).not.toBe(third)
  // Cannot delete the last scenario.
  const ids = useDocument.getState().file!.scenarios.map((s) => s.id)
  useDocument.getState().deleteScenario(ids[0]!)
  useDocument.getState().deleteScenario(ids[1]!)
  expect(useDocument.getState().file!.scenarios.length).toBe(1)
})
