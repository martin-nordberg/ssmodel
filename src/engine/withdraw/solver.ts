// Withdrawal solver [FR-WD-1, FR-SIM-3 step 5, FR-SIM-4]. Given cash inflows that are already fixed for the year
// (benefits, earnings, required distributions, dividends), after-tax spending, and the accounts available, find
// gross withdrawals per account, following the strategy, such that inflows + withdrawals - tax = spending.
// Net cash is increasing in the total withdrawal G (marginal tax < 100%), so a 1-D root find on G suffices:
// secant steps with a bisection fallback, to a $1 tolerance.

export type SolverKind =
  | 'cash'
  | 'taxable'
  | 'traditional'
  | 'inherited_traditional'
  | 'roth'
  | 'inherited_roth'
  | 'hsa'
export type PersonIndex = 0 | 1

export type SolverAccount = {
  kind: SolverKind
  /** Owner index for per-person tax attribution (joint accounts use 0). */
  owner: PersonIndex
  /** Balance available for discretionary withdrawal this year. */
  available: number
  /** Taxable accounts: fraction of a sale that is long-term gain. */
  gainFrac: number
  /** Cash: balance kept in reserve before the reserve itself is used. */
  reserve: number
  /** HSA non-medical withdrawals before 65 carry a 20% penalty. */
  penaltyRate: number
}

/** Extra taxable items created by discretionary withdrawals. */
export type TaxDelta = { ordinaryByPerson: [number, number]; ltcg: number; penalty: number }

export type TaxOutcome = {
  /** Total tax for the year (federal + state + payroll + penalties) including the delta. */
  total: number
  /** Ordinary taxable income (federal), for bracket filling. */
  ordinaryTaxable: number
  magi: number
}

export type TaxFn = (delta: TaxDelta) => TaxOutcome

export type Strategy =
  | { kind: 'conventional' }
  | { kind: 'bracket_fill'; bracketTop: number; magiCap: number }
  | { kind: 'proportional' }
  | { kind: 'custom'; order: SolverKind[] }

export type SolveInput = {
  accounts: SolverAccount[]
  strategy: Strategy
  /** Cash inflows before discretionary withdrawals and before tax. */
  inflows: number
  /** After-tax spending to fund (expenses, healthcare, premiums). */
  spending: number
  tax: TaxFn
}

export type SolveResult = {
  withdrawals: number[]
  tax: TaxOutcome
  /** Inflows + withdrawals - tax. */
  net: number
  /** Unfunded spending (depletion) [FR-SIM-4]. */
  shortfall: number
  /** Cash left over when inflows alone exceed spending plus tax; to be reinvested. */
  surplus: number
}

const ORDER_CONVENTIONAL: SolverKind[] = [
  'cash',
  'taxable',
  'inherited_traditional',
  'traditional',
  'inherited_roth',
  'roth',
  'hsa',
]
// After the bracket is full: taxable and Roth before any more traditional income [FR-WD-1].
const ORDER_AFTER_BRACKET: SolverKind[] = [
  'cash',
  'taxable',
  'inherited_roth',
  'roth',
  'inherited_traditional',
  'traditional',
  'hsa',
]
const TRADITIONAL: SolverKind[] = ['inherited_traditional', 'traditional']

function deltaFor(accounts: SolverAccount[], w: number[]): TaxDelta {
  const d: TaxDelta = { ordinaryByPerson: [0, 0], ltcg: 0, penalty: 0 }
  for (let i = 0; i < accounts.length; i++) {
    const a = accounts[i]!
    const x = w[i]!
    if (x <= 0) continue
    switch (a.kind) {
      case 'traditional':
      case 'inherited_traditional':
        d.ordinaryByPerson[a.owner] += x
        break
      case 'taxable':
        d.ltcg += x * a.gainFrac
        break
      case 'hsa':
        d.ordinaryByPerson[a.owner] += x
        d.penalty += x * a.penaltyRate
        break
      default:
        break
    }
  }
  return d
}

/** Withdraw `amount` from accounts of the given kinds in order; mutates `w`, returns the amount not covered. */
function drawInOrder(
  accounts: SolverAccount[],
  w: number[],
  order: SolverKind[],
  amount: number,
  useReserve: boolean,
): number {
  let left = amount
  for (const kind of order) {
    for (let i = 0; i < accounts.length && left > 0; i++) {
      const a = accounts[i]!
      if (a.kind !== kind) continue
      const cap = a.available - (kind === 'cash' && !useReserve ? a.reserve : 0) - w[i]!
      if (cap <= 0) continue
      const take = Math.min(cap, left)
      w[i]! += take
      left -= take
    }
    if (left <= 0) break
  }
  return left
}

export function totalAvailable(accounts: SolverAccount[]): number {
  let s = 0
  for (const a of accounts) s += Math.max(0, a.available)
  return s
}

/**
 * Allocation of a gross total G across accounts for a strategy. For bracket-fill, `traditionalRoom` is the
 * traditional withdrawal that fills the target bracket (computed once per year).
 */
function allocate(accounts: SolverAccount[], strategy: Strategy, g: number, traditionalRoom: number): number[] {
  const w = new Array<number>(accounts.length).fill(0)
  if (g <= 0) return w
  switch (strategy.kind) {
    case 'conventional': {
      let left = drawInOrder(accounts, w, ORDER_CONVENTIONAL, g, false)
      if (left > 0) left = drawInOrder(accounts, w, ['cash'], left, true)
      return w
    }
    case 'bracket_fill': {
      let left = g
      const firstTrad = Math.min(traditionalRoom, g)
      left -= firstTrad - drawInOrder(accounts, w, TRADITIONAL, firstTrad, false)
      left = drawInOrder(accounts, w, ORDER_AFTER_BRACKET, left, false)
      if (left > 0) drawInOrder(accounts, w, ['cash'], left, true)
      return w
    }
    case 'proportional': {
      const total = totalAvailable(accounts)
      if (total <= 0) return w
      const frac = Math.min(1, g / total)
      for (let i = 0; i < accounts.length; i++) w[i] = Math.max(0, accounts[i]!.available) * frac
      return w
    }
    case 'custom': {
      const order = [...strategy.order, ...ORDER_CONVENTIONAL.filter((k) => !strategy.order.includes(k))]
      let left = drawInOrder(accounts, w, order, g, false)
      if (left > 0) left = drawInOrder(accounts, w, ['cash'], left, true)
      return w
    }
  }
}

/** Largest traditional withdrawal keeping ordinary taxable income <= bracketTop and MAGI <= magiCap. */
export function traditionalRoom(accounts: SolverAccount[], tax: TaxFn, bracketTop: number, magiCap: number): number {
  let maxTrad = 0
  for (const a of accounts) if (a.kind === 'traditional' || a.kind === 'inherited_traditional') maxTrad += a.available
  if (maxTrad <= 0) return 0
  const ok = (t: number) => {
    const w = new Array<number>(accounts.length).fill(0)
    drawInOrder(accounts, w, TRADITIONAL, t, false)
    const r = tax(deltaFor(accounts, w))
    return r.ordinaryTaxable <= bracketTop + 0.5 && r.magi <= magiCap + 0.5
  }
  if (!ok(0)) return 0
  if (ok(maxTrad)) return maxTrad
  let lo = 0
  let hi = maxTrad
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2
    if (ok(mid)) lo = mid
    else hi = mid
  }
  return lo
}

export function solveWithdrawals(input: SolveInput): SolveResult {
  const { accounts, strategy, inflows, spending, tax } = input
  const room =
    strategy.kind === 'bracket_fill' ? traditionalRoom(accounts, tax, strategy.bracketTop, strategy.magiCap) : 0
  const evaluate = (g: number) => {
    const w = allocate(accounts, strategy, g, room)
    let drawn = 0
    for (const x of w) drawn += x
    const t = tax(deltaFor(accounts, w))
    return { w, t, net: inflows + drawn - t.total }
  }

  const zero = evaluate(0)
  if (zero.net >= spending) {
    return { withdrawals: zero.w, tax: zero.t, net: zero.net, shortfall: 0, surplus: zero.net - spending }
  }
  const maxG = totalAvailable(accounts)
  const full = evaluate(maxG)
  if (full.net <= spending) {
    return { withdrawals: full.w, tax: full.t, net: full.net, shortfall: spending - full.net, surplus: 0 }
  }

  // Root find on f(G) = net(G) - spending with f(lo) < 0 <= f(hi); the answer is the funded side (hi).
  let lo = 0
  let flo = zero.net - spending
  let hi = maxG
  let fhi = full.net - spending
  let atHi = full
  let g = Math.min(maxG, -flo) // first guess: no tax on the extra
  for (let it = 0; it < 80 && fhi >= 1 && hi - lo > 0.01; it++) {
    const r = evaluate(g)
    const f = r.net - spending
    if (f < 0) {
      lo = g
      flo = f
    } else {
      hi = g
      fhi = f
      atHi = r
    }
    // Secant step within the bracket, alternating with bisection after a few steps to guarantee progress.
    const s = hi - fhi * ((hi - lo) / (fhi - flo))
    g = it < 6 && s > lo && s < hi && Number.isFinite(s) ? s : (lo + hi) / 2
    if (f < 0 && f > -1) g = Math.min(hi, g + 2 * -f)
  }
  return { withdrawals: atHi.w, tax: atHi.t, net: atHi.net, shortfall: 0, surplus: Math.max(0, atHi.net - spending) }
}
