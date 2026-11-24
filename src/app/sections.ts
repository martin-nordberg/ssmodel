// The app's sections and their pages [FR-UI-19, FR-UI-21]: the source for the section tabs and their menus, the
// command palette's "Go to" commands, and section main pages' links. Routes are in routes.tsx.

export type SectionId = 'home' | 'past' | 'thisYear' | 'nextYear' | 'goals' | 'building' | 'retiring' | 'setup' | 'help'

export interface PageDef {
  label: string
  /** The route path. */
  to: string
  /** One line for the section's main page and the palette. */
  description: string
}

export interface SectionDef {
  id: SectionId
  label: string
  /** The section's main page (where clicking the tab goes). */
  to: string
  /** Pages in the tab's menu, main page first. */
  pages: PageDef[]
}

export const sections: SectionDef[] = [
  {
    id: 'home',
    label: 'Home',
    to: '/',
    pages: [{ label: 'Dashboard', to: '/', description: 'Where things stand, and what needs attention.' }],
  },
  {
    id: 'past',
    label: 'Past',
    to: '/past',
    pages: [{ label: 'Overview', to: '/past', description: 'Registers and reports of what has happened.' }],
  },
  {
    id: 'thisYear',
    label: 'This Year',
    to: '/this-year',
    pages: [{ label: 'Overview', to: '/this-year', description: 'This year’s budget against what has happened.' }],
  },
  {
    id: 'nextYear',
    label: 'Next Year',
    to: '/next-year',
    pages: [{ label: 'Overview', to: '/next-year', description: 'The budget for next year and the year after.' }],
  },
  {
    id: 'goals',
    label: 'Goals',
    to: '/goals',
    pages: [{ label: 'Overview', to: '/goals', description: 'Every goal on one timeline.' }],
  },
  {
    id: 'building',
    label: 'Building Years',
    to: '/building',
    pages: [{ label: 'Overview', to: '/building', description: 'Working years: wages, savings and debt.' }],
  },
  {
    id: 'retiring',
    label: 'Retiring Years',
    to: '/retiring/console',
    pages: [
      { label: 'Console', to: '/retiring/console', description: 'Levers, the recommendation and charts.' },
      { label: 'Setup', to: '/retiring/setup', description: 'The household’s retirement facts and assumptions.' },
      { label: 'Results', to: '/retiring/results', description: 'Year-by-year results and sensitivity.' },
      { label: 'Compare', to: '/retiring/compare', description: 'Scenarios side by side.' },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    to: '/setup',
    pages: [
      { label: 'Overview', to: '/setup', description: 'Everything that describes the household and the file.' },
      {
        label: 'Accounts and categories',
        to: '/setup/accounts',
        description: 'Every account, filed in categories, by type.',
      },
      { label: 'Vendors', to: '/setup/vendors', description: 'Who you pay and who pays you, with default accounts.' },
      { label: 'File settings', to: '/setup/file', description: 'Password, recovery key and backups.' },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    to: '/help',
    pages: [
      { label: 'Help', to: '/help', description: 'How to use ProvisionLens.' },
      { label: 'About', to: '/help/about', description: 'Version and credits.' },
    ],
  },
]

/** The section a path belongs to. */
export function sectionOf(pathname: string): SectionDef {
  const first = pathname.split('/')[1] ?? ''
  const id: SectionId =
    (
      {
        '': 'home',
        past: 'past',
        'this-year': 'thisYear',
        'next-year': 'nextYear',
        goals: 'goals',
        building: 'building',
        retiring: 'retiring',
        setup: 'setup',
        help: 'help',
      } as Record<string, SectionId>
    )[first] ?? 'home'
  return sections.find((s) => s.id === id)!
}
