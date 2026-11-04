// Withdrawal solver [FR-WD-1, FR-SIM-3 step 5, FR-SIM-4]. Given cash inflows that are already fixed for the year
// (benefits, earnings, required distributions, dividends), after-tax spending, and the accounts available, find
// gross withdrawals per account, following the strategy, such that inflows + withdrawals - tax = spending.
// Net cash is increasing in the total withdrawal G (marginal tax < 100%), so a 1-D root find on G suffices:
// bracketed regula falsi (Illinois) to a $1 tolerance. The inner loop works in scratch buffers so Monte Carlo runs
// do not churn the garbage collector.

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

/**
 * Tax for the year given the delta. The solver reads the returned numbers immediately and never keeps the
 * object, so implementations may reuse one scratch object across calls.
 */
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
  /** Tax outcome at the chosen withdrawals (a copy). */
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
const CASH: SolverKind[] = ['cash']

/** Taxable items created by withdrawals `w` (a fresh object). */
export function taxDelta(accounts: SolverAccount[], w: ArrayLike<number>): TaxDelta {
  return fillDelta(accounts, w, { ordinaryByPerson: [0, 0], ltcg: 0, penalty: 0 })
}

/** Fills `d` with the taxable items created by withdrawals `w`. */
function fillDelta(accounts: SolverAccount[], w: ArrayLike<number>, d: TaxDelta): TaxDelta {
  d.ordinaryByPerson[0] = 0
  d.ordinaryByPerson[1] = 0
  d.ltcg = 0
  d.penalty = 0
  for (let i = 0; i < accounts.length; i++) {
    const x = w[i]!
    if (x <= 0) continue
    const a = accounts[i]!
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
  w: Float64Array,
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
 * Allocation of a gross total G across accounts for a strategy, written into `w`. For bracket-fill,
 * `traditionalRoom` is the traditional withdrawal that fills the target bracket (computed once per year).
 */
function allocate(
  accounts: SolverAccount[],
  strategy: Strategy,
  order: SolverKind[],
  g: number,
  traditionalRoom: number,
  w: Float64Array,
) {
  w.fill(0)
  if (g <= 0) return
  switch (strategy.kind) {
    case 'bracket_fill': {
      let left = g
      const firstTrad = Math.min(traditionalRoom, g)
      left -= firstTrad - drawInOrder(accounts, w, TRADITIONAL, firstTrad, false)
      left = drawInOrder(accounts, w, ORDER_AFTER_BRACKET, left, false)
      if (left > 0) drawInOrder(accounts, w, CASH, left, true)
      return
    }
    case 'proportional': {
      const total = totalAvailable(accounts)
      if (total <= 0) return
      const frac = Math.min(1, g / total)
      for (let i = 0; i < accounts.length; i++) w[i] = Math.max(0, accounts[i]!.available) * frac
      return
    }
    default: {
      const left = drawInOrder(accounts, w, order, g, false)
      if (left > 0) drawInOrder(accounts, w, CASH, left, true)
      return
    }
  }
}

/**
 * Largest traditional withdrawal keeping ordinary taxable income <= bracketTop and MAGI <= magiCap. Both are
 * increasing, piecewise-linear functions of the withdrawal, so a bracketed secant search (Illinois variant)
 * converges in a few tax evaluations.
 */
export function traditionalRoom(accounts: SolverAccount[], tax: TaxFn, bracketTop: number, magiCap: number): number {
  let maxTrad = 0
  for (const a of accounts) if (a.kind === 'traditional' || a.kind === 'inherited_traditional') maxTrad += a.available
  if (maxTrad <= 0) return 0
  const w = new Float64Array(accounts.length)
  const d: TaxDelta = { ordinaryByPerson: [0, 0], ltcg: 0, penalty: 0 }
  const excess = (t: number) => {
    w.fill(0)
    drawInOrder(accounts, w, TRADITIONAL, t, false)
    const r = tax(fillDelta(accounts, w, d))
    return Math.max(r.ordinaryTaxable - bracketTop, r.magi - magiCap)
  }
  let lo = 0
  let flo = excess(0)
  if (flo > 0.5) return 0
  let hi = maxTrad
  let fhi = excess(hi)
  if (fhi <= 0.5) return maxTrad
  let side = 0
  for (let it = 0; it < 40 && hi - lo > 1; it++) {
    let t = hi - (fhi * (hi - lo)) / (fhi - flo)
    if (!(t > lo && t < hi)) t = (lo + hi) / 2
    const f = excess(t)
    if (f <= 0.5) {
      lo = t
      flo = f
      if (f > -0.5) break
      if (side === -1) fhi /= 2
      side = -1
    } else {
      hi = t
      fhi = f
      if (side === 1) flo /= 2
      side = 1
    }
  }
  return lo
}

export function solveWithdrawals(input: SolveInput): SolveResult {
  const { accounts, strategy, inflows, spending, tax } = input
  const n = accounts.length
  const w = new Float64Array(n)
  const d: TaxDelta = { ordinaryByPerson: [0, 0], ltcg: 0, penalty: 0 }
  const order =
    strategy.kind === 'custom'
      ? [...strategy.order, ...ORDER_CONVENTIONAL.filter((k) => !strategy.order.includes(k))]
      : ORDER_CONVENTIONAL
  let room = 0
  /** Net cash after tax at gross withdrawal g (allocation left in `w`). */
  const netAt = (g: number) => {
    allocate(accounts, strategy, order, g, room, w)
    let drawn = 0
    for (let i = 0; i < n; i++) drawn += w[i]!
    return inflows + drawn - tax(fillDelta(accounts, w, d)).total
  }
  const finish = (g: number, shortfall: number): SolveResult => {
    allocate(accounts, strategy, order, g, room, w)
    let drawn = 0
    for (let i = 0; i < n; i++) drawn += w[i]!
    const t = tax(fillDelta(accounts, w, d))
    const net = inflows + drawn - t.total
    return {
      withdrawals: Array.from(w),
      tax: { total: t.total, ordinaryTaxable: t.ordinaryTaxable, magi: t.magi },
      net,
      shortfall,
      surplus: shortfall > 0 ? 0 : Math.max(0, net - spending),
    }
  }

  const f0 = netAt(0) - spending
  if (f0 >= 0) return finish(0, 0)
  // The bracket room only matters once withdrawals are needed.
  if (strategy.kind === 'bracket_fill') room = traditionalRoom(accounts, tax, strategy.bracketTop, strategy.magiCap)
  const maxG = totalAvailable(accounts)

  // Bracket the root of f(G) = net(G) - spending, starting from the untaxed need and stepping up.
  let lo = 0
  let flo = f0
  let g = Math.min(maxG, -f0)
  let f = netAt(g) - spending
  while (f < 0) {
    if (g >= maxG) return finish(maxG, -f)
    lo = g
    flo = f
    g = Math.min(maxG, g + 1.6 * -f + 1)
    f = netAt(g) - spending
  }
  let hi = g
  let fhi = f
  // Illinois regula falsi on [lo, hi] with f(lo) < 0 <= f(hi); the answer is the funded side.
  let side = 0
  for (let it = 0; it < 60 && fhi >= 1 && hi - lo > 0.01; it++) {
    let t = hi - (fhi * (hi - lo)) / (fhi - flo)
    if (!(t > lo && t < hi)) t = (lo + hi) / 2
    const ft = netAt(t) - spending
    if (ft < 0) {
      lo = t
      flo = ft
      if (side === -1) fhi /= 2
      side = -1
    } else {
      hi = t
      fhi = ft
      if (side === 1) flo /= 2
      side = 1
    }
  }
  return finish(hi, 0)
}
