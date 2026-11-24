import { create } from 'zustand'

type UiState = {
  /** Setup panel shown (a SectionId of the Setup view). */
  setupSection: string
  newDialogOpen: boolean
  paletteOpen: boolean
  /** Year under the pointer, shared by charts and the detail strip [FR-UI-11]. */
  hoverYear: number | null
  setSetupSection(id: string): void
  setPaletteOpen(open: boolean): void
  setHoverYear(year: number | null): void
  setNewDialogOpen(open: boolean): void
}

export const useUi = create<UiState>()((set) => ({
  setupSection: 'household',
  newDialogOpen: false,
  paletteOpen: false,
  hoverYear: null,
  setSetupSection: (setupSection) => set({ setupSection }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setHoverYear: (hoverYear) => set({ hoverYear }),
  setNewDialogOpen: (newDialogOpen) => set({ newDialogOpen }),
}))
