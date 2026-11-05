import type { HouseholdFile, ScenarioT } from '@/schema/model.ts'

export type SectionId =
  | 'household'
  | 'earnings'
  | 'socialSecurity'
  | 'accounts'
  | 'home'
  | 'inheritances'
  | 'income'
  | 'expenses'
  | 'healthcare'
  | 'assumptions'
  | 'strategy'

export type CheckItem = { label: string; done: boolean; section: SectionId }

/** Minimum facts before the Console is enabled [§8.1]. */
export function completeness(file: HouseholdFile, s: ScenarioT): CheckItem[] {
  const p = file.household.people.primary
  return [
    {
      label: 'Birth dates for both spouses',
      done: !!p.birthDate && !!file.household.people.spouse.birthDate,
      section: 'household',
    },
    {
      label: 'Earnings record or SSA FRA estimate',
      done: p.earningsRecord.length > 0 || (p.ss.fraEstimateMonthly ?? 0) > 0,
      section: 'earnings',
    },
    {
      label: "Spouse's current benefit",
      done: file.household.people.spouse.ss.currentMonthly > 0,
      section: 'socialSecurity',
    },
    { label: 'At least one account', done: s.accounts.length > 0, section: 'accounts' },
    {
      label: 'Living expenses',
      done: [...s.expenses.items, ...s.expenses.discretionary].some((e) => !e.oneTime && e.annual > 0),
      section: 'expenses',
    },
  ]
}

export const isComplete = (items: CheckItem[]) => items.every((i) => i.done)
