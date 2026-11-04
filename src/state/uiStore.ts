import { create } from 'zustand'

export type View = 'console' | 'setup' | 'results' | 'compare'

type UiState = {
  view: View
  newDialogOpen: boolean
  /** Year under the pointer, shared by charts and the detail strip [FR-UI-11]. */
  hoverYear: number | null
  setView(view: View): void
  setHoverYear(year: number | null): void
  setNewDialogOpen(open: boolean): void
}

export const useUi = create<UiState>()((set) => ({
  view: 'setup',
  newDialogOpen: false,
  hoverYear: null,
  setView: (view) => set({ view }),
  setHoverYear: (hoverYear) => set({ hoverYear }),
  setNewDialogOpen: (newDialogOpen) => set({ newDialogOpen }),
}))
