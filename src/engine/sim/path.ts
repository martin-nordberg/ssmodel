// One simulated path for one claiming date [FR-SIM-1..4]. Annual steps with monthly precision for benefits,
// earnings test, deaths and dated items. Order within a year follows FR-SIM-3.
import { inheritedRules, inheritedScheduled } from '../accounts/inheritedIra.ts'
import { mortgageBalance, mortgageInterestInYear, mortgagePaymentsInYear } from '../accounts/mortgage.ts'
import { sellProperty } from '../accounts/property.ts'
import { lifetimeRmd, rmdStartYear } from '../accounts/rmd.ts'
import { addToTaxable, sellTaxable } from '../accounts/taxable.ts'
import { annuityForYear } from '../cashflow/annuities.ts'
import { earningsForYear, expenseForYear, incomeForYear } from '../cashflow/expenses.ts'
import { type HealthcareCost, healthcareCost } from '../cashflow/healthcare.ts'
import { formatYM, type YM, ym, ymYear } from '../core/dates.ts'
import type { Amount, TraceData, YearTrace } from '../explain/trace.ts'
import type { EngineAccount, Prepared } from '../model/prepare.ts'
import { type FilingStatus, federalRules, medicareRules, scRules, ssaRules } from '../rules/tables.ts'
import { earningsTest } from '../ss/earningsTest.ts'
import { monthlyBenefit, ownBenefitFactor } from '../ss/ownBenefit.ts'
import { truncDime } from '../ss/pia.ts'
import { spousalExcess, survivorBenefit } from '../ss/spouse.ts'
import { bracketTop, type FederalTaxInput, federalEvaluator, type federalTax } from '../tax/federal.ts'
import { irmaaTier } from '../tax/irmaa.ts'
import { deductibleInterestShare, type ItemizedInput } from '../tax/itemized.ts'
import { scEvaluator, type scTax } from '../tax/sc.ts'
import { type FundingSources, fundConversionTax, fundingCapacity } from '../withdraw/conversionFunding.ts'
import {
  ordinaryRoom,
  type SolverAccount,
  type Strategy,
  solveWithdrawals,
  type TaxDelta,
  type TaxOutcome,
  taxDelta,
} from '../withdraw/solver.ts'
import { grownAmount, type InheritanceDraw } from './inheritance.ts'

export type PathDraws = {
  /** Inflation for each simulated year (index = year - baseYear). */
  inflation: Float64Array
  /** Nominal return per account per year, before fees. */
  returns: Float64Array[]
  /** Last month each person is alive: [primary, spouse]. */
  deathMonth: [YM, YM]
  /** Arrival month and receipt of each inheritance [FR-INH-3]. */
  inheritances?: InheritanceDraw[]
  /** Nominal appreciation per property per year [FR-ACC-7]. */
  propertyReturns?: Float64Array[]
}

export type YearRow = {
  year: number
  ages: [number, number]
  alive: [boolean, boolean]
  status: FilingStatus
  price: number
  ss: [number, number]
  earnings: number
  otherIncome: number
  investmentIncome: number
  rmd: number
  inheritedDistributions: number
  required: number[]
  withdrawals: number[]
  expenses: number
  healthcare: number
  irmaa: number
  hsaMedical: number
  agi: number
  magi: number
  taxableIncome: number
  /** Federal deduction used (standard or itemized, plus the senior deduction) [FR-TAX-6]. */
  deduction: number
  itemizing: boolean
  federalTax: number
  scTax: number
  payrollTax: number
  totalTax: number
  shortfall: number
  surplus: number
  endBalances: number[]
  liquid: number
  monthsWithheld: number
  /** Inheritances received (nominal) [FR-INH-5]. */
  inheritances?: number
  /** Roth conversions [FR-WD-4]. */
  conversions?: number
  /** Home and kept real estate, net of selling costs and the mortgage balance. */
  homeEquity?: number
  /** Mortgage payments and carrying costs of the home and kept real estate (included in expenses). */
  housing?: number
}

export type PathSummary = {
  claim: YM
  lastYear: number
  deathMonth: [YM, YM]
  depletedYear: number | null
  totalShortfallReal: number
  minLiquidReal: number
  terminalNominal: number
  terminalRealAfterTax: number
  lifetimeSsReal: number
  pvSsReal: number
  lifetimeTaxReal: number
  irmaaReal: number
  bequestMet: boolean
}

export type PathResult = { summary: PathSummary; rows: YearRow[] | null }

/** Values that depend only on the path (prices, deaths), shared across claiming candidates. */
export type PathCache = {
  expenses: Float64Array
  otherOrdinary: Float64Array
  otherTaxFree: Float64Array
}

export function newPathCache(years: number): PathCache {
  return {
    expenses: new Float64Array(years).fill(Number.NaN),
    otherOrdinary: new Float64Array(years).fill(Number.NaN),
    otherTaxFree: new Float64Array(years).fill(Number.NaN),
  }
}

export type RunOptions = {
  recordRows: boolean
  cache?: PathCache
  /** Capture one year's inputs and intermediate results for "explain a number" [FR-UI-14]. */
  trace?: YearTrace
}

const REAL_DISCOUNT = 0.02

function cloneAccounts(a: EngineAccount[]): EngineAccount[] {
  return a.map((x) => ({ ...x }))
}

export function runPath(prep: Prepared, claim: YM, draws: PathDraws, opts: RunOptions): PathResult {
  const sc = prep.scenario
  const asm = sc.assumptions
  const [P, S] = prep.people
  const ageP = P.age
  const ageS = S.age
  const accounts = cloneAccounts(prep.accounts)
  const nAcc = accounts.length
  const rows: YearRow[] | null = opts.recordRows ? [] : null
  const magiHistory = new Map<number, number>(prep.priorMagi)
  const [deathP, deathS] = draws.deathMonth
  const firstDeath = Math.min(deathP, deathS)
  const meanInfl = asm.inflation.mean
  const spread = sc.healthcare.medicalInflationSpread
  const startBal = new Float64Array(nAcc)

  const inflAt = (y: number) => {
    const i = y - prep.baseYear
    return i >= 0 && i < draws.inflation.length ? draws.inflation[i]! : meanInfl
  }
  const colaFn = (payYear: number) => ssaRules.cola(payYear) ?? Math.max(0, inflAt(payYear - 1))
  const cache = opts.cache
  const monthlyP = new Float64Array(12)
  const monthlyS = new Float64Array(12)
  const excessS = new Float64Array(12)
  const required = new Float64Array(nAcc)
  const eligYear = prep.primaryPia.eligibilityYear
  let lastPia = 0
  let lastPiaBase = Number.NaN
  let lastPiaYear = Number.NaN

  let price = 1
  let colaIndex = 1 // COLAs payable after the base year
  let withheldP = 0
  let depletedYear: number | null = null
  let totalShortfallReal = 0
  let minLiquidReal = Number.POSITIVE_INFINITY
  let lifetimeSsReal = 0
  let pvSsReal = 0
  let lifetimeTaxReal = 0
  let irmaaReal = 0
  let lastYear = prep.baseYear
  const fraYearP = ymYear(ageP.fraMonth)
  const fraYearS = ymYear(ageS.fraMonth)

  // Property state (home and inherited real estate).
  const props = prep.properties
  const propValue = new Float64Array(props.length)
  const propBasis = new Float64Array(props.length)
  const owned = new Uint8Array(props.length)
  for (const [k, pr] of props.entries()) {
    if (pr.inheritance === null && pr.value > 0) {
      owned[k] = 1
      propValue[k] = pr.value
      propBasis[k] = pr.basis
    }
  }
  const annuityRecovered = new Float64Array(prep.annuities.length)
  const soldOnce = new Set<number>()
  // Mortgage paid off at a sale (no new mortgage on a replacement home).
  const loanClosed = new Uint8Array(props.length)
  const deductibleExpenses = prep.expenses.filter((e) => e.deductible)
  const loanBalance = (k: number, m: YM): number => {
    const mg = props[k]!.mortgage
    return mg && !loanClosed[k] ? mortgageBalance(mg, m) : 0
  }

  for (let y = prep.baseYear; y <= prep.endYear; y++) {
    const m0 = ym(y, 1)
    const m11 = ym(y, 12)
    if (deathP < m0 && deathS < m0) break
    lastYear = y
    const yi = y - prep.baseYear
    // Trace capture for one year (explain a number); null in every other year and in Monte Carlo runs.
    const td: Partial<TraceData> | null = opts.trace?.year === y ? { year: y, price, status: 'mfj' } : null
    if (y > prep.baseYear) colaIndex *= 1 + colaFn(y)
    const status: FilingStatus = deathP >= m0 && deathS >= m0 ? 'mfj' : 'single'
    const medical = price * (1 + spread) ** yi
    const fedFactor = price * (1 + meanInfl) ** (prep.baseYear - federalRules.latestYear)
    const medFactor = price * (1 + meanInfl) ** (prep.baseYear - medicareRules.latestYear)
    const medPremiumFactor = medical * (1 + meanInfl + spread) ** (prep.baseYear - medicareRules.latestYear)
    const medicare = medicareRules.params(y, medFactor, medPremiumFactor).value
    const fedParams = federalRules.params(y, fedFactor).value
    for (let i = 0; i < nAcc; i++) startBal[i] = accounts[i]!.balance

    // ---- property sales at the start of the year [FR-ACC-7] ----
    let realizedGain = 0
    let saleShortfall = 0
    let liquidStart = 0
    for (let i = 0; i < nAcc; i++) liquidStart += startBal[i]!
    for (const [k, pr] of props.entries()) {
      if (!owned[k] || soldOnce.has(k)) continue
      const planned = pr.sale.mode === 'planned' && pr.sale.month !== null && ymYear(pr.sale.month) <= y
      const backstop = pr.sale.mode === 'backstop' && liquidStart < pr.sale.floor * price
      if (!planned && !backstop) continue
      const r = sellProperty(
        pr,
        propValue[k]!,
        propBasis[k]!,
        pr.sale.replacement * price,
        status,
        loanBalance(k, m0 - 1),
      )
      loanClosed[k] = 1
      realizedGain += r.gain
      const taxable = accounts.find((x) => x.kind === 'taxable')
      if (r.netProceeds > 0 && taxable) addToTaxable(taxable, r.netProceeds)
      else if (r.netProceeds < 0) saleShortfall -= r.netProceeds
      propValue[k] = r.newValue
      propBasis[k] = r.newBasis
      owned[k] = r.stillOwned ? 1 : 0
      // A downsized home is not resold.
      if (r.stillOwned) soldOnce.add(k)
    }

    // ---- inheritances received this year (a mid-year inflow) [FR-INH-1..4] ----
    let inheritedThisYear = 0
    for (const h of prep.inheritances) {
      const d = draws.inheritances?.[h.index]
      if (!d?.received || ymYear(d.month) !== y) continue
      let heir = h.heir
      const heirDeath = heir === 0 ? deathP : deathS
      if (heirDeath < d.month) {
        const other = heir === 0 ? 1 : 0
        const otherDeath = other === 0 ? deathP : deathS
        if (h.ifHeirPredeceases !== 'surviving_spouse' || otherDeath < d.month) continue
        heir = other
      }
      const years = (d.month - prep.baseYM) / 12
      const parts = h.amounts
      const total = parts.traditionalIra + parts.rothIra + parts.nonIra
      const grown = total > 0 ? grownAmount(total, h.growth.realRate, h.growth.annualSpendDown, years) : 0
      const nominal = total > 0 ? (grown / total) * price : 0
      const deathDate = `${formatYM(d.month)}-15`
      for (const [flavor, amount, idx] of [
        ['traditional', parts.traditionalIra, h.accountIndex.traditional],
        ['roth', parts.rothIra, h.accountIndex.roth],
      ] as const) {
        if (amount <= 0) continue
        const acc = accounts[idx]!
        acc.owner = heir
        acc.balance += amount * nominal
        acc.inherited = {
          ...inheritedRules({
            flavor,
            decedentBirthDate: h.decedentBirthDate,
            decedentDeathDate: deathDate,
            beneficiaryBirthDate: prep.people[heir].birthDate,
            beneficiaryClass: h.beneficiaryClass,
          }),
          schedule: sc.strategy.inheritedIraSchedule[flavor],
        }
        inheritedThisYear += amount * nominal
      }
      if (parts.nonIra > 0) {
        const taxable = accounts.find((x) => x.kind === 'taxable')
        if (taxable) addToTaxable(taxable, parts.nonIra * nominal) // basis stepped up to value at death
        inheritedThisYear += parts.nonIra * nominal
      }
      // Inherited real estate: stepped-up basis; sold on receipt or kept [FR-INH-7].
      for (const [k, pr] of props.entries()) {
        if (pr.inheritance !== h.index || pr.value <= 0) continue
        const v = pr.value * price
        inheritedThisYear += v
        if (pr.sellOnReceipt) {
          const taxable = accounts.find((x) => x.kind === 'taxable')
          if (taxable) addToTaxable(taxable, v * (1 - pr.sale.costPct))
        } else {
          owned[k] = 1
          propValue[k] = v
          propBasis[k] = v
        }
      }
    }

    // ---- Social Security ----
    // PIA: earnings through y-1, COLAs from eligibility; updated incrementally while the base is unchanged.
    const piaBase = prep.primaryPia.basePia(y - 1)
    let piaP: number
    if (piaBase === lastPiaBase && lastPiaYear === y - 1 && y > eligYear) piaP = truncDime(lastPia * (1 + colaFn(y)))
    else piaP = prep.primaryPia.piaInYear(y, colaFn)
    lastPia = piaP
    lastPiaBase = piaBase
    lastPiaYear = y
    const piaS = prep.spouse.pia * colaIndex
    const ownSMonthly = Math.floor(prep.spouse.currentMonthly * colaIndex)
    const preFraFactor = ownBenefitFactor(claim, ageP)
    const excessMonthly = spousalExcess(piaP, piaS, claim, ageS)
    const primaryClaimedBeforeDeath = claim <= deathP
    const survivorOfP =
      deathP < m11 + 1
        ? survivorBenefit({
            deceasedPia: piaP,
            deceasedAge: ageP,
            deceasedClaim: primaryClaimedBeforeDeath ? claim : null,
            deceasedDeath: deathP,
            survivorAge: ageS,
            start: deathP + 1,
          })
        : 0
    const survivorOfS =
      deathS < m11 + 1
        ? survivorBenefit({
            deceasedPia: piaS,
            deceasedAge: ageS,
            deceasedClaim: prep.spouse.claimed,
            deceasedDeath: deathS,
            survivorAge: ageP,
            start: Math.max(deathS + 1, claim),
          })
        : 0
    monthlyP.fill(0)
    monthlyS.fill(0)
    excessS.fill(0)
    const postFraFactor = ownBenefitFactor(claim, ageP, withheldP)
    for (let k = 0; k < 12; k++) {
      const m = m0 + k
      const pAlive = m <= deathP
      const sAlive = m <= deathS
      if (pAlive && m >= claim) {
        const factor = m >= ageP.fraMonth ? postFraFactor : preFraFactor
        let amt = monthlyBenefit(piaP, factor)
        if (!sAlive) amt = Math.max(amt, Math.floor(survivorOfS))
        monthlyP[k] = amt
      }
      if (sAlive && m >= prep.spouse.claimed) {
        let amt = ownSMonthly
        if (pAlive && m >= claim) excessS[k] = Math.floor(excessMonthly)
        if (!pAlive) amt = Math.max(amt, Math.floor(survivorOfP))
        monthlyS[k] = amt
      }
    }

    // ---- earnings ----
    const eP = earningsForYear(P.earnings, y, deathP < m11 ? deathP : null)
    const eS = earningsForYear(S.earnings, y, deathS < m11 ? deathS : null)
    const seFactor = federalRules.payroll.seNetFactor
    const etLimits = ssaRules.earningsTest(
      y,
      price * (1 + meanInfl) ** (prep.baseYear - ssaRules.latestEarningsTestYear),
    ).value

    // Earnings test on the Primary's record (withholds his benefit and her spousal excess).
    let monthsWithheld = 0
    if (y <= fraYearP && eP.wages + eP.selfEmployment > 0) {
      const entitled: number[] = []
      for (let k = 0; k < 12; k++) if (monthlyP[k]! > 0 && m0 + k < ageP.fraMonth) entitled.push(k)
      if (entitled.length > 0) {
        const avg = entitled.reduce((s, k) => s + monthlyP[k]! + excessS[k]!, 0) / entitled.length
        const r = earningsTest({
          annualEarnings: eP.wages + eP.selfEmployment * seFactor,
          entitledMonthsBeforeFra: entitled.length,
          fraYear: y === fraYearP,
          monthsBeforeFra: Math.max(0, Math.min(12, ageP.fraMonth - m0)),
          limits: etLimits,
          monthlyOnRecord: avg,
        })
        for (let j = 0; j < r.monthsWithheld; j++) {
          const k = entitled[j]!
          monthlyP[k] = 0
          excessS[k] = 0
        }
        monthsWithheld = r.monthsWithheld
        withheldP += r.monthsWithheld
      }
    }
    // Earnings test on the Spouse's own benefit.
    if (y <= fraYearS && eS.wages + eS.selfEmployment > 0) {
      const entitled: number[] = []
      for (let k = 0; k < 12; k++) if (monthlyS[k]! > 0 && m0 + k < ageS.fraMonth) entitled.push(k)
      if (entitled.length > 0) {
        const avg = entitled.reduce((s, k) => s + monthlyS[k]!, 0) / entitled.length
        const r = earningsTest({
          annualEarnings: eS.wages + eS.selfEmployment * seFactor,
          entitledMonthsBeforeFra: entitled.length,
          fraYear: y === fraYearS,
          monthsBeforeFra: Math.max(0, Math.min(12, ageS.fraMonth - m0)),
          limits: etLimits,
          monthlyOnRecord: avg,
        })
        for (let j = 0; j < r.monthsWithheld; j++) monthlyS[entitled[j]!] = 0
      }
    }
    let ssP = 0
    let ssS = 0
    for (let k = 0; k < 12; k++) {
      const hc = prep.haircutByMonth[m0 + k - ym(prep.baseYear, 1)] ?? 1
      ssP += monthlyP[k]! * hc
      ssS += (monthlyS[k]! + excessS[k]!) * hc
    }
    if (td) {
      const haircut = Array.from({ length: 12 }, (_, k) => prep.haircutByMonth[m0 + k - ym(prep.baseYear, 1)] ?? 1)
      td.ss = {
        people: [
          { pia: piaP, monthly: Array.from(monthlyP), excess: new Array(12).fill(0), claim },
          { pia: piaS, monthly: Array.from(monthlyS), excess: Array.from(excessS), claim: prep.spouse.claimed },
        ],
        haircut,
        monthsWithheld,
        total: [ssP, ssS],
      }
      td.earnings = [eP, eS]
    }

    // ---- other income ----
    const ictx = { baseYear: prep.baseYear, price, medical }
    let otherOrdinary: number
    let otherTaxFree: number
    if (cache && !Number.isNaN(cache.otherOrdinary[yi]!)) {
      otherOrdinary = cache.otherOrdinary[yi]!
      otherTaxFree = cache.otherTaxFree[yi]!
    } else {
      otherOrdinary = 0
      otherTaxFree = 0
      for (const s of prep.incomes) {
        const ownerDeath = s.owner === 'primary' ? deathP : s.owner === 'spouse' ? deathS : null
        const amt = incomeForYear(s, y, ictx, ownerDeath !== null && ownerDeath <= m11 ? ownerDeath : null)
        if (s.tax === 'ordinary') otherOrdinary += amt
        else otherTaxFree += amt
      }
      for (const [i, an] of prep.annuities.entries()) {
        const ownerDeath = an.owner === 0 ? deathP : deathS
        const otherDeath = an.owner === 0 ? deathS : deathP
        const r = annuityForYear(an, y, ownerDeath, otherDeath, annuityRecovered[i]!)
        annuityRecovered[i] = r.recovered
        otherOrdinary += r.taxable
        otherTaxFree += r.taxFree
      }
      if (cache) {
        cache.otherOrdinary[yi] = otherOrdinary
        cache.otherTaxFree[yi] = otherTaxFree
      }
    }

    // ---- investment income (reinvested, taxed) ----
    let dividends = 0
    let interest = 0
    for (const a of accounts) {
      if (a.kind === 'taxable') dividends += a.balance * a.dividendYield
      else if (a.kind === 'cash') interest += a.balance * a.cashRate
    }

    // ---- required distributions ----
    required.fill(0)
    const retirementByPerson: [number, number] = [0, 0]
    const reqOrdinaryByPerson: [number, number] = [0, 0]
    let rmdTotal = 0
    let inheritedTotal = 0
    let reqCash = 0
    for (const a of accounts) {
      if (a.balance <= 0) continue
      let amt = 0
      if (a.kind === 'traditional') {
        const owner = prep.people[a.owner]
        const ownerWages = a.owner === 0 ? eP.wages : eS.wages
        if (!(a.currentEmployer && ownerWages > 0)) amt = lifetimeRmd(owner.birthYear, y, a.balance)
        rmdTotal += amt
      } else if (a.inherited) {
        amt = Math.min(a.balance, inheritedScheduled(a.inherited, a.inherited.schedule, y, a.balance))
        inheritedTotal += amt
      }
      if (amt <= 0) continue
      a.balance -= amt
      required[a.index] = amt
      reqCash += amt
      if (a.kind === 'traditional' || a.kind === 'inherited_traditional') {
        reqOrdinaryByPerson[a.owner] += amt
        retirementByPerson[a.owner] += amt
      }
    }

    // ---- healthcare ----
    const magiLookback = magiHistory.get(y - 2) ?? 0
    const tier = irmaaTier(magiLookback, status, medicare)
    let healthTotal = 0
    const traceHealth: [HealthcareCost | null, HealthcareCost | null] | null = td ? [null, null] : null
    let irmaaTotal = 0
    let hsaQualified = 0
    for (const [idx, person] of [P, S].entries()) {
      const death = idx === 0 ? deathP : deathS
      const alive = Math.max(0, Math.min(12, death - m0 + 1))
      if (alive === 0) continue
      const medStart = person.age.medicareMonth
      const lastAlive = m0 + alive - 1
      const pre65 = Math.max(0, Math.min(lastAlive, medStart - 1) - m0 + 1)
      const cobra = Math.max(0, Math.min(lastAlive, medStart - 1) - Math.max(m0, person.pre65.cobraStart) + 1)
      const hc = healthcareCost({
        cobraMonths: cobra,
        pre65Months: pre65,
        medicareMonths: alive - pre65,
        irmaaTier: tier,
        medicare,
        medicalFactor: medical,
        pre65: { cobraMonthly: person.pre65.cobraMonthly, outOfPocket: person.pre65.outOfPocket },
        medicareCosts: sc.healthcare.medicare,
      })
      healthTotal += hc.total
      if (traceHealth) traceHealth[idx] = hc
      irmaaTotal += hc.irmaaSurcharge
      hsaQualified += hc.hsaQualified
    }
    let hsaMedical = 0
    for (const a of accounts) {
      if (a.kind !== 'hsa' || !a.hsaPayMedicalFirst || hsaQualified <= hsaMedical) continue
      const take = Math.min(a.balance, hsaQualified - hsaMedical)
      a.balance -= take
      required[a.index] = required[a.index]! + take
      hsaMedical += take
    }

    // ---- expenses ----
    const survivorFrom = firstDeath <= m11 ? firstDeath + 1 : null
    const ectx = {
      ...ictx,
      survivorFrom,
      survivorFraction: sc.expenses.survivorFraction,
      scale: asm.expenseScale,
      discretionaryScale: asm.discretionaryScale,
    }
    let expenses: number
    if (cache && !Number.isNaN(cache.expenses[yi]!)) expenses = cache.expenses[yi]!
    else {
      expenses = 0
      for (const item of prep.expenses) expenses += expenseForYear(item, y, ectx)
      if (cache) cache.expenses[yi] = expenses
    }
    // Housing while owned: mortgage principal and interest (nominal, level) and carrying costs; rent received.
    // Property tax and mortgage interest are also itemizable [FR-TAX-6].
    let propertyIncome = 0
    let housing = 0
    const itemizable: ItemizedInput = { propertyTax: 0, mortgageInterest: 0, medical: 0, charity: 0 }
    for (const [k, pr] of props.entries()) {
      if (!owned[k]) continue
      const downsized = soldOnce.has(k)
      housing += (downsized ? pr.carryingReplacement : pr.carrying) * price
      itemizable.propertyTax += (downsized ? pr.propertyTaxReplacement : pr.propertyTax) * price
      if (pr.mortgage && !loanClosed[k]) {
        housing += pr.mortgage.payment * mortgagePaymentsInYear(pr.mortgage, y, prep.baseYM)
        itemizable.mortgageInterest +=
          mortgageInterestInYear(pr.mortgage, y, prep.baseYM) *
          deductibleInterestShare(mortgageBalance(pr.mortgage, m0 - 1))
      }
      propertyIncome += pr.rent * price
    }
    for (const item of deductibleExpenses) {
      const amt = expenseForYear(item, y, ectx)
      if (item.deductible === 'charity') itemizable.charity += amt
      else itemizable.medical += amt
    }
    expenses += housing + saleShortfall
    // HSA contributions before Medicare: deductible, paid from cash flow, deposited to the HSA [FR-ACC-6].
    let hsaContrib = 0
    const hsaDeposits: [EngineAccount, number][] = []
    for (const a of accounts) {
      if (a.kind !== 'hsa' || a.hsaContribution <= 0) continue
      const person = prep.people[a.owner]
      const death = a.owner === 0 ? deathP : deathS
      const lastMonth = Math.min(death, person.age.medicareMonth - 1, m11)
      const months = Math.max(0, lastMonth - m0 + 1)
      if (months === 0) continue
      const amt = (a.hsaContribution * price * months) / 12
      hsaContrib += amt
      hsaDeposits.push([a, amt])
    }
    expenses += hsaContrib
    const spending = expenses + healthTotal - hsaMedical
    // Medical costs paid out of pocket (the HSA's share is not deductible).
    itemizable.medical += healthTotal - hsaMedical

    // ---- tax function ----
    const count65 = (deathP >= m0 && y - P.birthYear >= 65 ? 1 : 0) + (deathS >= m0 && y - S.birthYear >= 65 ? 1 : 0)
    const is65: [boolean, boolean] = [y - P.birthYear >= 65, y - S.birthYear >= 65]
    const tmax = prep.taxableMaxByYear[yi]!
    const scFactor = price * (1 + meanInfl) ** (prep.baseYear - scRules.latestYear)
    const scParams = scRules.params(y, scFactor).value
    const fedInputBase: FederalTaxInput = {
      year: y,
      status,
      priceFactor: fedFactor,
      count65,
      taxableMax: tmax,
      wagesByPerson: [eP.wages, eS.wages],
      seByPerson: [eP.selfEmployment, eS.selfEmployment],
      ordinary: reqOrdinaryByPerson[0] + reqOrdinaryByPerson[1] + otherOrdinary - hsaContrib,
      investmentOrdinary: interest + propertyIncome,
      qualifiedDividends: dividends,
      ltcg: realizedGain,
      taxExemptInterest: 0,
      socialSecurity: ssP + ssS,
    }
    const fedEval = federalEvaluator(
      {
        ...fedInputBase,
        itemized: itemizable,
        // SC tax (computed from federal AGI) is itemizable as SALT; `curDelta` is the delta being evaluated.
        stateIncomeTax: (agi, tss) => {
          retScratch[0] = retirementByPerson[0] + curDelta.ordinaryByPerson[0]
          retScratch[1] = retirementByPerson[1] + curDelta.ordinaryByPerson[1]
          return scEval(agi, tss, curDelta.ltcg + realizedGain, retScratch, scScratch).tax
        },
      },
      fedParams,
    )
    const scEval = scEvaluator(status, is65, scParams)
    const fedScratch = {} as ReturnType<typeof federalTax>
    const scScratch = {} as ReturnType<typeof scTax>
    const retScratch: [number, number] = [0, 0]
    let curDelta: TaxDelta = { ordinaryByPerson: [0, 0], ltcg: 0, penalty: 0 }
    const outScratch: TaxOutcome = { total: 0, ordinaryTaxable: 0, magi: 0 }
    // Solver calls reuse scratch objects; the recorded row uses a fresh evaluation below.
    const tax = (d: TaxDelta): TaxOutcome => {
      curDelta = d
      const fed = fedEval(d.ordinaryByPerson[0] + d.ordinaryByPerson[1], d.ltcg, fedScratch)
      outScratch.total = fed.total + fed.stateTax + d.penalty
      outScratch.ordinaryTaxable = fed.ordinaryTaxable
      outScratch.magi = fed.magi
      return outScratch
    }

    // ---- strategy ----
    const st = sc.strategy
    let strategy: Strategy
    if (st.withdrawal === 'bracket_fill') {
      const nearMedicare = [P, S].some((p, i) => (i === 0 ? deathP : deathS) >= m0 && y - p.birthYear >= 63)
      const capTier = st.irmaaCapTier
      const magiCap = nearMedicare && capTier < 5 ? medicare.thresholds[status][capTier]! : Number.POSITIVE_INFINITY
      strategy = { kind: 'bracket_fill', bracketTop: bracketTop(st.targetBracket, fedParams.brackets[status]), magiCap }
    } else if (st.withdrawal === 'custom') {
      strategy = { kind: 'custom', order: st.customOrder }
    } else {
      strategy = { kind: st.withdrawal }
    }

    const solverAccounts: SolverAccount[] = accounts.map((a) => ({
      kind: a.kind,
      owner: a.owner,
      available: Math.max(0, a.balance),
      gainFrac: a.kind === 'taxable' && a.balance > 0 ? Math.max(0, 1 - a.basis / a.balance) : 0,
      reserve: a.kind === 'cash' ? (a.cashTargetMonths * spending) / 12 : 0,
      penaltyRate: a.kind === 'hsa' && (a.owner === 0 ? y - P.birthYear : y - S.birthYear) < 65 ? 0.2 : 0,
    }))
    const inflows =
      ssP +
      ssS +
      eP.wages +
      eP.selfEmployment +
      eS.wages +
      eS.selfEmployment +
      otherOrdinary +
      otherTaxFree +
      propertyIncome +
      reqCash
    const solved = solveWithdrawals({ accounts: solverAccounts, strategy, inflows, spending, tax })
    if (td) {
      td.status = status
      td.accounts = accounts.map((a) => ({ label: a.label, kind: a.kind }))
      td.otherOrdinary = otherOrdinary
      td.otherTaxFree = otherTaxFree
      td.dividends = dividends
      td.interest = interest
      td.propertyIncome = propertyIncome
      td.inheritances = inheritedThisYear
      td.required = Array.from(required)
      td.rmd = rmdTotal
      td.inheritedDistributions = inheritedTotal
      td.expenses = {
        items: prep.expenses
          .map((item) => ({
            label: item.discretionary ? `${item.label} (discretionary)` : item.label,
            amount: expenseForYear(item, y, ectx),
          }))
          .filter((x) => x.amount !== 0),
        housing: props.flatMap((pr, k) => {
          if (!owned[k]) return []
          const out: Amount[] = []
          const carrying = (soldOnce.has(k) ? pr.carryingReplacement : pr.carrying) * price
          if (carrying > 0) out.push({ label: `${pr.label}: carrying costs`, amount: carrying })
          if (pr.mortgage && !loanClosed[k]) {
            const pay = pr.mortgage.payment * mortgagePaymentsInYear(pr.mortgage, y, prep.baseYM)
            if (pay > 0) out.push({ label: `${pr.label}: mortgage principal + interest`, amount: pay })
          }
          return out
        }),
        hsaContributions: hsaContrib,
        saleShortfall,
        total: expenses,
      }
      td.health = {
        people: traceHealth!,
        irmaaTier: tier,
        lookbackYear: y - 2,
        lookbackMagi: magiLookback,
        hsaMedical,
        total: healthTotal,
      }
      td.spending = spending
      td.inflows = [
        { label: 'Social Security', amount: ssP + ssS },
        { label: 'Wages and self-employment', amount: eP.wages + eP.selfEmployment + eS.wages + eS.selfEmployment },
        { label: 'Other income and annuities', amount: otherOrdinary + otherTaxFree },
        { label: 'Rent', amount: propertyIncome },
        { label: 'Required distributions (RMDs, inherited IRAs)', amount: reqCash },
      ].filter((x) => x.amount !== 0)
      td.solver = {
        withdrawals: Array.from(solved.withdrawals),
        surplus: solved.surplus,
        shortfall: solved.shortfall,
        tax: solved.tax.total,
        strategy: st.withdrawal,
      }
      td.bracketAware = []
      td.conversions = []
    }

    // ---- apply withdrawals and surplus ----
    for (let i = 0; i < nAcc; i++) {
      const w = solved.withdrawals[i]!
      if (w <= 0) continue
      const a = accounts[i]!
      if (a.kind === 'taxable') sellTaxable(a, w)
      else a.balance -= w
    }
    if (solved.surplus > 0) {
      let left = solved.surplus
      const cash = accounts.find((a) => a.kind === 'cash')
      if (cash) {
        const target = (cash.cashTargetMonths * spending) / 12
        const add = Math.min(left, Math.max(0, target - cash.balance))
        cash.balance += add
        left -= add
      }
      const taxable = accounts.find((a) => a.kind === 'taxable')
      if (taxable) addToTaxable(taxable, left)
      else if (cash) cash.balance += left
    }
    if (solved.shortfall > 1 && depletedYear === null) depletedYear = y
    totalShortfallReal += solved.shortfall / price
    // ---- bracket-aware inherited withdrawals and Roth conversions [FR-WD-2, FR-WD-4] ----
    const finalDelta = taxDelta(solverAccounts, solved.withdrawals)
    const withdrawalsRow = solved.withdrawals.slice()
    let extraTax = 0
    let extraSurplus = 0
    let conversions = 0
    const nearMed = [P, S].some((p, i) => (i === 0 ? deathP : deathS) >= m0 && y - p.birthYear >= 63)
    const capFor = (tier: number) =>
      nearMed && tier < 5 ? medicare.thresholds[status][tier]! : Number.POSITIVE_INFINITY
    const taxableAcc = accounts.find((x) => x.kind === 'taxable')
    const cashAcc = accounts.find((x) => x.kind === 'cash')
    for (const a of accounts) {
      if (a.kind !== 'inherited_traditional' || a.inherited?.schedule !== 'bracket_aware' || a.balance <= 0) continue
      const top = bracketTop(st.targetBracket, fedParams.brackets[status])
      const before = tax(finalDelta).total
      const x = ordinaryRoom(tax, finalDelta, a.owner, top, capFor(st.irmaaCapTier), a.balance)
      if (x <= 1) continue
      finalDelta.ordinaryByPerson[a.owner] += x
      const dt = tax(finalDelta).total - before
      a.balance -= x
      withdrawalsRow[a.index] = withdrawalsRow[a.index]! + x
      extraTax += dt
      extraSurplus += x - dt
      td?.bracketAware?.push({ account: a.index, amount: x, tax: dt })
      if (taxableAcc) addToTaxable(taxableAcc, x - dt)
      else if (cashAcc) cashAcc.balance += x - dt
    }
    const rc = st.rothConversions
    const convEnd =
      rc.until === 'claim' ? ymYear(claim) - 1 : rc.until === 'rmd' ? rmdStartYear(P.birthDate) - 1 : rc.until
    if (rc.enabled && y >= (rc.startYear ?? prep.baseYear) && y <= convEnd) {
      for (const owner of [0, 1] as const) {
        if ((owner === 0 ? deathP : deathS) < m0) continue
        const trads = accounts.filter((x) => x.kind === 'traditional' && x.owner === owner && x.balance > 0)
        const roth = accounts.find((x) => x.kind === 'roth' && x.owner === owner)
        const available = trads.reduce((t, x) => t + x.balance, 0)
        if (!roth || available <= 0) continue
        const top = bracketTop(rc.upToBracket, fedParams.brackets[status])
        const before = tax(finalDelta).total
        let x = ordinaryRoom(tax, finalDelta, owner, top, capFor(rc.irmaaCapTier), available)
        if (x <= 1) continue
        const taxAt = (amt: number, gain: number) => {
          finalDelta.ordinaryByPerson[owner] += amt
          finalDelta.ltcg += gain
          const t = tax(finalDelta).total - before
          finalDelta.ordinaryByPerson[owner] -= amt
          finalDelta.ltcg -= gain
          return t
        }
        // The tax is paid from cash above its reserve target, then taxable (whose realized gain is taxed too),
        // then the reserve; convert less if they cannot cover it [Q-TAX-6].
        const cashBal = cashAcc?.balance ?? 0
        const freeCash = Math.max(0, cashBal - (cashAcc ? (cashAcc.cashTargetMonths * spending) / 12 : 0))
        const taxBal = taxableAcc?.balance ?? 0
        const src: FundingSources = {
          freeCash,
          taxableBalance: taxBal,
          gainFrac: taxableAcc && taxBal > 0 ? Math.max(0, 1 - taxableAcc.basis / taxBal) : 0,
          reserveCash: cashBal - freeCash,
        }
        const payable = fundingCapacity(src)
        let f = fundConversionTax((g) => taxAt(x, g), src)
        for (let k = 0; k < 5 && f.tax > payable + 0.01 && x > 1; k++) {
          x *= payable / f.tax
          f = fundConversionTax((g) => taxAt(x, g), src)
        }
        if (x <= 1 || f.tax > payable + 0.01) continue
        finalDelta.ordinaryByPerson[owner] += x
        let left = x
        for (const t of trads) {
          const take = Math.min(t.balance, left)
          t.balance -= take
          left -= take
        }
        roth.balance += x
        conversions += x
        extraTax += f.tax
        td?.conversions?.push({
          owner,
          amount: x,
          tax: f.tax,
          fromCash: f.fromFreeCash + f.fromReserve,
          sold: f.sold,
          gain: f.gain,
        })
        if (cashAcc && f.fromFreeCash + f.fromReserve > 0) {
          const paid = Math.min(cashAcc.balance, f.fromFreeCash + f.fromReserve)
          cashAcc.balance -= paid
          withdrawalsRow[cashAcc.index] = withdrawalsRow[cashAcc.index]! + paid
        }
        if (taxableAcc && f.sold > 0) {
          const sale = sellTaxable(taxableAcc, f.sold)
          withdrawalsRow[taxableAcc.index] = withdrawalsRow[taxableAcc.index]! + sale.sold
          finalDelta.ltcg += sale.gain
        }
      }
    }
    curDelta = finalDelta
    const fedRes = fedEval(finalDelta.ordinaryByPerson[0] + finalDelta.ordinaryByPerson[1], finalDelta.ltcg)
    const scRes = scEval(fedRes.agi, fedRes.taxableSocialSecurity, finalDelta.ltcg + realizedGain, [
      retirementByPerson[0] + finalDelta.ordinaryByPerson[0],
      retirementByPerson[1] + finalDelta.ordinaryByPerson[1],
    ])
    const finalTax = { total: solved.tax.total + extraTax, magi: fedRes.magi }
    magiHistory.set(y, finalTax.magi)
    const beforeReturns = td ? accounts.map((a) => a.balance) : null
    if (td) {
      const scTaxValue = scRes.tax
      td.withdrawals = withdrawalsRow.slice()
      td.tax = {
        fedInput: { ...fedInputBase, itemized: { ...itemizable }, stateIncomeTax: () => scTaxValue },
        fedParams,
        extraOrdinary: finalDelta.ordinaryByPerson[0] + finalDelta.ordinaryByPerson[1],
        extraLtcg: finalDelta.ltcg,
        itemizable: { ...itemizable },
        fed: { ...fedRes },
        sc: {
          agi: fedRes.agi,
          tss: fedRes.taxableSocialSecurity,
          ltcg: finalDelta.ltcg + realizedGain,
          retirement: [
            retirementByPerson[0] + finalDelta.ordinaryByPerson[0],
            retirementByPerson[1] + finalDelta.ordinaryByPerson[1],
          ],
          is65,
        },
        scParams,
        scResult: { ...scRes },
        total: finalTax.total,
      }
    }

    // ---- returns (mid-year convention) and dividend basis ----
    for (let i = 0; i < nAcc; i++) {
      const a = accounts[i]!
      const r = draws.returns[i]![yi]! - a.fee
      const flow = a.balance - startBal[i]!
      if (a.kind === 'taxable') a.basis += startBal[i]! * a.dividendYield
      a.balance = Math.max(0, startBal[i]! * (1 + r) + flow * Math.sqrt(Math.max(0, 1 + r)))
    }

    for (const [a, amt] of hsaDeposits) a.balance += amt
    if (td && opts.trace) {
      td.balances = { start: Array.from(startBal), beforeReturns: beforeReturns!, end: accounts.map((a) => a.balance) }
      opts.trace.data = td as TraceData
    }

    // ---- property appreciation ----
    let homeEquity = 0
    for (const [k, pr] of props.entries()) {
      if (!owned[k]) continue
      propValue[k] = propValue[k]! * (1 + (draws.propertyReturns?.[k]?.[yi] ?? pr.mean))
      homeEquity += propValue[k]! * (1 - pr.sale.costPct) - loanBalance(k, m11)
    }

    // ---- deaths: the survivor takes over the decedent's accounts at year end ----
    for (const [idx, death] of [deathP, deathS].entries()) {
      if (death < m0 || death > m11) continue
      const other = idx === 0 ? 1 : 0
      const otherDeath = idx === 0 ? deathS : deathP
      if (otherDeath <= death) continue
      for (const a of accounts) if (a.owner === idx && !a.joint) a.owner = other
    }

    // ---- bookkeeping ----
    const totalTax = finalTax.total
    let liquid = 0
    for (const a of accounts) liquid += a.balance
    const ssTotal = ssP + ssS
    lifetimeSsReal += ssTotal / price
    pvSsReal += ssTotal / price / (1 + REAL_DISCOUNT) ** yi
    lifetimeTaxReal += (totalTax + irmaaTotal) / price
    irmaaReal += irmaaTotal / price
    if (liquid / price < minLiquidReal) minLiquidReal = liquid / price

    if (rows) {
      rows.push({
        year: y,
        ages: [y - P.birthYear, y - S.birthYear],
        alive: [deathP >= m0, deathS >= m0],
        status,
        price,
        ss: [ssP, ssS],
        earnings: eP.wages + eP.selfEmployment + eS.wages + eS.selfEmployment,
        otherIncome: otherOrdinary + otherTaxFree,
        investmentIncome: dividends + interest,
        rmd: rmdTotal,
        inheritedDistributions: inheritedTotal,
        required: Array.from(required),
        withdrawals: withdrawalsRow,
        expenses,
        healthcare: healthTotal,
        irmaa: irmaaTotal,
        hsaMedical,
        agi: fedRes.agi,
        magi: finalTax.magi,
        taxableIncome: fedRes.taxableIncome,
        deduction: fedRes.deduction,
        itemizing: fedRes.itemizing,
        federalTax: fedRes.incomeTax,
        scTax: scRes.tax,
        payrollTax: fedRes.payrollTax,
        totalTax,
        shortfall: solved.shortfall,
        surplus: solved.surplus + extraSurplus,
        endBalances: accounts.map((a) => a.balance),
        liquid,
        monthsWithheld,
        inheritances: inheritedThisYear,
        homeEquity,
        housing,
        conversions,
      })
    }
    price *= 1 + inflAt(y)
  }

  // Terminal wealth at the end of the last simulated year, in base-date dollars.
  const lastPrice = price / (1 + inflAt(lastYear))
  let terminalNominal = 0
  let afterTax = 0
  for (const a of accounts) {
    terminalNominal += a.balance
    const taxed = a.kind === 'traditional' || a.kind === 'inherited_traditional' || a.kind === 'hsa'
    afterTax += taxed ? a.balance * (1 - asm.heirTaxRate) : a.balance
  }
  // Property passes to heirs with a stepped-up basis: net of selling costs, no income tax.
  for (const [k, pr] of props.entries()) {
    if (!owned[k]) continue
    const net = propValue[k]! * (1 - pr.sale.costPct) - loanBalance(k, ym(lastYear, 12))
    terminalNominal += net
    afterTax += net
  }
  const terminalRealAfterTax = afterTax / lastPrice
  return {
    summary: {
      claim,
      lastYear,
      deathMonth: draws.deathMonth,
      depletedYear,
      totalShortfallReal,
      minLiquidReal,
      terminalNominal,
      terminalRealAfterTax,
      lifetimeSsReal,
      pvSsReal,
      lifetimeTaxReal,
      irmaaReal,
      bequestMet: terminalRealAfterTax >= sc.expenses.bequestTarget,
    },
    rows,
  }
}
