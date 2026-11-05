import { CircleCheck, CircleDashed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActiveScenario, useFile } from '@/state/scenario.ts'
import { useUi } from '@/state/uiStore.ts'
import { completeness, type SectionId } from './completeness.ts'
import { AccountsPanel } from './panels/AccountsPanel.tsx'
import { AssumptionsPanel } from './panels/AssumptionsPanel.tsx'
import { EarningsPanel } from './panels/EarningsPanel.tsx'
import { ExpensesPanel } from './panels/ExpensesPanel.tsx'
import { HealthcarePanel } from './panels/HealthcarePanel.tsx'
import { HomePanel } from './panels/HomePanel.tsx'
import { HouseholdPanel } from './panels/HouseholdPanel.tsx'
import { IncomePanel } from './panels/IncomePanel.tsx'
import { InheritancesPanel } from './panels/InheritancesPanel.tsx'
import { SocialSecurityPanel } from './panels/SocialSecurityPanel.tsx'
import { StrategyPanel } from './panels/StrategyPanel.tsx'

type Section = { id: SectionId; label: string; shared?: boolean; render: () => React.ReactNode }

export const SECTIONS: Section[] = [
  { id: 'household', label: 'Household', shared: true, render: () => <HouseholdPanel /> },
  { id: 'earnings', label: 'Earnings', shared: true, render: () => <EarningsPanel /> },
  { id: 'socialSecurity', label: 'Social Security', render: () => <SocialSecurityPanel /> },
  { id: 'accounts', label: 'Accounts', render: () => <AccountsPanel /> },
  { id: 'home', label: 'Home', render: () => <HomePanel /> },
  { id: 'inheritances', label: 'Inheritances', render: () => <InheritancesPanel /> },
  { id: 'income', label: 'Income', render: () => <IncomePanel /> },
  { id: 'expenses', label: 'Expenses', render: () => <ExpensesPanel /> },
  { id: 'healthcare', label: 'Healthcare', render: () => <HealthcarePanel /> },
  { id: 'assumptions', label: 'Assumptions', render: () => <AssumptionsPanel /> },
  { id: 'strategy', label: 'Strategy', render: () => <StrategyPanel /> },
]

/** Setup view [§8.1, §8.2]: one panel at a time with a section list and completeness checklist. */
export function SetupView() {
  const file = useFile()
  const scenario = useActiveScenario()
  const section = useUi((s) => s.setupSection)
  const setSection = useUi((s) => s.setSetupSection)
  if (!file || !scenario) return null
  const checks = completeness(file, scenario)
  const done = (id: SectionId) => checks.filter((c) => c.section === id).every((c) => c.done)
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!
  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="Setup sections" className="w-52 shrink-0 overflow-auto border-r p-2">
        <ul className="grid gap-0.5">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={s.id === section ? 'page' : undefined}
                aria-label={done(s.id) ? s.label : `${s.label} (incomplete)`}
                onClick={() => setSection(s.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted',
                  s.id === section && 'bg-muted font-medium',
                )}
              >
                {done(s.id) ? (
                  <CircleCheck className="size-3.5 text-muted-foreground" aria-hidden />
                ) : (
                  <CircleDashed className="size-3.5 text-destructive" aria-hidden />
                )}
                {s.label}
                {s.shared && <span className="ml-auto text-[10px] text-muted-foreground">shared</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-md border p-2" data-testid="completeness">
          <h3 className="mb-1 font-medium text-xs">Needed for the Console</h3>
          <ul className="grid gap-1">
            {checks.map((c) => (
              <li
                key={c.label}
                className={cn('flex items-start gap-1 text-xs', c.done ? 'text-muted-foreground line-through' : '')}
              >
                {c.done ? (
                  <CircleCheck className="mt-0.5 size-3 shrink-0" />
                ) : (
                  <CircleDashed className="mt-0.5 size-3 shrink-0 text-destructive" />
                )}
                <button type="button" className="text-left hover:underline" onClick={() => setSection(c.section)}>
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-auto p-4">{current.render()}</main>
    </div>
  )
}
