// "Explain a number" [FR-UI-14]: breakdowns of a year-table value from a year trace. Breakdowns reuse the engine's
// named functions (taxableSocialSecurity, itemizedDeduction, bracket tables) on the captured inputs. In an additive
// section the line values add up to its total; the first section's total is the value being explained.
import { formatYM } from '../core/dates.ts'
import { federalRules } from '../rules/tables.ts'
import { itemizedDeduction } from '../tax/itemized.ts'
import { scIncomeAdjustedDeduction } from '../tax/sc.ts'
import type { TraceData } from './trace.ts'

/** `unit` marks lines that are not dollar amounts (counts, or a note with no value). */
export type ExplainLine = { label: string; value: number; note?: string; unit?: 'count' | 'none' }
export type ExplainSection = {
  title: string
  lines: ExplainLine[]
  total: ExplainLine
  /** Lines add up to the total (otherwise the total follows from a formula given in its note). */
  additive: boolean
}
export type Explanation = { title: string; value: number; sections: ExplainSection[] }

// Dollar amounts inside notes are tokens, so the UI formats them like the values (today's or nominal dollars).
const money = (x: number) => `\u27e6${x}\u27e7`

/** Replaces the dollar tokens in a note with `format(amount)`. */
export function formatNote(note: string, format: (amount: number) => string): string {
  return note.replace(/\u27e6([^\u27e7]+)\u27e7/g, (_, x: string) => format(Number(x)))
}
const pct = (x: number) => `${+(x * 100).toFixed(2)}%`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const section = (title: string, lines: ExplainLine[], total: string, additive = true): ExplainSection => ({
  title,
  lines: lines.filter((l) => Math.abs(l.value) > 0.005),
  total: { label: total, value: lines.reduce((s, l) => s + l.value, 0) },
  additive,
})

/** Explanation of the year-table column `columnId` for the traced year, or null when there is none. */
export function explainValue(t: TraceData, columnId: string): Explanation | null {
  if (columnId === 'ssP' || columnId === 'ssS') return explainSocialSecurity(t, columnId === 'ssP' ? 0 : 1)
  if (columnId === 'expenses' || columnId === 'housing') return explainExpenses(t, columnId === 'housing')
  if (columnId === 'health') return explainHealthcare(t)
  if (columnId === 'irmaa') return explainIrmaa(t)
  if (columnId === 'rmd' || columnId === 'inhDist') return explainRequired(t, columnId === 'rmd')
  if (columnId === 'conv') return explainConversions(t)
  if (['agi', 'deduction', 'itemized', 'ti', 'fed'].includes(columnId)) return explainFederal(t, columnId)
  if (columnId === 'sc') return explainSc(t)
  if (columnId === 'liquid') return explainLiquid(t)
  // Console detail-strip totals.
  if (columnId === 'ss') return explainSsTotal(t)
  if (columnId === 'spend') return explainSpending(t)
  if (columnId === 'wd') return explainAllWithdrawals(t)
  if (columnId === 'tax') return explainTotalTax(t)
  if (columnId === 'short') return explainCashFlow(t)
  const w = /^w(\d+)$/.exec(columnId)
  if (w) return explainWithdrawal(t, Number(w[1]))
  const b = /^b(\d+)$/.exec(columnId)
  if (b) return explainBalance(t, Number(b[1]))
  return null
}

function explainSocialSecurity(t: TraceData, who: 0 | 1): Explanation {
  const p = t.ss.people[who]
  // Group consecutive months with the same payment and haircut.
  const lines: ExplainLine[] = []
  let k = 0
  while (k < 12) {
    const amt = p.monthly[k]! + p.excess[k]!
    const hc = t.ss.haircut[k]!
    let j = k
    while (j + 1 < 12 && p.monthly[j + 1]! + p.excess[j + 1]! === amt && t.ss.haircut[j + 1] === hc) j++
    const n = j - k + 1
    if (amt > 0) {
      const span = n === 1 ? MONTHS[k]! : `${MONTHS[k]}–${MONTHS[j]}`
      const parts = [`${n} × ${money(amt)}`]
      if (p.excess[k]! > 0) parts.push(`incl. spousal excess ${money(p.excess[k]!)}`)
      if (hc < 1) parts.push(`× ${pct(hc)} payable (trust fund)`)
      lines.push({ label: span, value: n * amt * hc, note: parts.join(', ') })
    }
    k = j + 1
  }
  const notes: ExplainLine[] = [
    { label: 'PIA this year (with COLAs)', value: p.pia },
    { label: 'Claimed', value: 0, note: formatYM(p.claim), unit: 'none' },
  ]
  if (who === 0 && t.ss.monthsWithheld > 0)
    notes.push({ label: 'Months withheld (earnings test)', value: t.ss.monthsWithheld, unit: 'count' })
  return {
    title: `Social Security, ${who === 0 ? 'Primary' : 'Spouse'}, ${t.year}`,
    value: t.ss.total[who],
    sections: [
      section('Monthly benefits paid', lines, 'Total benefits'),
      { title: 'Basis', lines: notes, total: { label: 'Monthly PIA', value: p.pia }, additive: false },
    ],
  }
}

function explainExpenses(t: TraceData, housingOnly: boolean): Explanation {
  const e = t.expenses
  if (housingOnly)
    return {
      title: `Housing, ${t.year}`,
      value: e.housing.reduce((s, x) => s + x.amount, 0),
      sections: [section('Home and real estate', e.housing.map(amt), 'Housing')],
    }
  return {
    title: `Expenses, ${t.year}`,
    value: e.total,
    sections: [
      section(
        'Spending (after tax)',
        [
          ...e.items.map(amt),
          ...e.housing.map(amt),
          { label: 'HSA contributions', value: e.hsaContributions },
          { label: 'Shortfall covered from a home sale (replacement cost)', value: e.saleShortfall },
        ],
        'Expenses',
      ),
    ],
  }
}

const amt = (x: { label: string; amount: number }): ExplainLine => ({ label: x.label, value: x.amount })

function explainHealthcare(t: TraceData): Explanation {
  const h = t.health
  const lines: ExplainLine[] = []
  for (const [i, c] of h.people.entries()) {
    if (!c) continue
    const who = i === 0 ? 'Primary' : 'Spouse'
    lines.push({ label: `${who}: COBRA`, value: c.cobra })
    lines.push({
      label: `${who}: Medicare Part B + D`,
      value: c.partBD,
      note: c.irmaaSurcharge > 0 ? `incl. IRMAA surcharge ${money(c.irmaaSurcharge)}` : undefined,
    })
    lines.push({ label: `${who}: Medigap`, value: c.medigap })
    lines.push({ label: `${who}: out of pocket`, value: c.outOfPocket })
  }
  const irmaa = h.people.reduce((s, c) => s + (c?.irmaaSurcharge ?? 0), 0)
  return {
    title: `Healthcare, ${t.year}`,
    value: h.total,
    sections: [
      section('Costs', lines, 'Healthcare'),
      {
        title: 'IRMAA',
        lines: [
          { label: `MAGI in ${h.lookbackYear} (two-year lookback)`, value: h.lookbackMagi },
          { label: 'Tier', value: h.irmaaTier, note: h.irmaaTier === 0 ? 'no surcharge' : undefined, unit: 'count' },
          { label: 'Paid from the HSA', value: h.hsaMedical },
        ],
        total: { label: 'IRMAA surcharges', value: irmaa },
        additive: false,
      },
    ],
  }
}

function explainIrmaa(t: TraceData): Explanation {
  const h = t.health
  const lines = h.people.flatMap((c, i) =>
    c ? [{ label: `${i === 0 ? 'Primary' : 'Spouse'}: Part B and D surcharges`, value: c.irmaaSurcharge }] : [],
  )
  const total = lines.reduce((s, l) => s + l.value, 0)
  return {
    title: `IRMAA surcharges, ${t.year}`,
    value: total,
    sections: [
      section('Surcharges (included in healthcare)', lines, 'IRMAA'),
      {
        title: 'Why',
        lines: [{ label: `MAGI in ${h.lookbackYear} (two-year lookback)`, value: h.lookbackMagi }],
        total: {
          label: 'Tier',
          value: h.irmaaTier,
          note: h.irmaaTier === 0 ? 'no surcharge' : undefined,
          unit: 'count',
        },
        additive: false,
      },
    ],
  }
}

function explainRequired(t: TraceData, lifetime: boolean): Explanation {
  const lines = t.accounts
    .map((a, i) => ({ a, v: t.required[i] ?? 0 }))
    .filter(({ a }) => (lifetime ? a.kind === 'traditional' : a.kind.startsWith('inherited')))
    .map(({ a, v }) => ({ label: a.label, value: v }))
  return {
    title: `${lifetime ? 'Required minimum distributions' : 'Inherited IRA distributions'}, ${t.year}`,
    value: lifetime ? t.rmd : t.inheritedDistributions,
    sections: [section('By account', lines, 'Total')],
  }
}

function explainConversions(t: TraceData): Explanation {
  const lines = t.conversions.map((c) => ({
    label: `${c.owner === 0 ? 'Primary' : 'Spouse'}: traditional → Roth`,
    value: c.amount,
    note:
      `tax ${money(c.tax)} paid from cash ${money(c.fromCash)} and shares ${money(c.sold)}` +
      (c.gain > 0 ? ` (realizing ${money(c.gain)} of gain, taxed this year)` : ''),
  }))
  return {
    title: `Roth conversions, ${t.year}`,
    value: t.conversions.reduce((s, c) => s + c.amount, 0),
    sections: [section('Conversions', lines, 'Converted')],
  }
}

function explainFederal(t: TraceData, columnId: string): Explanation {
  const x = t.tax
  const i = x.fedInput
  const f = x.fed
  const p = x.fedParams
  const st = t.status
  const wages = i.wagesByPerson.reduce((s, w) => s + w, 0)
  const se = i.seByPerson.reduce((s, w) => s + w, 0)
  const ltcg = Math.max(0, i.ltcg + x.extraLtcg)
  const counted =
    wages +
    se +
    i.ordinary +
    x.extraOrdinary +
    i.investmentOrdinary +
    i.qualifiedDividends +
    ltcg +
    f.taxableSocialSecurity
  const halfSe = counted - f.agi
  const agi = section(
    'Income → AGI',
    [
      { label: 'Wages', value: wages },
      { label: 'Self-employment, less half the SE tax', value: se - halfSe },
      { label: 'Required distributions, annuities and other ordinary income', value: i.ordinary },
      { label: 'Withdrawals and conversions (traditional, HSA)', value: x.extraOrdinary },
      { label: 'Interest and rent', value: i.investmentOrdinary },
      { label: 'Qualified dividends', value: i.qualifiedDividends },
      { label: 'Long-term capital gains', value: ltcg },
      {
        label: 'Taxable Social Security',
        value: f.taxableSocialSecurity,
        note: `of ${money(i.socialSecurity)} received; provisional income ${money(f.provisionalIncome)} (Pub 915)`,
      },
    ],
    'AGI',
  )

  const standard = p.standardDeduction[st] + p.additional65[st] * i.count65
  const top = p.brackets[st][p.brackets[st].length - 1]![0]
  const it = itemizedDeduction(t.year, f.agi, f.magi, f.stateTax, x.itemizable, top, f.seniorDeduction)
  const itemLines: ExplainLine[] = [
    { label: 'State and local taxes (SC tax + property tax, capped)', value: it.salt },
    { label: 'Mortgage interest', value: it.mortgageInterest },
    { label: `Medical above ${pct(federalRules.itemized.medicalFloor)} of AGI`, value: it.medical },
    { label: 'Charitable gifts above the AGI floor', value: it.charity },
    { label: 'Top-bracket (2/37) limitation', value: -it.limitation },
  ]
  const deduction: ExplainSection = section(
    'Deduction',
    [
      f.itemizing
        ? { label: 'Itemized deductions', value: f.itemized, note: `standard would be ${money(standard)}` }
        : {
            label: 'Standard deduction (with 65+ additions)',
            value: standard,
            note: f.itemized > 0 ? `itemized would be ${money(f.itemized)}` : undefined,
          },
      { label: 'Senior deduction (2025–2028)', value: f.seniorDeduction },
    ],
    'Deduction',
  )
  const itemized = section('Itemized deductions', itemLines, 'Itemized')

  const ordinaryTaxable = f.ordinaryTaxable
  const prefTaxable = f.taxableIncome - ordinaryTaxable
  const ti: ExplainSection = section(
    'Taxable income',
    [
      { label: 'AGI', value: f.agi },
      { label: 'Deduction', value: -f.deduction },
    ],
    'Taxable income',
  )
  ti.total.note = `ordinary ${money(ordinaryTaxable)}, preferential ${money(prefTaxable)}`

  const brackets = p.brackets[st]
  const taxLines: ExplainLine[] = []
  for (let b = 0; b < brackets.length; b++) {
    const [lo, rate] = brackets[b]!
    const hi = brackets[b + 1]?.[0] ?? Number.POSITIVE_INFINITY
    const inBracket = Math.max(0, Math.min(ordinaryTaxable, hi) - lo)
    if (inBracket > 0.5)
      taxLines.push({ label: `Ordinary at ${pct(rate)}`, value: inBracket * rate, note: `on ${money(inBracket)}` })
  }
  const [zeroTop, fifteenTop] = p.ltcg[st]
  const at0 = Math.max(0, Math.min(f.taxableIncome, zeroTop) - ordinaryTaxable)
  const at15 = Math.max(0, Math.min(f.taxableIncome, fifteenTop) - Math.max(ordinaryTaxable, zeroTop))
  const at20 = Math.max(0, prefTaxable - at0 - at15)
  if (at0 > 0) taxLines.push({ label: 'Gains and qualified dividends at 0%', value: 0, note: `on ${money(at0)}` })
  taxLines.push({ label: 'Gains and qualified dividends at 15%', value: 0.15 * at15, note: `on ${money(at15)}` })
  taxLines.push({ label: 'Gains and qualified dividends at 20%', value: 0.2 * at20, note: `on ${money(at20)}` })
  taxLines.push({ label: 'Net investment income tax (3.8%)', value: f.niit })
  const tax = section('Federal income tax', taxLines, 'Federal income tax')

  const order: Record<string, ExplainSection[]> = {
    fed: [tax, ti, agi, deduction, itemized],
    agi: [agi, ti, tax, deduction],
    deduction: [deduction, itemized, agi],
    itemized: [itemized, deduction, agi],
    ti: [ti, agi, deduction, tax],
  }
  const values: Record<string, number> = {
    fed: f.incomeTax,
    agi: f.agi,
    deduction: f.deduction,
    itemized: f.itemized,
    ti: f.taxableIncome,
  }
  const titles: Record<string, string> = {
    fed: 'Federal income tax',
    agi: 'Adjusted gross income',
    deduction: 'Federal deduction',
    itemized: 'Itemized deductions',
    ti: 'Federal taxable income',
  }
  return { title: `${titles[columnId]}, ${t.year}`, value: values[columnId]!, sections: order[columnId]! }
}

function explainSc(t: TraceData): Explanation {
  const s = t.tax.sc
  const p = t.tax.scParams
  const lines: ExplainLine[] = [
    { label: 'Federal AGI', value: s.agi },
    { label: 'Taxable Social Security (exempt in SC)', value: p.socialSecurityExempt ? -s.tss : 0 },
    {
      label: `${pct(p.capitalGainDeductionRate)} of long-term gains`,
      value: -p.capitalGainDeductionRate * Math.max(0, s.ltcg),
    },
  ]
  for (let k = 0; k < 2; k++) {
    const cap = s.is65[k] ? p.retirementDeduction.age65 : p.retirementDeduction.under65
    const retirement = Math.min(Math.max(0, s.retirement[k]!), cap)
    const age65 = s.is65[k] ? Math.max(0, p.age65Deduction - retirement) : 0
    lines.push({ label: `${k === 0 ? 'Primary' : 'Spouse'}: retirement income deduction`, value: -retirement })
    lines.push({ label: `${k === 0 ? 'Primary' : 'Spouse'}: age-65 deduction`, value: -age65 })
  }
  lines.push({
    label: 'SC income adjusted deduction (SCIAD)',
    value: -scIncomeAdjustedDeduction(s.agi, t.status, p.sciad),
  })
  const taxable = section('SC taxable income (Act 110)', lines, 'SC taxable income')
  const r = p.rates
  const ti = t.tax.scResult.taxableIncome
  const formula =
    ti < r.bracket ? `${pct(r.lowRate)} × ${money(ti)}` : `${pct(r.highRate)} × ${money(ti)} − ${money(r.highSubtract)}`
  const tax: ExplainSection = {
    title: 'SC income tax',
    lines: [{ label: 'SC taxable income', value: ti }],
    total: { label: 'SC tax', value: t.tax.scResult.tax, note: formula },
    additive: false,
  }
  return { title: `South Carolina tax, ${t.year}`, value: t.tax.scResult.tax, sections: [tax, taxable] }
}

function cashFlowSection(t: TraceData): ExplainSection {
  const solverDrawn = t.solver.withdrawals.reduce((s, w) => s + w, 0)
  return section(
    'Cash flow (withdrawals solved to cover spending and tax)',
    [
      ...t.inflows.map(amt),
      { label: 'Withdrawals (solved)', value: solverDrawn },
      { label: 'Tax on income and withdrawals', value: -t.solver.tax },
      { label: 'Spending: expenses', value: -t.expenses.total },
      { label: 'Spending: healthcare', value: -t.health.total },
      { label: 'Healthcare paid from the HSA', value: t.health.hsaMedical },
      { label: 'Shortfall (unfunded spending)', value: t.solver.shortfall },
    ],
    'Surplus (saved)',
  )
}

function explainCashFlow(t: TraceData): Explanation {
  const solverDrawn = t.solver.withdrawals.reduce((s, w) => s + w, 0)
  const short = section(
    'Unfunded spending',
    [
      { label: 'Spending: expenses', value: t.expenses.total },
      { label: 'Spending: healthcare', value: t.health.total },
      { label: 'Healthcare paid from the HSA', value: -t.health.hsaMedical },
      { label: 'Tax on income and withdrawals', value: t.solver.tax },
      ...t.inflows.map((x) => ({ label: x.label, value: -x.amount })),
      { label: 'Withdrawals (all savings drawn)', value: -solverDrawn },
      { label: 'Surplus saved', value: t.solver.surplus },
    ],
    'Shortfall',
  )
  return { title: `Shortfall, ${t.year}`, value: t.solver.shortfall, sections: [short, cashFlowSection(t)] }
}

function explainWithdrawal(t: TraceData, i: number): Explanation {
  const a = t.accounts[i]
  if (!a) return { title: 'Withdrawal', value: 0, sections: [] }
  const strategy: Record<string, string> = {
    conventional: 'Conventional order (taxable, then traditional, then Roth)',
    bracket_fill: 'Bracket-fill (traditional up to the target bracket, then taxable, then Roth)',
    proportional: 'Proportional to balances',
    custom: 'Custom order',
  }
  const lines: ExplainLine[] = [
    {
      label: 'To cover spending and tax',
      value: t.solver.withdrawals[i] ?? 0,
      note: strategy[t.solver.strategy] ?? t.solver.strategy,
    },
    {
      label: 'Bracket-aware inherited withdrawal (beyond the required amount)',
      value: t.bracketAware.filter((b) => b.account === i).reduce((s, b) => s + b.amount, 0),
    },
  ]
  for (const c of t.conversions) {
    if (a.kind === 'taxable') lines.push({ label: 'Sold to pay Roth conversion tax', value: c.sold })
    if (a.kind === 'cash') lines.push({ label: 'Paid Roth conversion tax', value: c.fromCash })
  }
  if (a.kind === 'hsa') lines.push({ label: 'Qualified medical costs paid', value: t.required[i] ?? 0 })
  const total = (t.withdrawals[i] ?? 0) + (a.kind === 'hsa' ? (t.required[i] ?? 0) : 0)
  return {
    title: `Withdrawal from ${a.label}, ${t.year}`,
    value: total,
    sections: [section('Withdrawals', lines, `From ${a.label}`), cashFlowSection(t)],
  }
}

function explainBalance(t: TraceData, i: number): Explanation {
  const a = t.accounts[i]
  if (!a) return { title: 'Balance', value: 0, sections: [] }
  const start = t.balances.start[i]!
  const before = t.balances.beforeReturns[i]!
  const end = t.balances.end[i]!
  const req = t.required[i] ?? 0
  const drawn = t.withdrawals[i] ?? 0
  return {
    title: `${a.label}, end of ${t.year}`,
    value: end,
    sections: [
      section(
        'Balance',
        [
          { label: 'Start of year', value: start },
          { label: 'Required distributions', value: -req },
          { label: 'Withdrawals', value: -drawn },
          {
            label: 'Deposits (surplus, conversions, inheritances, sale proceeds)',
            value: before - start + req + drawn,
          },
          {
            label: a.kind === 'hsa' ? 'Investment return and HSA contributions' : 'Investment return (mid-year flows)',
            value: end - before,
          },
        ],
        'End of year',
      ),
    ],
  }
}

function explainLiquid(t: TraceData): Explanation {
  return {
    title: `Total liquid savings, end of ${t.year}`,
    value: t.balances.end.reduce((s, b) => s + b, 0),
    sections: [
      section(
        'By account',
        t.accounts.map((a, i) => ({ label: a.label, value: t.balances.end[i]! })),
        'Total liquid',
      ),
    ],
  }
}

function explainSsTotal(t: TraceData): Explanation {
  const p = explainSocialSecurity(t, 0)
  const sp = explainSocialSecurity(t, 1)
  return {
    title: `Social Security, ${t.year}`,
    value: t.ss.total[0] + t.ss.total[1],
    sections: [
      section(
        'By person',
        [
          { label: 'Primary', value: t.ss.total[0] },
          { label: 'Spouse', value: t.ss.total[1] },
        ],
        'Social Security',
      ),
      { ...p.sections[0]!, title: 'Primary: monthly benefits' },
      { ...sp.sections[0]!, title: 'Spouse: monthly benefits' },
    ],
  }
}

function explainSpending(t: TraceData): Explanation {
  return {
    title: `Spending, ${t.year}`,
    value: t.expenses.total + t.health.total,
    sections: [
      section(
        'Spending',
        [
          { label: 'Expenses (incl. housing)', value: t.expenses.total },
          { label: 'Healthcare', value: t.health.total },
        ],
        'Spending',
      ),
      ...explainExpenses(t, false).sections,
      ...explainHealthcare(t).sections.slice(0, 1),
    ],
  }
}

function explainAllWithdrawals(t: TraceData): Explanation {
  const lines = t.accounts.map((a, i) => {
    const required = a.kind === 'hsa' ? 0 : (t.required[i] ?? 0)
    const drawn = t.withdrawals[i] ?? 0
    return {
      label: a.label,
      value: required + drawn,
      note:
        required > 0 && drawn > 0
          ? `required ${money(required)} + ${money(drawn)}`
          : required > 0
            ? 'required'
            : undefined,
    }
  })
  return {
    title: `Withdrawals, ${t.year}`,
    value: lines.reduce((s, l) => s + l.value, 0),
    sections: [section('By account (incl. required distributions)', lines, 'Withdrawals'), cashFlowSection(t)],
  }
}

function explainTotalTax(t: TraceData): Explanation {
  const f = t.tax.fed
  const other = t.tax.total - f.incomeTax - t.tax.scResult.tax - f.payrollTax
  return {
    title: `Taxes, ${t.year}`,
    value: t.tax.total,
    sections: [
      section(
        'Taxes',
        [
          { label: 'Federal income tax', value: f.incomeTax },
          { label: 'South Carolina income tax', value: t.tax.scResult.tax },
          { label: 'Payroll and self-employment tax', value: f.payrollTax },
          { label: 'Penalties (early HSA withdrawals)', value: other },
        ],
        'Taxes',
      ),
      ...explainFederal(t, 'fed').sections.slice(0, 1),
    ],
  }
}
