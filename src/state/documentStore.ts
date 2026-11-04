import { applyPatches, enablePatches, type Patch, produceWithPatches } from 'immer'
import type { Document } from 'yaml'
import { create } from 'zustand'
import type { HouseholdFile } from '@/schema/model.ts'
import { type FileError, parseHouseholdYaml, serializeHouseholdYaml } from '@/schema/yamlio.ts'

enablePatches()

type Change = { patches: Patch[]; inverse: Patch[]; label?: string }

const UNDO_LIMIT = 200

export type DocumentState = {
  file: HouseholdFile | null
  /** Document the file was loaded from; merged into on save so comments survive [FR-FILE-2]. */
  yamlDoc: Document | null
  handle: FileSystemFileHandle | null
  name: string
  dirty: boolean
  loadErrors: FileError[] | null
  activeScenarioId: string | null
  undoStack: Change[]
  redoStack: Change[]

  newFile(file: HouseholdFile): void
  /** Returns true if the text parsed; otherwise loadErrors is set and the current file is kept. */
  loadText(text: string, handle: FileSystemFileHandle | null, name: string): boolean
  serialize(): string
  markSaved(handle: FileSystemFileHandle, name: string): void
  update(recipe: (draft: HouseholdFile) => void, label?: string): void
  undo(): void
  redo(): void
  close(): void
  clearLoadErrors(): void
  setActiveScenario(id: string): void
}

export const useDocument = create<DocumentState>()((set, get) => ({
  file: null,
  yamlDoc: null,
  handle: null,
  name: 'Untitled.yaml',
  dirty: false,
  loadErrors: null,
  activeScenarioId: null,
  undoStack: [],
  redoStack: [],

  newFile(file) {
    set({
      file,
      yamlDoc: null,
      handle: null,
      name: 'Untitled.yaml',
      dirty: true,
      loadErrors: null,
      activeScenarioId: file.scenarios[0]?.id ?? null,
      undoStack: [],
      redoStack: [],
    })
  },

  loadText(text, handle, name) {
    const r = parseHouseholdYaml(text)
    if (!r.ok) {
      set({ loadErrors: r.errors })
      return false
    }
    set({
      file: r.value,
      yamlDoc: r.doc,
      handle,
      name,
      dirty: false,
      loadErrors: null,
      activeScenarioId: r.value.scenarios[0]?.id ?? null,
      undoStack: [],
      redoStack: [],
    })
    return true
  },

  serialize() {
    const { file, yamlDoc } = get()
    if (!file) throw new Error('no document')
    return serializeHouseholdYaml(file, yamlDoc ?? undefined)
  },

  markSaved(handle, name) {
    set({ handle, name, dirty: false })
  },

  update(recipe, label) {
    const { file, undoStack } = get()
    if (!file) return
    const [next, patches, inverse] = produceWithPatches(file, recipe)
    if (patches.length === 0) return
    const scenarioIds = next.scenarios.map((s) => s.id)
    const active = get().activeScenarioId
    set({
      file: next,
      dirty: true,
      undoStack: [...undoStack, { patches, inverse, label }].slice(-UNDO_LIMIT),
      redoStack: [],
      activeScenarioId: active && scenarioIds.includes(active) ? active : (scenarioIds[0] ?? null),
    })
  },

  undo() {
    const { file, undoStack, redoStack } = get()
    const change = undoStack.at(-1)
    if (!file || !change) return
    const next = applyPatches(file, change.inverse)
    set({ file: next, dirty: true, undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, change] })
    get().setActiveScenario(get().activeScenarioId ?? '')
  },

  redo() {
    const { file, undoStack, redoStack } = get()
    const change = redoStack.at(-1)
    if (!file || !change) return
    const next = applyPatches(file, change.patches)
    set({ file: next, dirty: true, undoStack: [...undoStack, change], redoStack: redoStack.slice(0, -1) })
    get().setActiveScenario(get().activeScenarioId ?? '')
  },

  close() {
    set({
      file: null,
      yamlDoc: null,
      handle: null,
      name: 'Untitled.yaml',
      dirty: false,
      loadErrors: null,
      activeScenarioId: null,
      undoStack: [],
      redoStack: [],
    })
  },

  clearLoadErrors() {
    set({ loadErrors: null })
  },

  setActiveScenario(id) {
    const ids = get().file?.scenarios.map((s) => s.id) ?? []
    set({ activeScenarioId: ids.includes(id) ? id : (ids[0] ?? null) })
  },
}))

export function activeScenario(state: DocumentState) {
  return state.file?.scenarios.find((s) => s.id === state.activeScenarioId) ?? state.file?.scenarios[0] ?? null
}
