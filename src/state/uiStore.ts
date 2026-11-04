import { create } from 'zustand'

export type View = 'console' | 'setup' | 'results' | 'compare'

type UiState = {
  view: View
  newDialogOpen: boolean
  setView(view: View): void
  setNewDialogOpen(open: boolean): void
}

export const useUi = create<UiState>()((set) => ({
  view: 'setup',
  newDialogOpen: false,
  setView: (view) => set({ view }),
  setNewDialogOpen: (newDialogOpen) => set({ newDialogOpen }),
}))
