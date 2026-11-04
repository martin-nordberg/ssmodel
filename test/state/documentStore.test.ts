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
