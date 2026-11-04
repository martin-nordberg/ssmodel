// Turns a validated household file + scenario into the engine's prepared form: everything that does not depend
// on random draws or the claiming date is resolved once here.
import type { HouseholdFile, ScenarioT } from '../../schema/model.ts'
import { type InheritedRules, inheritedRules } from '../accounts/inheritedIra.ts'
import type { ExpenseItem, IncomeStream } from '../cashflow/expenses.ts'
import { claimCandidates, parseYM, SsaAge, type YM, ym, ymYear } from '../core/dates.ts'
import { ssaRules } from '../rules/tables.ts'
import { resolveReturn } from '../sim/returnPresets.ts'
import { type Haircut, haircutSchedule } from '../ss/haircut.ts'
import { PiaCalculator, projectedAwi, type StatementCheck, statementCrossCheck, taxableMax } from '../ss/pia.ts'
import { piaFromCurrentBenefit } from '../ss/spouse.ts'
import type { PersonIndex, SolverKind } from '../withdraw/solver.ts'

export type EngineAccount = {
  index: number
  label: string
  kind: SolverKind
  owner: PersonIndex
  joint: boolean
  balance: number
  basis: number
  mean: number
  sd: number
  fee: number
  dividendYield: number
  cashRate: number
  cashTargetMonths: number
  currentEmployer: boolean
  inherited: (InheritedRules & { schedule: 'even' | 'back_loaded' | 'bracket_aware' }) | null
  hsaContribution: number
  hsaPayMedicalFirst: boolean
  proxyMix: { stocks: number; bonds: number; cash: number } | null
}

export type EnginePerson = {
  name: string
  birthDate: string
  sex: 'male' | 'female'
  age: SsaAge
  birthYear: number
  earnings: { year: number; wages: number; selfEmployment: number }[]
  pre65: { cobraMonthly: number; cobraStart: YM; outOfPocket: number }
  fixedDeathAge: number
  ageOffset: number
}

export type Prepared = {
  scenario: ScenarioT
  baseYM: YM
  baseYear: number
  /** Last simulated year: the younger spouse reaches maxAge. */
  endYear: number
  people: [EnginePerson, EnginePerson]
  primaryPia: PiaCalculator
  /** The Spouse's own PIA and benefit in base-year dollars (COLAs through the base year included). */
  spouse: { claimed: YM; currentMonthly: number; pia: number }
  candidates: YM[]
  accounts: EngineAccount[]
  expenses: ExpenseItem[]
  incomes: IncomeStream[]
  haircut: Haircut
  priorMagi: Map<number, number>
  statementCheck: StatementCheck | null
  /** Nominal AWI growth used for PIA projections (mean inflation + real wage growth). */
  awiGrowth: number
  /** Payable fraction of benefits by month, indexed from baseYM [FR-TF-1]. */
  haircutByMonth: Float64Array
  /** OASDI taxable maximum by year, indexed from baseYear. */
  taxableMaxByYear: Float64Array
}

export function accountKind(a: ScenarioT['accounts'][number]): SolverKind {
  switch (a.type) {
    case 'traditional_ira':
    case 'traditional_401k':
      return 'traditional'
    case 'roth_ira':
    case 'roth_401k':
      return 'roth'
    case 'inherited_ira':
      return a.flavor === 'roth' ? 'inherited_roth' : 'inherited_traditional'
    case 'hsa':
      return 'hsa'
    case 'taxable':
      return 'taxable'
    case 'cash':
      return 'cash'
  }
}

const TYPE_LABELS: Record<ScenarioT['accounts'][number]['type'], string> = {
  traditional_ira: 'Traditional IRA',
  traditional_401k: 'Traditional 401(k)',
  roth_ira: 'Roth IRA',
  roth_401k: 'Roth 401(k)',
  inherited_ira: 'Inherited IRA',
  hsa: 'HSA',
  taxable: 'Taxable',
  cash: 'Cash',
}

function defaultLabel(acc: ScenarioT['accounts'][number]): string {
  const who = 'owner' in acc ? acc.owner : acc.beneficiary
  const name =
    acc.type === 'inherited_ira' ? `Inherited ${acc.flavor === 'roth' ? 'Roth' : 'IRA'}` : TYPE_LABELS[acc.type]
  return who === 'joint' ? name : `${name} (${who === 'primary' ? 'Primary' : 'Spouse'})`
}

const personIndex = (p: 'primary' | 'spouse' | 'joint'): PersonIndex => (p === 'spouse' ? 1 : 0)

export function prepare(file: HouseholdFile, scenarioId?: string): Prepared {
  const scenario = file.scenarios.find((s) => s.id === scenarioId) ?? file.scenarios[0]!
  const hh = file.household
  const baseYM = parseYM(hh.baseDate)
  const baseYear = ymYear(baseYM)
  const a = scenario.assumptions
  const awiGrowth = a.inflation.mean + a.realWageGrowth
  const awi = projectedAwi(awiGrowth)

  const p = hh.people.primary
  const s = hh.people.spouse
  const mk = (
    name: string,
    birthDate: string,
    sex: 'male' | 'female',
    earnings: EnginePerson['earnings'],
    pre65: ScenarioT['healthcare']['pre65']['primary'],
    key: 'primary' | 'spouse',
  ): EnginePerson => {
    const age = new SsaAge(birthDate)
    return {
      name,
      birthDate,
      sex,
      age,
      birthYear: age.birth.year,
      earnings,
      pre65: {
        cobraMonthly: pre65.cobraMonthly,
        cobraStart: pre65.start ? parseYM(pre65.start) : baseYM,
        outOfPocket: pre65.outOfPocket,
      },
      fixedDeathAge: a.mortality.deathAge[key],
      ageOffset: a.mortality.ageOffset[key],
    }
  }
  const people: [EnginePerson, EnginePerson] = [
    mk(p.name, p.birthDate, p.sex, p.earnings, scenario.healthcare.pre65.primary, 'primary'),
    mk(s.name, s.birthDate, s.sex, s.earnings, scenario.healthcare.pre65.spouse, 'spouse'),
  ]

  const primaryPia = new PiaCalculator({ birthDate: p.birthDate, record: p.earningsRecord, projected: p.earnings }, awi)
  const spouseClaimed = parseYM(s.ss.claimedDate)
  const spousePia = piaFromCurrentBenefit(s.ss.currentMonthly, spouseClaimed, people[1].age)

  let statementCheck: StatementCheck | null = null
  if (p.ss.fraEstimateMonthly && p.earningsRecord.length > 0) {
    const asOf = p.ss.estimateAsOf ? ymYear(parseYM(p.ss.estimateAsOf)) : ssaRules.latestColaYear - 1
    statementCheck = statementCrossCheck(
      { birthDate: p.birthDate, record: p.earningsRecord, projected: [] },
      p.ss.fraEstimateMonthly,
      asOf,
      awi,
    )
  }

  const accounts: EngineAccount[] = scenario.accounts.map((acc, index) => {
    const kind = accountKind(acc)
    const ret = acc.type === 'cash' ? { mean: acc.rate, sd: 0.005 } : resolveReturn(acc.return)
    const owner = acc.type === 'inherited_ira' ? personIndex(acc.beneficiary) : personIndex(acc.owner)
    let inherited: EngineAccount['inherited'] = null
    if (acc.type === 'inherited_ira') {
      const ben = owner === 0 ? p.birthDate : s.birthDate
      const rules = inheritedRules({
        flavor: acc.flavor,
        decedentBirthDate: acc.decedentBirthDate,
        decedentDeathDate: acc.decedentDeathDate,
        beneficiaryBirthDate: ben,
        beneficiaryClass: acc.beneficiaryClass,
      })
      inherited = { ...rules, schedule: acc.schedule ?? scenario.strategy.inheritedIraSchedule[acc.flavor] }
    }
    return {
      index,
      label: acc.label ?? defaultLabel(acc),
      kind,
      owner,
      joint: 'owner' in acc && acc.owner === 'joint',
      balance: acc.balance,
      basis: acc.type === 'taxable' ? (acc.costBasis ?? acc.balance) : 0,
      mean: ret.mean,
      sd: ret.sd,
      fee: acc.type === 'cash' ? 0 : acc.fee,
      dividendYield: acc.type === 'taxable' ? acc.dividendYield : 0,
      cashRate: acc.type === 'cash' ? acc.rate : 0,
      cashTargetMonths: acc.type === 'cash' ? acc.targetMonths : 0,
      currentEmployer: acc.type === 'traditional_401k' ? acc.currentEmployer : false,
      inherited,
      hsaContribution: acc.type === 'hsa' ? acc.annualContribution : 0,
      hsaPayMedicalFirst: acc.type === 'hsa' ? acc.payMedicalFirst : false,
      proxyMix: acc.type === 'cash' ? null : (acc.return.proxyMix ?? null),
    }
  })

  const younger = people[0].birthYear >= people[1].birthYear ? people[0] : people[1]
  const endYear = younger.birthYear + scenario.simulation.maxAge
  const haircut = haircutSchedule(scenario.trustFund)
  const nMonths = (endYear - baseYear + 1) * 12
  const haircutByMonth = new Float64Array(nMonths)
  for (let i = 0; i < nMonths; i++) haircutByMonth[i] = haircut(ym(baseYear, 1) + i)
  const taxableMaxByYear = new Float64Array(endYear - baseYear + 1)
  for (let y = baseYear; y <= endYear; y++) taxableMaxByYear[y - baseYear] = taxableMax(y, awi)

  return {
    scenario,
    baseYM,
    baseYear,
    endYear,
    people,
    primaryPia,
    spouse: { claimed: spouseClaimed, currentMonthly: s.ss.currentMonthly, pia: spousePia },
    candidates: claimCandidates(people[0].age, baseYM),
    accounts,
    expenses: scenario.expenses.items.map((e) => ({
      ...e,
      startYM: parseYM(e.start),
      endYM: e.end ? parseYM(e.end) : undefined,
    })),
    incomes: scenario.income.streams,
    haircut,
    priorMagi: new Map(Object.entries(hh.priorMagi).map(([y, v]) => [Number(y), v])),
    statementCheck,
    awiGrowth,
    haircutByMonth,
    taxableMaxByYear,
  }
}
