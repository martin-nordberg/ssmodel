// Tooltips for every data-input label and grid column heading. Keys are the scenario- or household-relative data
// path where there is one (so promoted Console levers find their tip by path); grid columns use "<list>.<column>".
// Each tip is 5–40 words; esoteric fields get the longer ones (checked in test/app/tips.test.ts).

const scale = {
  nondiscretionary:
    'Scales every nondiscretionary expense: 110% means 10% more, 90% means 10% less. Healthcare and home costs are not scaled.',
  discretionary:
    'Scales every discretionary expense, such as travel and hobbies. 0% drops them entirely. Healthcare and home costs are not scaled.',
}

const returnPreset =
  'Expected yearly return and volatility: Conservative 4.5% / 7%, Moderate 6% / 11%, Aggressive 7.5% / 16%, Cash 3% / 1%. Nominal averages before fees.'
const fee =
  "Yearly fee as a share of the balance, such as a fund's expense ratio or an advisory fee. It is subtracted from each year's return."
const volatility = (what: string) =>
  `Year-to-year variability of ${what}, as a standard deviation. Zero gives steady growth at the mean rate; higher values give wider swings across paths.`
const costCut = (what: string) =>
  `How much lower the replacement home's ${what} is than the current home's, as a percentage. Used only after downsizing.`
const indexing =
  'How the amount grows each year: with inflation, with medical inflation, not at all (fixed dollars, like a loan payment), or at a fixed rate you enter.'

export const TIPS = {
  // ---------- household ----------
  'household.baseDate':
    "The month the model starts. Balances are as of this month, and today's dollars means dollars of this month. It can't be earlier than January 2027.",
  'household.state':
    'State whose income tax applies. Only South Carolina is modelled, including its retirement-income and age-65 deductions.',
  'household.name': "Name shown in headings and tables. It doesn't affect any calculation.",
  'household.birthDate':
    'Exact birth date. It sets full retirement age, the claiming window, Medicare at 65, the RMD age and the life-table odds of dying each year.',
  'household.sex': 'Picks the male or female SSA life table for the chance of dying each year. It has no other effect.',
  'household.priorMagi':
    "Modified AGI (AGI plus tax-exempt interest) from that year's tax return. Medicare's IRMAA surcharges use income from two years earlier, so the first two model years need these actual figures.",

  // ---------- Social Security ----------
  'ss.spouse.currentMonthly':
    "The Spouse's monthly benefit today on their own record, before any Medicare premium is withheld, including cost-of-living raises so far. With the start month it gives their PIA.",
  'ss.spouse.claimedDate':
    "Month the Spouse's own benefit began. With the birth date it gives the early-claiming reduction, which the model reverses to find the full-retirement-age benefit (PIA).",
  'trustFund.preset':
    "How benefits are cut if the Social Security trust fund runs out. Trustees presets use the 2026 report's projected cut; Custom uses your steps; No cut assumes full benefits.",
  'trustFund.steps.effective':
    'Month this payable percentage takes effect. It applies to all benefits until the next step.',
  'trustFund.steps.payablePercent':
    'Share of scheduled benefits actually paid from this month on: 78 means a 22% cut. Enter 100 to restore full benefits.',

  // ---------- earnings ----------
  'ss.primary.fraEstimateMonthly':
    'The monthly benefit at full retirement age shown on your my Social Security statement. Used only to cross-check the PIA computed from your earnings record, not in projections.',
  'ss.primary.estimateAsOf':
    "Month of the statement showing that estimate. The statement quotes dollars of its own year, so the cross-check adds the cost-of-living raises through then. Blank assumes last year's statement.",
  'earningsRecord.year': 'Calendar year, as listed on your Social Security statement.',
  'earningsRecord.amount':
    "Earnings taxed for Social Security that year, from the statement's Taxed Social Security Earnings column. They are wage-indexed, and the highest 35 years set the PIA.",
  'earnings.year': 'A future calendar year in which this person expects to work.',
  'earnings.wages':
    "Expected W-2 wages that year, in that year's dollars. They add to the earnings record, are taxed, and can withhold benefits under the earnings test before full retirement age.",
  'earnings.selfEmployment':
    "Expected net self-employment profit that year, in that year's dollars. It counts like wages for benefits and the earnings test, and also pays self-employment tax.",

  // ---------- accounts ----------
  'accounts.type':
    'Kind of account. It decides how withdrawals are taxed, whether RMDs apply, and its place in the withdrawal order.',
  'accounts.label': 'Your name for the account, shown in tables, charts and explanations.',
  'accounts.owner':
    'Whose account it is. For IRAs and 401(k)s it sets the RMD age and who inherits at the first death. Taxable and cash accounts can be joint.',
  'accounts.balance': 'Value of the account on the base date.',
  'accounts.preset': returnPreset,
  'accounts.mean': 'Your own expected yearly return, nominal and before fees. Leave blank to use the preset.',
  'accounts.sd':
    'Your own volatility: the standard deviation of yearly returns. Leave blank to use the preset. Higher values mean wider swings across simulated paths.',
  'accounts.fee': fee,
  'accounts.basis':
    'What you paid for the holdings in the taxable account. Selling realizes a capital gain on the part above basis. Blank assumes basis equals balance (no gain).',
  'accounts.yield':
    'Dividends paid each year as a share of the balance. They are taxed every year as qualified dividends, whether or not you spend them.',
  'accounts.rate': 'Interest rate the cash account earns, taxed each year as ordinary income.',
  'accounts.target':
    'Months of spending to keep in cash as a reserve. Withdrawals refill it first; cash above the target is spent before other accounts.',
  'accounts.employer':
    "Check if this 401(k) is with the owner's current employer. Its RMDs are then deferred while the owner still has wages (the still-working exception).",
  'accounts.hsaFirst': 'When checked, the HSA pays medical costs tax-free before any other account is used.',
  'accounts.hsaContrib':
    "Yearly contribution until the owner turns 65 and joins Medicare. It is deductible from taxable income and comes out of cash flow, in today's dollars.",

  // ---------- inherited IRAs ----------
  'inheritedIras.label': 'Your name for the inherited account, shown in tables and charts.',
  'inheritedIras.flavor': 'Traditional (withdrawals are taxable income) or Roth (withdrawals are tax-free).',
  'inheritedIras.beneficiary': "Which of you inherited the account. Withdrawals count as that person's income.",
  'inheritedIras.balance': 'Value of the inherited account on the base date.',
  'inheritedIras.dob':
    "Original owner's birth date. With the death date it decides whether they had reached their RMD age, which makes annual RMDs required during the 10 years.",
  'inheritedIras.dod':
    "Original owner's date of death. The account must be empty by December 31 of the tenth year after it, and it decides whether annual RMDs apply.",
  'inheritedIras.class':
    'Designated beneficiaries must empty the account within 10 years. Eligible designated ones (a spouse, disabled, or not more than 10 years younger than the owner) can stretch withdrawals over their life expectancy.',
  'inheritedIras.schedule':
    'How withdrawals are spread before the deadline: Even shares, Back-loaded (required RMDs only, the rest at the end), or Bracket-aware (fill a low bracket yearly). Blank uses the Strategy default.',
  'inheritedIras.preset': returnPreset,
  'inheritedIras.fee': fee,

  // ---------- income ----------
  'annuities.label': 'Your name for the annuity, shown in tables and explanations.',
  'annuities.owner': 'Whose annuity it is. Payments drop to the survivor percentage after this person dies.',
  'annuities.monthly': "Monthly payment when payments start, in that year's dollars.",
  'annuities.start': 'Month the first payment arrives.',
  'annuities.cola':
    'Fixed yearly increase in the payment. Zero means a level payment that loses buying power to inflation.',
  'annuities.surv':
    "Share of the payment that continues to the surviving spouse after the owner's death. Zero for a single-life annuity.",
  'annuities.qual':
    'Check if bought with IRA or 401(k) money. Payments from a qualified annuity are fully taxable as ordinary income.',
  'annuities.excl':
    "For a non-qualified annuity, the tax-free share of each payment (the return of your investment), from the insurer's statement. Tax-free treatment stops once the investment is recovered.",
  'annuities.basis':
    'What you paid for a non-qualified annuity. Payments are partly tax-free, by the exclusion ratio, until this amount has been recovered.',
  'streams.label': 'Your name for the income, shown in tables and explanations.',
  'streams.owner': "Who receives it. A person's income stops at their death; joint income continues to the survivor.",
  'streams.annual': "Yearly amount in today's dollars, or in that year's dollars when indexing is None.",
  'streams.start': 'First month the income is received.',
  'streams.end': 'Last month the income is received. Blank means it continues for life.',
  'streams.indexing': indexing,
  'streams.tax': 'Ordinary: taxed as income, such as rent or part-time pay. Tax-free: not taxed at all.',

  // ---------- inheritances ----------
  'inheritances.label': 'Your name for the inheritance, shown in tables and explanations.',
  'inheritances.heir':
    'Which of you receives it. The "If heir has died" column decides what happens if that person dies first.',
  'inheritances.dob':
    'Birth date of the person you inherit from. It drives the life-table timing and the inherited-IRA rules.',
  'inheritances.sex': 'Sex of the person you inherit from. It picks the life table when timing is by mortality.',
  'inheritances.timing':
    'When it arrives: Mortality draws a date from the life table in each path, Fixed uses one date, Window picks a random month between two dates.',
  'inheritances.date': 'For Fixed timing, the month it arrives. For Window timing, the earliest month it could arrive.',
  'inheritances.to':
    'For Window timing, the latest month it could arrive. Each path picks a month evenly between the two dates.',
  'inheritances.offset':
    'Adjusts the life table for health: +3 uses the mortality of someone 3 years older (poorer health), −3 of someone 3 years younger (healthier). Mortality timing only.',
  'inheritances.trad':
    "Traditional IRA you expect to inherit, in today's dollars. It becomes an inherited IRA: withdrawals are taxable and it must be emptied within 10 years.",
  'inheritances.roth':
    "Roth IRA you expect to inherit, in today's dollars. It becomes an inherited Roth: withdrawals are tax-free, but it must still be emptied within 10 years.",
  'inheritances.non':
    "Brokerage, bank and other financial assets, in today's dollars. Added to your taxable account with a stepped-up basis. Enter real estate in the table below instead.",
  'inheritances.growth':
    "Yearly growth above inflation of the amounts until you receive them. Zero keeps today's buying power.",
  'inheritances.spend':
    "Amount the estate is expected to spend each year before you inherit, such as long-term care, in today's dollars. It reduces what is left.",
  'inheritances.prob': 'Chance you receive this inheritance at all. Each simulated path draws whether it happens.',
  'inheritances.pre': 'If the heir dies before it arrives: it passes to the surviving spouse, or it is lost.',
  'inheritances.class':
    'Rule for the inherited IRAs: Designated (emptied within 10 years) or Eligible designated (stretched over life expectancy, for example when not more than 10 years younger than the decedent).',
  'realEstate.label': 'Your name for the property, shown in tables.',
  'realEstate.value': "Market value of the property in today's dollars.",
  'realEstate.disp':
    'Sell on receipt: net proceeds go to the taxable account with little or no gain. Keep: it becomes property with appreciation, carrying costs, rent and an optional later sale.',
  'realEstate.mean': "Expected yearly growth in the property's value while you keep it.",
  'realEstate.sd': volatility("the property's value"),
  'realEstate.carry':
    "Yearly property tax, insurance and upkeep while you keep it, in today's dollars. Rises with inflation and is added to spending.",
  'realEstate.rent':
    "Yearly rent after expenses while you keep it, in today's dollars. Taxed as ordinary income; depreciation is ignored.",
  'realEstate.sale':
    'For a kept property: never sell, sell on a planned date, or sell as a backstop when savings fall below the floor.',
  'realEstate.date': 'Month of a planned sale.',
  'realEstate.floor': "For a backstop sale: sell when liquid savings fall below this amount, in today's dollars.",
  'realEstate.cost': 'Commissions and closing costs, as a share of the sale price.',

  // ---------- expenses ----------
  'expenses.survivorFraction':
    'Share of per-person expenses that continues after the first death. 75% means the survivor spends three-quarters of what the couple spent on those items.',
  'expenses.bequestTarget':
    "Amount you'd like to leave at the second death, after tax and in today's dollars. Above zero, the bequest floor also applies to the recommendation.",
  'expenseItems.label': 'Name for the expense, shown in tables and explanations.',
  'expenseItems.annual':
    "Yearly amount in today's dollars, or in that year's dollars when indexing is None. For a one-time expense, the total.",
  'expenseItems.start': 'First month the expense is paid.',
  'expenseItems.end': 'Last month the expense is paid. Blank means it continues for life.',
  'expenseItems.indexing': indexing,
  'expenseItems.rate': 'Yearly growth rate, used when indexing is Fixed rate.',
  'expenseItems.oneTime':
    'Check for a single payment in the start month, such as a car or a new roof, instead of a yearly amount.',
  'expenseItems.perPerson':
    "Check if the cost falls to the survivor spending fraction after the first death, like food or travel. Leave unchecked for costs that don't drop.",
  'expenseItems.deductible':
    'Medical costs above 7.5% of AGI and charitable gifts above 0.5% of AGI count toward itemized deductions. The model itemizes in years when that beats the standard deduction.',

  // ---------- healthcare ----------
  'healthcare.medicalInflationSpread':
    'How much faster medical costs rise than general inflation each year. Applies to premiums, out-of-pocket costs and expenses indexed to medical inflation.',
  'healthcare.pre65.cobraMonthly':
    "Monthly health-insurance premium before Medicare (COBRA or a marketplace plan), in today's dollars. Paid until this person turns 65.",
  'healthcare.pre65.start':
    'Month the premium starts, such as when employer coverage ends. Blank means from the base date.',
  'healthcare.pre65.outOfPocket':
    "Yearly deductibles, copays and other uncovered costs before Medicare, in today's dollars.",
  'healthcare.medicare.medigapAnnual':
    "Yearly Medigap or Medicare Advantage premium per person, in today's dollars. Part B and Part D premiums, including IRMAA, are added automatically.",
  'healthcare.medicare.outOfPocket':
    "Yearly uncovered medical, dental and vision costs per person on Medicare, in today's dollars.",

  // ---------- home ----------
  'home.owned':
    'Turn on to model your home: its value, mortgage, costs and an optional sale. Home equity counts toward ending wealth but not as spendable savings.',
  'home.value': "Current market value of the home, in today's dollars.",
  'home.basis':
    'What you paid for the home plus improvements. A sale is taxed on the gain above it, after excluding $500,000 ($250,000 single).',
  'home.appreciation.mean': "Expected yearly growth in the home's value.",
  'home.appreciation.sd': volatility("the home's value"),
  'home.mortgage.on':
    'Turn on if the home has a mortgage. It is paid until payoff or a sale; a replacement home is never financed.',
  'home.mortgage.balance': "Principal still owed, from a mortgage statement, after that month's payment.",
  'home.mortgage.asOf': 'Month of the statement the balance comes from. Payments are modelled from the next month.',
  'home.mortgage.rate': 'Fixed annual interest rate on the loan.',
  'home.mortgage.payment':
    'Monthly principal and interest you actually pay, without escrowed tax and insurance. Include any regular extra principal; the payoff month is calculated from it.',
  'home.costs.propertyTax':
    "Yearly property tax in today's dollars, rising with inflation. It also counts toward itemized deductions as state and local tax, subject to the cap.",
  'home.costs.insurance':
    "Yearly homeowners insurance in today's dollars, whether escrowed or paid directly. Rises with inflation.",
  'home.costs.maintenance':
    "Expected yearly upkeep and repairs in today's dollars, rising with inflation. A common rule of thumb is about 1% of the home's value.",
  'home.sale.mode':
    'Keep: never sold. Planned date: sold in a chosen month. Backstop: sold only if liquid savings fall below a floor.',
  'home.sale.date': 'Month the home is sold.',
  'home.sale.liquidFloor':
    "Backstop trigger: the home is sold when liquid savings fall below this amount, in today's dollars.",
  'home.sale.sellingCostPct': 'Agent commissions and closing costs, as a share of the sale price.',
  'home.sale.replacementCost':
    "Price of a smaller home bought with cash at the sale, in today's dollars. Zero means no replacement home is bought.",
  'home.replacementCostCuts.propertyTax': costCut('property tax'),
  'home.replacementCostCuts.insurance': costCut('insurance'),
  'home.replacementCostCuts.maintenance': costCut('maintenance'),

  // ---------- strategy ----------
  'strategy.withdrawal':
    'How spending is funded each year. Bracket-fill draws traditional IRAs up to the target bracket first; Conventional spends taxable before IRAs; Proportional draws pro rata; Custom follows your order.',
  'strategy.targetBracket':
    'For Bracket-fill: traditional IRA withdrawals are taken up to the top of this federal bracket before taxable or Roth money is used, to even out taxes over the years.',
  'strategy.irmaaCapTier':
    'For Bracket-fill: the highest Medicare IRMAA surcharge tier that IRA withdrawals may push income into. 0 keeps income under the first surcharge threshold.',
  'strategy.inheritedIraSchedule.traditional':
    'Default way to empty inherited traditional IRAs by the deadline: Even shares, Back-loaded (required RMDs, then the rest at the end), or Bracket-aware (fill a low bracket each year).',
  'strategy.inheritedIraSchedule.roth':
    'Default for inherited Roth IRAs. Back-loaded usually wins: withdrawals are tax-free, so leaving the money to grow until the deadline costs nothing.',
  'strategy.rothConversions.enabled':
    'Convert traditional IRA money to Roth in low-income years, paying tax now to shrink later RMDs and taxes. The tax is paid from cash and taxable savings.',
  'strategy.rothConversions.upToBracket':
    'Each year, conversions fill taxable income up to the top of this federal bracket.',
  'strategy.rothConversions.irmaaCapTier':
    'Highest Medicare IRMAA tier that conversions may push income into; 0 avoids any surcharge. IRMAA uses income from two years earlier.',
  'strategy.rothConversions.startYear': 'First year to convert. Blank means from the first model year.',
  'strategy.rothConversions.until':
    'When conversions stop: at the Social Security claim, at RMD age, or after a year you choose.',
  'strategy.rothConversions.untilYear': 'Last year in which conversions are made.',
  'objective.successFloor':
    'Minimum chance of never running out of liquid savings. Only claiming dates that meet it can be recommended.',
  'objective.bequestFloor':
    'Minimum chance of leaving at least the bequest target. Applies only when the bequest target is above zero.',
  'objective.runnerUpTolerance':
    "Claiming dates whose median ending wealth is within this percentage of the best are shown as runners-up, so a flat optimum isn't overstated.",

  // ---------- assumptions ----------
  'assumptions.inflation.mean':
    "Long-run average yearly inflation (CPI). It grows indexed expenses and Social Security COLAs, and converts results to today's dollars.",
  'assumptions.inflation.sd':
    'How much inflation varies from year to year across the simulations, as a standard deviation.',
  'assumptions.inflation.phi':
    "Persistence in the AR(1) inflation model: how much of this year's gap from the mean carries into next year. 0 means independent years; higher values give long high- or low-inflation spells.",
  'assumptions.realWageGrowth':
    "Growth of national average wages above inflation. It projects the wage index that sets the PIA formula's bend points and indexes future earnings.",
  'assumptions.returns.model':
    "Parametric draws random returns from each account's mean and volatility. Historical bootstrap replays blocks of actual US market years since 1928. Deterministic runs one path at the averages.",
  'assumptions.returns.crossAccountCorrelation':
    'How closely different accounts move together, from −1 to 1. High values like 0.85 mean they tend to rise and fall in the same years, as diversified portfolios do.',
  'assumptions.returns.inflationCorrelation':
    'Correlation between investment returns and inflation in the same year. Slightly negative, the default, means high-inflation years tend to have weaker returns.',
  'assumptions.returns.realReturnShift':
    "Adds the same amount to every investment account's expected return, for what-ifs like returns 1% lower. Cash accounts are not shifted.",
  'assumptions.returns.volatilityMultiplier':
    "Scales every account's volatility. 1.5 makes market swings 50% larger; 0 removes return randomness while inflation and lifespans stay random.",
  'assumptions.returns.blockLength':
    'For the historical bootstrap: how many consecutive historical years are replayed together. Longer blocks keep multi-year booms, crashes and inflation spells intact.',
  'assumptions.mortality.mode':
    "Stochastic draws each person's death from the SSA life table in every path. Fixed uses the death ages you enter in every path.",
  'assumptions.mortality.deathAge': 'Age at death used in Fixed mode and on the deterministic path.',
  'assumptions.mortality.ageOffset':
    'Adjusts the life table for health: +3 uses the mortality of someone 3 years older (poorer health), −3 of someone 3 years younger (better health).',
  'assumptions.heirTaxRate':
    'Tax rate heirs are assumed to pay on inherited traditional IRAs. Ending wealth counts those balances after this tax, so pre-tax and Roth dollars compare fairly.',
  'assumptions.expenseScale': scale.nondiscretionary,
  'assumptions.discretionaryScale': scale.discretionary,
  'simulation.paths':
    'Number of simulated futures for each claiming date. More paths give steadier results but run slower; 5,000 is usually enough.',
  'simulation.seed':
    "Starting number for the random draws. The same seed reproduces the same results; change it to check a result isn't a fluke.",
  'simulation.maxAge':
    'The simulation ends when the younger spouse would reach this age, even if they are still alive.',

  // ---------- Console levers without a Setup path of their own ----------
  'lever.claim':
    "Claiming month to inspect in the charts and detail strip. The tick marks the recommended date; moving this doesn't change the recommendation.",
  'lever.trustFundPercent':
    "Share of scheduled benefits paid once the trust fund cut starts. Moving it replaces the scenario's trust-fund setting with a one-step custom cut.",
  'lever.trustFundYear':
    "Year the trust fund cut starts. Moving it replaces the scenario's trust-fund setting with a one-step custom cut.",
  'lever.roth': 'Roth conversions off, or on up to the top of the 12%, 22% or 24% federal bracket each year.',
  'lever.inheritancesEnabled': 'Include or exclude every inheritance, to see how much the plan depends on them.',
  'lever.inheritanceScale':
    'Scales every inheritance amount, including real estate. 50% halves them; 0% is like excluding them.',

  // ---------- view selectors ----------
  'view.resultsClaim':
    "Claiming month whose year-by-year results are shown. It starts at the recommended date; choosing another doesn't change the recommendation.",
  'view.realEstateFor':
    'Which inheritance the real estate table below belongs to. Each property arrives with that inheritance.',

  // ---------- New household dialog ----------
  'new.primaryBirth':
    'Exact birth date of the person whose claiming date is being decided. It sets full retirement age and the claiming window.',
  'new.spouseBirth': 'Exact birth date of the Spouse, who is already collecting Social Security.',
  'new.spouseMonthly':
    "The Spouse's current monthly Social Security benefit on their own record, before any Medicare premium is withheld.",
  'new.spouseClaimed':
    "Month the Spouse's benefit started. With the birth date, it gives their full-retirement-age benefit (PIA).",
} as const

export type TipKey = keyof typeof TIPS

/** Tip for a promoted Console lever's scenario path, if there is one. */
export const tipForPath = (path: string): string | undefined => (TIPS as Record<string, string>)[path]
