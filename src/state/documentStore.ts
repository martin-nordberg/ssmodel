import { applyPatches, enablePatches, type Patch, produce, produceWithPatches } from 'immer'
import type { Document } from 'yaml'
import { create } from 'zustand'
import { type HouseholdFile, Scenario, type ScenarioT } from '@/schema/model.ts'
import { type FileError, parseHouseholdYaml, serializeHouseholdYaml } from '@/schema/yamlio.ts'

enablePatches()

/** What-if overrides per scenario: dotted path within the scenario -> value [FR-UI-8]. Never saved. */
export type Overrides = Record<string, Record<string, unknown>>

type Change = { layer: 'file' | 'overrides'; patches: Patch[]; inverse: Patch[]; label?: string }

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
  overrides: Overrides
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

  // what-if layer
  setOverride(path: string, value: unknown): void
  clearOverride(path: string): void
  resetOverrides(): void
  /** Writes the active scenario's overrides into it (one undo step) and clears them. */
  applyOverrides(): void
  /** Clones the active scenario with its overrides applied, as a new tab. */
  saveOverridesAsScenario(name: string): void

  // scenario tabs [FR-UI-1]
  addScenario(): void
  cloneScenario(id: string): void
  renameScenario(id: string, name: string): void
  deleteScenario(id: string): void
  moveScenario(id: string, toIndex: number): void
}

export function newScenarioId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Sets a dotted path (e.g. "assumptions.inflation.mean") inside an Immer draft. */
function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.')
  let o: Record<string, unknown> = target
  for (const k of keys.slice(0, -1)) {
    if (o[k] === undefined || o[k] === null || typeof o[k] !== 'object') o[k] = {}
    o = o[k] as Record<string, unknown>
  }
  o[keys.at(-1)!] = value
}

export function getPath(target: unknown, path: string): unknown {
  let o: unknown = target
  for (const k of path.split('.')) {
    if (o === null || typeof o !== 'object') return undefined
    o = (o as Record<string, unknown>)[k]
  }
  return o
}

/** The scenario with what-if overrides applied (the input to the Console's runs). */
export function withOverrides(s: ScenarioT, ov: Record<string, unknown> | undefined): ScenarioT {
  if (!ov || Object.keys(ov).length === 0) return s
  return produce(s, (d) => {
    for (const [path, value] of Object.entries(ov)) setPath(d as unknown as Record<string, unknown>, path, value)
  })
}

const initial = {
  file: null,
  yamlDoc: null,
  handle: null,
  name: 'Untitled.yaml',
  dirty: false,
  loadErrors: null,
  activeScenarioId: null,
  overrides: {},
  undoStack: [],
  redoStack: [],
}

export const useDocument = create<DocumentState>()((set, get) => {
  const pushChange = (change: Change) =>
    set({ undoStack: [...get().undoStack, change].slice(-UNDO_LIMIT), redoStack: [] })
  const updateOverrides = (recipe: (d: Overrides) => void, label?: string) => {
    const [next, patches, inverse] = produceWithPatches(get().overrides, recipe)
    if (patches.length === 0) return
    set({ overrides: next })
    pushChange({ layer: 'overrides', patches, inverse, label })
  }
  const fixActive = () => {
    const ids = get().file?.scenarios.map((s) => s.id) ?? []
    const a = get().activeScenarioId
    if (!a || !ids.includes(a)) set({ activeScenarioId: ids[0] ?? null })
  }
  const activeId = () => get().activeScenarioId ?? get().file?.scenarios[0]?.id ?? ''

  return {
    ...initial,

    newFile(file) {
      set({ ...initial, file, dirty: true, activeScenarioId: file.scenarios[0]?.id ?? null })
    },

    loadText(text, handle, name) {
      const r = parseHouseholdYaml(text)
      if (!r.ok) {
        set({ loadErrors: r.errors })
        return false
      }
      set({
        ...initial,
        file: r.value,
        yamlDoc: r.doc,
        handle,
        name,
        activeScenarioId: r.value.scenarios[0]?.id ?? null,
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
      const { file } = get()
      if (!file) return
      const [next, patches, inverse] = produceWithPatches(file, recipe)
      if (patches.length === 0) return
      set({ file: next, dirty: true })
      pushChange({ layer: 'file', patches, inverse, label })
      fixActive()
    },

    undo() {
      const { undoStack, redoStack } = get()
      const change = undoStack.at(-1)
      if (!change) return
      if (change.layer === 'file') {
        const file = get().file
        if (!file) return
        set({ file: applyPatches(file, change.inverse), dirty: true })
      } else set({ overrides: applyPatches(get().overrides, change.inverse) })
      set({ undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, change] })
      fixActive()
    },

    redo() {
      const { undoStack, redoStack } = get()
      const change = redoStack.at(-1)
      if (!change) return
      if (change.layer === 'file') {
        const file = get().file
        if (!file) return
        set({ file: applyPatches(file, change.patches), dirty: true })
      } else set({ overrides: applyPatches(get().overrides, change.patches) })
      set({ undoStack: [...undoStack, change], redoStack: redoStack.slice(0, -1) })
      fixActive()
    },

    close() {
      set({ ...initial })
    },

    clearLoadErrors() {
      set({ loadErrors: null })
    },

    setActiveScenario(id) {
      const ids = get().file?.scenarios.map((s) => s.id) ?? []
      set({ activeScenarioId: ids.includes(id) ? id : (ids[0] ?? null) })
    },

    setOverride(path, value) {
      const id = activeId()
      updateOverrides((d) => {
        d[id] ??= {}
        d[id][path] = value
      }, `what-if ${path}`)
    },

    clearOverride(path) {
      const id = activeId()
      if (!get().overrides[id] || !(path in get().overrides[id]!)) return
      updateOverrides((d) => {
        delete d[id]?.[path]
      })
    },

    resetOverrides() {
      const id = activeId()
      if (!get().overrides[id] || Object.keys(get().overrides[id]!).length === 0) return
      updateOverrides((d) => {
        delete d[id]
      }, 'reset what-ifs')
    },

    applyOverrides() {
      const id = activeId()
      const ov = get().overrides[id]
      if (!ov || Object.keys(ov).length === 0) return
      get().update((f) => {
        const s = f.scenarios.find((x) => x.id === id)
        if (!s) return
        for (const [path, value] of Object.entries(ov)) setPath(s as unknown as Record<string, unknown>, path, value)
      }, 'apply what-ifs')
      get().resetOverrides()
    },

    saveOverridesAsScenario(name) {
      const id = activeId()
      const file = get().file
      const s = file?.scenarios.find((x) => x.id === id)
      if (!file || !s) return
      const copy = { ...withOverrides(s, get().overrides[id]), id: newScenarioId(), name }
      get().update((f) => {
        const i = f.scenarios.findIndex((x) => x.id === id)
        f.scenarios.splice(i + 1, 0, copy)
      }, 'save what-ifs as scenario')
      get().resetOverrides()
      set({ activeScenarioId: copy.id })
    },

    addScenario() {
      const file = get().file
      if (!file) return
      const s = Scenario.parse({ id: newScenarioId(), name: `Scenario ${file.scenarios.length + 1}` })
      get().update((f) => {
        f.scenarios.push(s)
      }, 'new scenario')
      set({ activeScenarioId: s.id })
    },

    cloneScenario(id) {
      const s = get().file?.scenarios.find((x) => x.id === id)
      if (!s) return
      const copy = { ...structuredClone(s), id: newScenarioId(), name: `${s.name} (copy)` }
      get().update((f) => {
        const i = f.scenarios.findIndex((x) => x.id === id)
        f.scenarios.splice(i + 1, 0, copy)
      }, 'clone scenario')
      set({ activeScenarioId: copy.id })
    },

    renameScenario(id, name) {
      const trimmed = name.trim()
      if (!trimmed) return
      get().update((f) => {
        const s = f.scenarios.find((x) => x.id === id)
        if (s) s.name = trimmed
      }, 'rename scenario')
    },

    deleteScenario(id) {
      const file = get().file
      if (!file || file.scenarios.length <= 1) return
      get().update((f) => {
        f.scenarios = f.scenarios.filter((x) => x.id !== id)
      }, 'delete scenario')
    },

    moveScenario(id, toIndex) {
      get().update((f) => {
        const i = f.scenarios.findIndex((x) => x.id === id)
        if (i < 0) return
        const [s] = f.scenarios.splice(i, 1)
        f.scenarios.splice(Math.max(0, Math.min(f.scenarios.length, toIndex)), 0, s!)
      }, 'reorder scenarios')
    },
  }
})

export function activeScenario(state: DocumentState) {
  return state.file?.scenarios.find((s) => s.id === state.activeScenarioId) ?? state.file?.scenarios[0] ?? null
}
