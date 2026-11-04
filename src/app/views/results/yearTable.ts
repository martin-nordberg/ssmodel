// Year-by-year table model [FR-OUT-4]: column definitions shared by the grid and CSV export.
import type { EngineAccount } from '@/engine/model/prepare.ts'
import type { YearRow } from '@/engine/sim/path.ts'

export type YearColumn = {
  id: string
  header: string
  group: string
  money: boolean
  value: (r: YearRow) => number | string
}

export function yearColumns(accounts: EngineAccount[]): YearColumn[] {
  const money = (id: string, header: string, group: string, value: (r: YearRow) => number): YearColumn => ({
    id,
    header,
    group,
    money: true,
    value,
  })
  const cols: YearColumn[] = [
    { id: 'year', header: 'Year', group: '', money: false, value: (r) => r.year },
    {
      id: 'ages',
      header: 'Ages',
      group: '',
      money: false,
      value: (r) => r.ages.map((a, i) => (r.alive[i] ? String(a) : '—')).join('/'),
    },
    money('ssP', 'SS primary', 'Income', (r) => r.ss[0]),
    money('ssS', 'SS spouse', 'Income', (r) => r.ss[1]),
    money('earnings', 'Earnings', 'Income', (r) => r.earnings),
    money('other', 'Other income', 'Income', (r) => r.otherIncome),
    money('invest', 'Dividends + interest', 'Income', (r) => r.investmentIncome),
    money('inherited', 'Inheritances', 'Income', (r) => r.inheritances ?? 0),
    money('expenses', 'Expenses', 'Spending', (r) => r.expenses),
    money('health', 'Healthcare', 'Spending', (r) => r.healthcare),
    money('irmaa', 'of which IRMAA', 'Spending', (r) => r.irmaa),
    money('rmd', 'RMDs', 'Withdrawals', (r) => r.rmd),
    money('inhDist', 'Inherited IRA dist.', 'Withdrawals', (r) => r.inheritedDistributions),
    ...accounts.map((a, i) =>
      money(
        `w${i}`,
        `From ${a.label}`,
        'Withdrawals',
        (r) => (r.withdrawals[i] ?? 0) + (a.kind === 'hsa' ? (r.required[i] ?? 0) : 0),
      ),
    ),
    money('conv', 'Roth conversions', 'Withdrawals', (r) => r.conversions ?? 0),
    money('agi', 'AGI', 'Tax', (r) => r.agi),
    money('ti', 'Taxable income', 'Tax', (r) => r.taxableIncome),
    money('fed', 'Federal tax', 'Tax', (r) => r.federalTax),
    money('sc', 'SC tax', 'Tax', (r) => r.scTax),
    money('payroll', 'Payroll tax', 'Tax', (r) => r.payrollTax),
    ...accounts.map((a, i) => money(`b${i}`, a.label, 'Year-end balances', (r) => r.endBalances[i] ?? 0)),
    money('liquid', 'Total liquid', 'Year-end balances', (r) => r.liquid),
    money('home', 'Home + real estate', 'Year-end balances', (r) => r.homeEquity ?? 0),
    money('short', 'Shortfall', 'Year-end balances', (r) => r.shortfall),
  ]
  return cols
}

export function toCsv(rows: YearRow[], cols: YearColumn[], real: boolean): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = [cols.map((c) => esc(c.header)).join(',')]
  for (const r of rows) {
    lines.push(
      cols
        .map((c) => {
          const v = c.value(r)
          if (typeof v === 'number' && c.money) return String(Math.round(real ? v / r.price : v))
          return esc(String(v))
        })
        .join(','),
    )
  }
  return `${lines.join('\n')}\n`
}

/** Withdrawal schedule [FR-WD-5, FR-OUT-5]: per account, required plus discretionary withdrawals, and conversions. */
export function scheduleColumns(accounts: EngineAccount[]): YearColumn[] {
  const money = (id: string, header: string, value: (r: YearRow) => number): YearColumn => ({
    id,
    header,
    group: 'Schedule',
    money: true,
    value,
  })
  return [
    { id: 'year', header: 'Year', group: '', money: false, value: (r) => r.year },
    {
      id: 'ages',
      header: 'Ages',
      group: '',
      money: false,
      value: (r) => r.ages.map((a, i) => (r.alive[i] ? String(a) : '—')).join('/'),
    },
    ...accounts.map((a, i) => money(`s${i}`, a.label, (r) => (r.required[i] ?? 0) + (r.withdrawals[i] ?? 0))),
    money('conv', 'Roth conversions', (r) => r.conversions ?? 0),
    money(
      'total',
      'Total withdrawn',
      (r) => r.required.reduce((x, y) => x + y, 0) + r.withdrawals.reduce((x, y) => x + y, 0),
    ),
  ]
}
