import { z } from 'zod'

// Input model for a household file (requirements §9). Facts live under `household`; plan and levers live per
// scenario. Every nested object uses `.prefault({})` so minimal files parse with defaults filled in.

export const CURRENT_SCHEMA_VERSION = 2

export const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM')
export const DateStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'expected YYYY-MM-DD')
const NonNegMoney = z.number().finite().min(0)
const Rate = z.number().finite().min(-1).max(1)
const Fraction = z.number().finite().min(0).max(1)

export const Person = z.enum(['primary', 'spouse'])
export const OwnerJ = z.enum(['primary', 'spouse', 'joint'])
export const Sex = z.enum(['male', 'female'])

export const ReturnPreset = z.enum(['conservative', 'moderate', 'aggressive', 'cash'])
export const ReturnSpec = z
  .object({
    preset: ReturnPreset.optional(),
    mean: Rate.optional(),
    sd: z.number().finite().min(0).max(1).optional(),
    /** Stock/bond/cash proxy mix, used only by the historical bootstrap model [FR-MC-3]. */
    proxyMix: z.object({ stocks: Fraction, bonds: Fraction, cash: Fraction }).optional(),
  })
  .prefault({ preset: 'moderate' })

// ---------- household facts ----------

export const EarningsRecordRow = z.object({ year: z.int().min(1937).max(2100), amount: NonNegMoney })
export const ProjectedEarningsRow = z.object({
  year: z.int().min(2000).max(2100),
  wages: NonNegMoney.default(0),
  selfEmployment: NonNegMoney.default(0),
})

export const PrimaryPerson = z.object({
  name: z.string().default('Primary'),
  birthDate: DateStr,
  sex: Sex.default('male'),
  ss: z
    .object({
      /** FRA estimate from the SSA statement, in statement (today's) dollars. */
      fraEstimateMonthly: NonNegMoney.optional(),
      estimateAsOf: YearMonth.optional(),
    })
    .prefault({}),
  /** Taxed Social Security earnings by year, pasted from the SSA statement [FR-SS-2]. */
  earningsRecord: z.array(EarningsRecordRow).default([]),
  /** Projected earnings by calendar year [FR-INC-1]. */
  earnings: z.array(ProjectedEarningsRow).default([]),
})

export const SpousePerson = z.object({
  name: z.string().default('Spouse'),
  birthDate: DateStr,
  sex: Sex.default('female'),
  ss: z.object({
    /** Current monthly benefit on her own record, including COLAs to date. */
    currentMonthly: NonNegMoney,
    /** Month her own benefit started; with birth date this yields her PIA [FR-SS-3]. */
    claimedDate: YearMonth,
  }),
  earnings: z.array(ProjectedEarningsRow).default([]),
})

export const Household = z.object({
  baseDate: YearMonth.default('2027-01').refine((s) => s >= '2027-01', 'base date cannot be before 2027-01'),
  state: z.literal('SC').default('SC'),
  /** Actual MAGI for the two years before the model starts, for the IRMAA lookback [FR-TAX-5]. */
  priorMagi: z.record(z.string().regex(/^\d{4}$/), NonNegMoney).default({}),
  people: z.object({ primary: PrimaryPerson, spouse: SpousePerson }),
})

// ---------- scenario: accounts ----------

const accountBase = {
  id: z.string().optional(),
  label: z.string().optional(),
  balance: NonNegMoney.default(0),
  return: ReturnSpec,
  fee: z.number().finite().min(0).max(0.05).default(0),
}

export const BeneficiaryClass = z.enum(['designated', 'eligible_designated'])
export const InheritedSchedule = z.enum(['even', 'back_loaded', 'bracket_aware'])

export const Account = z.discriminatedUnion('type', [
  z.object({ type: z.literal('traditional_ira'), owner: Person, ...accountBase }),
  z.object({ type: z.literal('roth_ira'), owner: Person, ...accountBase }),
  z.object({
    type: z.literal('traditional_401k'),
    owner: Person,
    ...accountBase,
    /** Current employer's plan: RMDs deferred while the owner has wages [§3.4]. */
    currentEmployer: z.boolean().default(false),
  }),
  z.object({ type: z.literal('roth_401k'), owner: Person, ...accountBase }),
  z.object({
    type: z.literal('inherited_ira'),
    flavor: z.enum(['traditional', 'roth']).default('traditional'),
    beneficiary: Person,
    ...accountBase,
    decedentBirthDate: DateStr,
    decedentDeathDate: DateStr,
    beneficiaryClass: BeneficiaryClass.default('designated'),
    /** Overrides strategy.inheritedIraSchedule for this account. */
    schedule: InheritedSchedule.optional(),
  }),
  z.object({
    type: z.literal('hsa'),
    owner: Person,
    ...accountBase,
    annualContribution: NonNegMoney.default(0),
    payMedicalFirst: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('taxable'),
    owner: OwnerJ.default('joint'),
    ...accountBase,
    costBasis: NonNegMoney.optional(),
    dividendYield: z.number().finite().min(0).max(0.2).default(0.015),
  }),
  z.object({
    type: z.literal('cash'),
    owner: OwnerJ.default('joint'),
    id: z.string().optional(),
    label: z.string().optional(),
    balance: NonNegMoney.default(0),
    rate: z.number().finite().min(0).max(0.2).default(0.03),
    targetMonths: z.number().finite().min(0).max(60).default(0),
  }),
])

// ---------- scenario: home, inheritances, income, expenses, healthcare ----------

export const Volatile = z.object({ mean: Rate, sd: z.number().finite().min(0).max(1) })

export const SalePlan = z
  .object({
    mode: z.enum(['none', 'planned', 'backstop']).default('none'),
    date: YearMonth.optional(),
    liquidFloor: NonNegMoney.default(0),
    sellingCostPct: Fraction.default(0.07),
    replacementCost: NonNegMoney.default(0),
  })
  .prefault({})

/** Fixed-rate mortgage from a statement: the payment (principal + interest) is derived [FR-ACC-7]. */
export const Mortgage = z
  .object({
    /** Principal balance on the statement date (after that month's payment). */
    balance: NonNegMoney,
    asOf: YearMonth,
    rate: z.number().finite().min(0).max(0.2),
    /** Month of the last payment. */
    payoff: YearMonth,
  })
  .refine((m) => m.payoff > m.asOf, { message: 'payoff must be after the balance date', path: ['payoff'] })

/** Annual home costs in base-date dollars, inflation-indexed; paid while the home is owned, ending at a sale. */
export const HomeCosts = z
  .object({
    propertyTax: NonNegMoney.default(0),
    insurance: NonNegMoney.default(0),
    maintenance: NonNegMoney.default(0),
  })
  .prefault({})

export const Home = z.object({
  value: NonNegMoney,
  basis: NonNegMoney.default(0),
  appreciation: Volatile.prefault({ mean: 0.03, sd: 0.06 }),
  /** No new mortgage is taken on a replacement home. */
  mortgage: Mortgage.optional(),
  costs: HomeCosts,
  /** Fractions by which each cost falls after downsizing to the replacement home (sale.replacementCost > 0). */
  replacementCostCuts: z
    .object({ propertyTax: Fraction.default(0), insurance: Fraction.default(0), maintenance: Fraction.default(0) })
    .prefault({}),
  sale: SalePlan,
})

export const InheritedRealEstate = z.object({
  label: z.string(),
  value: NonNegMoney,
  disposition: z.enum(['sell_on_receipt', 'keep']).default('sell_on_receipt'),
  appreciation: Volatile.prefault({ mean: 0.03, sd: 0.06 }),
  carryingCosts: NonNegMoney.default(0),
  rentalIncome: NonNegMoney.default(0),
  sale: SalePlan,
})

export const Inheritance = z.object({
  label: z.string(),
  heir: Person,
  decedentBirthDate: DateStr,
  decedentSex: Sex.default('female'),
  timing: z
    .object({
      mode: z.enum(['mortality', 'fixed', 'window']).default('mortality'),
      date: YearMonth.optional(),
      from: YearMonth.optional(),
      to: YearMonth.optional(),
      ageOffset: z.number().finite().min(-20).max(20).default(0),
    })
    .prefault({}),
  amounts: z
    .object({
      traditionalIra: NonNegMoney.default(0),
      rothIra: NonNegMoney.default(0),
      nonIra: NonNegMoney.default(0),
    })
    .prefault({}),
  realEstate: z.array(InheritedRealEstate).default([]),
  growth: z.object({ realRate: Rate.default(0), annualSpendDown: NonNegMoney.default(0) }).prefault({}),
  probability: Fraction.default(1),
  ifHeirPredeceases: z.enum(['surviving_spouse', 'lost']).default('surviving_spouse'),
  beneficiaryClass: BeneficiaryClass.default('designated'),
})

export const Indexing = z.union([z.enum(['inflation', 'none', 'medical']), z.number().finite().min(-0.5).max(0.5)])

export const Annuity = z.object({
  label: z.string(),
  owner: Person,
  monthly: NonNegMoney,
  start: YearMonth,
  colaPercent: z.number().finite().min(0).max(0.2).default(0),
  survivorPercent: Fraction.default(0),
  qualified: z.boolean().default(true),
  exclusionRatio: Fraction.default(0),
  /** Investment in the contract for a non-qualified annuity; exclusion stops once recovered. */
  basis: NonNegMoney.optional(),
})

export const IncomeStream = z.object({
  label: z.string(),
  owner: OwnerJ,
  annual: NonNegMoney,
  start: YearMonth,
  end: YearMonth.optional(),
  indexing: Indexing.default('inflation'),
  tax: z.enum(['ordinary', 'tax_free']).default('ordinary'),
})

export const ExpenseItem = z.object({
  label: z.string(),
  /** Annual amount in base-date dollars (or nominal when indexing is 'none'); for oneTime, the total amount. */
  annual: NonNegMoney,
  start: YearMonth,
  end: YearMonth.optional(),
  indexing: Indexing.default('inflation'),
  oneTime: z.boolean().default(false),
  /** Scaled by survivorFraction after the first death [FR-EXP-2]. */
  perPerson: z.boolean().default(false),
  /** Counts as an itemized deduction: a charitable gift or a medical cost [FR-TAX-6]. */
  deductible: z.enum(['charity', 'medical']).optional(),
})

export const Pre65 = z.object({
  cobraMonthly: NonNegMoney.default(0),
  start: YearMonth.optional(),
  outOfPocket: NonNegMoney.default(0),
})

export const Healthcare = z
  .object({
    medicalInflationSpread: z.number().finite().min(-0.05).max(0.1).default(0.015),
    pre65: z.object({ primary: Pre65.prefault({}), spouse: Pre65.prefault({}) }).prefault({}),
    medicare: z
      .object({
        medigapAnnual: NonNegMoney.default(0),
        outOfPocket: NonNegMoney.default(0),
      })
      .prefault({}),
  })
  .prefault({})

// ---------- scenario: strategy, assumptions, simulation, objective ----------

export const Bracket = z.union([z.literal(0.1), z.literal(0.12), z.literal(0.22), z.literal(0.24), z.literal(0.32)])
export const AccountType = z.enum([
  'cash',
  'taxable',
  'traditional',
  'inherited_traditional',
  'roth',
  'inherited_roth',
  'hsa',
])

export const Strategy = z
  .object({
    withdrawal: z.enum(['conventional', 'bracket_fill', 'proportional', 'custom']).default('bracket_fill'),
    targetBracket: Bracket.default(0.12),
    /** Highest IRMAA tier (0 = no surcharge) that bracket-fill may push MAGI into. */
    irmaaCapTier: z.int().min(0).max(5).default(5),
    customOrder: z.array(AccountType).default([]),
    inheritedIraSchedule: z
      .object({ traditional: InheritedSchedule.default('even'), roth: InheritedSchedule.default('back_loaded') })
      .prefault({}),
    rothConversions: z
      .object({
        enabled: z.boolean().default(false),
        upToBracket: Bracket.default(0.22),
        irmaaCapTier: z.int().min(0).max(5).default(5),
        startYear: z.int().optional(),
        until: z.union([z.enum(['claim', 'rmd']), z.int()]).default('claim'),
      })
      .prefault({}),
  })
  .prefault({})

export const TrustFund = z
  .object({
    preset: z.enum(['none', 'trustees_2026_oasi', 'trustees_2026_oasdi', 'custom']).default('trustees_2026_oasi'),
    steps: z.array(z.object({ effective: YearMonth, payablePercent: z.number().min(0).max(100) })).default([]),
  })
  .prefault({})

export const Assumptions = z
  .object({
    inflation: z
      .object({
        mean: z.number().finite().min(-0.05).max(0.2).default(0.025),
        sd: z.number().finite().min(0).max(0.2).default(0.012),
        phi: z.number().finite().min(0).max(0.99).default(0.6),
      })
      .prefault({}),
    returns: z
      .object({
        model: z.enum(['parametric', 'bootstrap', 'deterministic']).default('parametric'),
        crossAccountCorrelation: z.number().min(-1).max(1).default(0.85),
        inflationCorrelation: z.number().min(-1).max(1).default(-0.1),
        realReturnShift: z.number().finite().min(-0.1).max(0.1).default(0),
        volatilityMultiplier: z.number().finite().min(0).max(3).default(1),
        blockLength: z.int().min(1).max(20).default(5),
      })
      .prefault({}),
    mortality: z
      .object({
        mode: z.enum(['stochastic', 'fixed']).default('stochastic'),
        deathAge: z.object({ primary: z.number().default(90), spouse: z.number().default(92) }).prefault({}),
        ageOffset: z.object({ primary: z.number().default(0), spouse: z.number().default(0) }).prefault({}),
      })
      .prefault({}),
    heirTaxRate: Fraction.default(0.22),
    realWageGrowth: z.number().finite().min(-0.05).max(0.05).default(0.011),
    /** Scale on nondiscretionary expenses (expenses.items); healthcare and home costs are not scaled. */
    expenseScale: z.number().finite().min(0).max(3).default(1),
    /** Scale on discretionary expenses (expenses.discretionary). */
    discretionaryScale: z.number().finite().min(0).max(3).default(1),
    inheritancesEnabled: z.boolean().default(true),
    inheritanceScale: z.number().finite().min(0).max(3).default(1),
  })
  .prefault({})

export const Simulation = z
  .object({
    paths: z.int().min(100).max(100_000).default(5000),
    seed: z.int().min(0).default(20270101),
    maxAge: z.int().min(85).max(120).default(100),
  })
  .prefault({})

export const Objective = z
  .object({
    metric: z.enum(['median_terminal_real_after_tax']).default('median_terminal_real_after_tax'),
    successFloor: Fraction.default(0.9),
    bequestFloor: Fraction.default(0.5),
    runnerUpTolerance: Fraction.default(0.02),
  })
  .prefault({})

export const ConsoleLever = z.object({
  path: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  label: z.string().optional(),
})

export const Scenario = z.object({
  id: z.string(),
  name: z.string(),
  trustFund: TrustFund,
  accounts: z.array(Account).default([]),
  home: Home.optional(),
  inheritances: z.array(Inheritance).default([]),
  income: z
    .object({ annuities: z.array(Annuity).default([]), streams: z.array(IncomeStream).default([]) })
    .prefault({}),
  expenses: z
    .object({
      survivorFraction: Fraction.default(0.75),
      bequestTarget: NonNegMoney.default(0),
      /** Nondiscretionary expenses (needs), scaled by assumptions.expenseScale. */
      items: z.array(ExpenseItem).default([]),
      /** Discretionary expenses (wants: travel, gifts, hobbies), scaled by assumptions.discretionaryScale. */
      discretionary: z.array(ExpenseItem).default([]),
    })
    .prefault({}),
  healthcare: Healthcare,
  strategy: Strategy,
  assumptions: Assumptions,
  simulation: Simulation,
  objective: Objective,
  consoleLevers: z.array(ConsoleLever).default([]),
})

export const HouseholdFile = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  household: Household,
  scenarios: z.array(Scenario).min(1),
})

export type HouseholdFile = z.output<typeof HouseholdFile>
export type HouseholdFileInput = z.input<typeof HouseholdFile>
export type HouseholdT = z.output<typeof Household>
export type ScenarioT = z.output<typeof Scenario>
export type AccountT = z.output<typeof Account>
export type InheritanceT = z.output<typeof Inheritance>
export type ExpenseItemT = z.output<typeof ExpenseItem>
export type IncomeStreamT = z.output<typeof IncomeStream>
export type AnnuityT = z.output<typeof Annuity>
export type HomeT = z.output<typeof Home>
export type ReturnSpecT = z.output<typeof ReturnSpec>
export type IndexingT = z.output<typeof Indexing>
export type PersonT = z.output<typeof Person>
export type OwnerT = z.output<typeof OwnerJ>
export type AccountTypeT = z.output<typeof AccountType>
export type BracketT = z.output<typeof Bracket>
