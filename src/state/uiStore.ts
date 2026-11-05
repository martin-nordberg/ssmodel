import { create } from 'zustand'

export type View = 'console' | 'setup' | 'results' | 'compare'

type UiState = {
  view: View
  /** Setup panel shown (a SectionId of the Setup view). */
  setupSection: string
  newDialogOpen: boolean
  paletteOpen: boolean
  /** Year under the pointer, shared by charts and the detail strip [FR-UI-11]. */
  hoverYear: number | null
  setView(view: View): void
  setSetupSection(id: string): void
  setPaletteOpen(open: boolean): void
  setHoverYear(year: number | null): void
  setNewDialogOpen(open: boolean): void
}

export const useUi = create<UiState>()((set) => ({
  view: 'setup',
  setupSection: 'household',
  newDialogOpen: false,
  paletteOpen: false,
  hoverYear: null,
  setView: (view) => set({ view }),
  setSetupSection: (setupSection) => set({ setupSection }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setHoverYear: (hoverYear) => set({ hoverYear }),
  setNewDialogOpen: (newDialogOpen) => set({ newDialogOpen }),
}))
