import { create } from 'zustand'

// Per-user display settings [FR-UI-16], kept in localStorage (never in the household file).
export type Settings = {
  dollars: 'real' | 'nominal'
  theme: 'system' | 'light' | 'dark'
  density: 'compact' | 'comfortable'
  numberFormat: 'compact' | 'full'
}

const KEY = 'ssmodel.settings'
const defaults: Settings = { dollars: 'real', theme: 'system', density: 'compact', numberFormat: 'full' }

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

type SettingsState = Settings & { set(patch: Partial<Settings>): void }

export const useSettings = create<SettingsState>()((set, get) => ({
  ...(typeof localStorage === 'undefined' ? defaults : load()),
  set(patch) {
    set(patch)
    try {
      const { set: _s, ...rest } = { ...get(), ...patch }
      localStorage.setItem(KEY, JSON.stringify(rest))
    } catch {
      // Storage may be unavailable; settings are a convenience.
    }
  },
}))
