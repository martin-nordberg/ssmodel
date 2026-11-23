// The comparison shape for P0.3: per-account signed balances and section totals, in integer cents, for each
// as-of date (Balance Sheet) and each calendar year (Income Statement). Both the browser replay and the
// reference run of Checquery's own code reduce their balances with this one function.

export interface Balance {
  acctId: string
  debitCents: number
  creditCents: number
}

export interface Account {
  id: string
  acctType: string
}

export interface AsOfTotals {
  assets: number
  liabilities: number
  netWorth: number
  byAccount: Record<string, number>
}

export interface PeriodTotals {
  income: number
  expense: number
  byAccount: Record<string, number>
}

export interface Totals {
  asOf: Record<string, AsOfTotals>
  periods: Record<string, PeriodTotals>
}

/** Debit-normal for assets and expenses, credit-normal otherwise, as Checquery's statements sign them. */
function signed(acctType: string, b: Balance): number {
  return acctType === 'ASSET' || acctType === 'EXPENSE' ? b.debitCents - b.creditCents : b.creditCents - b.debitCents
}

function byAccount(accounts: Map<string, string>, balances: Balance[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of balances) {
    const type = accounts.get(b.acctId)
    // Like buildBalanceSheet, balances on accounts that aren't live are left out.
    if (type !== undefined) out[b.acctId] = signed(type, b)
  }
  return out
}

function sum(accounts: Map<string, string>, values: Record<string, number>, type: string): number {
  let total = 0
  for (const [id, v] of Object.entries(values)) if (accounts.get(id) === type) total += v
  return total
}

export function reduceTotals(
  liveAccounts: Account[],
  asOf: Record<string, Balance[]>,
  periods: Record<string, Balance[]>,
): Totals {
  const accounts = new Map(liveAccounts.map((a) => [a.id, a.acctType]))
  const totals: Totals = { asOf: {}, periods: {} }
  for (const [date, balances] of Object.entries(asOf)) {
    const values = byAccount(accounts, balances)
    const assets = sum(accounts, values, 'ASSET')
    const liabilities = sum(accounts, values, 'LIABILITY')
    totals.asOf[date] = { assets, liabilities, netWorth: assets - liabilities, byAccount: values }
  }
  for (const [period, balances] of Object.entries(periods)) {
    const values = byAccount(accounts, balances)
    totals.periods[period] = {
      income: sum(accounts, values, 'INCOME'),
      expense: sum(accounts, values, 'EXPENSE'),
      byAccount: values,
    }
  }
  return totals
}

/** The dates and periods compared: every year-end and calendar year from 2000, plus today. */
export function comparisonPoints(today: string): { dates: string[]; years: string[] } {
  const lastYear = Number(today.slice(0, 4))
  const years: string[] = []
  for (let y = 2000; y <= lastYear; y++) years.push(String(y))
  return { dates: [...years.map((y) => `${y}-12-31`), today], years }
}

/**
 * Lists where two totals differ, by date or period and account, without any amounts, so it is safe to print
 * for the real file.
 */
export function differences(a: Totals, b: Totals): string[] {
  const out: string[] = []
  const keys = (x: object, y: object) => [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()
  for (const date of keys(a.asOf, b.asOf)) {
    const x = a.asOf[date]
    const y = b.asOf[date]
    if (!x || !y) {
      out.push(`as of ${date}: missing on one side`)
      continue
    }
    for (const f of ['assets', 'liabilities', 'netWorth'] as const) if (x[f] !== y[f]) out.push(`as of ${date}: ${f}`)
    for (const id of keys(x.byAccount, y.byAccount))
      if (x.byAccount[id] !== y.byAccount[id]) out.push(`as of ${date}: ${id}`)
  }
  for (const p of keys(a.periods, b.periods)) {
    const x = a.periods[p]
    const y = b.periods[p]
    if (!x || !y) {
      out.push(`period ${p}: missing on one side`)
      continue
    }
    for (const f of ['income', 'expense'] as const) if (x[f] !== y[f]) out.push(`period ${p}: ${f}`)
    for (const id of keys(x.byAccount, y.byAccount))
      if (x.byAccount[id] !== y.byAccount[id]) out.push(`period ${p}: ${id}`)
  }
  return out
}
