import { parseHref } from '@tanstack/history'
import { createBrowserHistory, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { AppShell } from '@/app/shell/AppShell.tsx'
import { periodRegex } from '@/ledger/core/Period.ts'
import { AboutPage } from './pages/help/AboutPage.tsx'
import { HelpPage } from './pages/help/HelpPage.tsx'
import { TemplateGalleryPage } from './pages/help/TemplateGalleryPage.tsx'
import { HomePage } from './pages/home/HomePage.tsx'
import { BalanceChecksPage, LogsPage } from './pages/past/LogsPage.tsx'
import { PastPage } from './pages/past/PastPage.tsx'
import { RegistersPage } from './pages/past/RegistersPage.tsx'
import { RegisterPage } from './pages/past/register/RegisterPage.tsx'
import { BalanceSheetPage, defaultPeriod, IncomeStatementPage } from './pages/past/statements/StatementsPages.tsx'
import { SectionPlaceholder } from './pages/placeholder/SectionPlaceholder.tsx'
import { RetiringLayout, RetiringView } from './pages/retiring/RetiringLayout.tsx'
import { AccountsPage, type EditableType, editableTypes } from './pages/setup/accounts/AccountsPage.tsx'
import { FileSettingsPage } from './pages/setup/FileSettingsPage.tsx'
import { SetupPage } from './pages/setup/SetupPage.tsx'
import { VendorsPage } from './pages/setup/vendors/VendorsPage.tsx'
import type { Crumb } from './shell/Breadcrumbs.tsx'

// Every page has a route [FR-UI-23, D: OQ-UI-6]: hash history, so back/forward, reload and a second window work on a
// static host. Pages' main parameters (account, period, scenario) are route params or search params.

const rootRoute = createRootRoute({ component: AppShell })

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })

const pastRoute = createRoute({ getParentRoute: () => rootRoute, path: 'past', component: PastPage })
const registersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'past/registers',
  component: RegistersPage,
})
const incomeLogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'past/income-log',
  component: () => <LogsPage type="INCOME" />,
})
const expenseLogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'past/expense-log',
  component: () => <LogsPage type="EXPENSE" />,
})
/** A report period from the address; a bare year arrives as a number (search params are JSON). */
const period = (search: Record<string, unknown>) => {
  const raw = typeof search.period === 'number' ? String(search.period) : search.period
  return typeof raw === 'string' && periodRegex.test(raw) ? raw : defaultPeriod()
}
const balanceSheetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'past/balance-sheet',
  component: BalanceSheetPage,
  validateSearch: (search: Record<string, unknown>): { period: string } => ({ period: period(search) }),
})
const incomeStatementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'past/income-statement',
  component: IncomeStatementPage,
  validateSearch: (search: Record<string, unknown>): { period: string; view: 'summary' | 'details' } => ({
    period: period(search),
    view: search.view === 'details' ? 'details' : 'summary',
  }),
})
const balanceChecksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'past/balance-checks',
  component: BalanceChecksPage,
})

/** Pages reached by drilling down accept the trail back up [FR-UI-22]. */
const trailSearch = (search: Record<string, unknown>): { trail?: Crumb[] } =>
  Array.isArray(search.trail) ? { trail: search.trail as Crumb[] } : {}

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'past/register/$acctId',
  component: RegisterPage,
  validateSearch: trailSearch,
})

const placeholder = (path: string, id: Parameters<typeof SectionPlaceholder>[0]['section']) =>
  createRoute({ getParentRoute: () => rootRoute, path, component: () => <SectionPlaceholder section={id} /> })

const retiringRoute = createRoute({ getParentRoute: () => rootRoute, path: 'retiring', component: RetiringLayout })
const retiringIndex = createRoute({
  getParentRoute: () => retiringRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/retiring/console' })
  },
})
const retiringPage = (view: 'console' | 'setup' | 'results' | 'compare') =>
  createRoute({ getParentRoute: () => retiringRoute, path: view, component: () => <RetiringView view={view} /> })

const setupRoute = createRoute({ getParentRoute: () => rootRoute, path: 'setup', component: SetupPage })
const fileSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'setup/file',
  component: FileSettingsPage,
})

const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'setup/accounts',
  component: AccountsPage,
  validateSearch: (search: Record<string, unknown>): { type: EditableType } => ({
    type: editableTypes.includes(search.type as EditableType) ? (search.type as EditableType) : 'ASSET',
  }),
})
const vendorsRoute = createRoute({ getParentRoute: () => rootRoute, path: 'setup/vendors', component: VendorsPage })

const helpRoute = createRoute({ getParentRoute: () => rootRoute, path: 'help', component: HelpPage })
const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: 'help/about', component: AboutPage })
const galleryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'help/gallery',
  component: TemplateGalleryPage,
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  pastRoute,
  registersRoute,
  incomeLogRoute,
  expenseLogRoute,
  balanceChecksRoute,
  balanceSheetRoute,
  incomeStatementRoute,
  registerRoute,
  placeholder('this-year', 'thisYear'),
  placeholder('next-year', 'nextYear'),
  placeholder('goals', 'goals'),
  placeholder('building', 'building'),
  retiringRoute.addChildren([
    retiringIndex,
    retiringPage('console'),
    retiringPage('setup'),
    retiringPage('results'),
    retiringPage('compare'),
  ]),
  setupRoute,
  fileSettingsRoute,
  accountsRoute,
  vendorsRoute,
  helpRoute,
  aboutRoute,
  galleryRoute,
])

/**
 * Hash history whose route (path and search) lives entirely in the hash. TanStack's createHashHistory also appends
 * the page's real query string to the route, which corrupts a route's own search params whenever the page has one
 * (the e2e and debug flags, such as ?e2e).
 */
function hashHistory() {
  return createBrowserHistory({
    parseLocation: () => {
      const hash = window.location.hash
      let end = hash.indexOf('#', 1)
      if (end < 0) end = hash.length
      return parseHref(`${hash ? hash.slice(1, end) : '/'}${hash.slice(end)}`, window.history.state)
    },
    createHref: (href) => `${window.location.pathname}${window.location.search}#${href}`,
  })
}

export const router = createRouter({ routeTree, history: hashHistory(), defaultPreload: false })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
