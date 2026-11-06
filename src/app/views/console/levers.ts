// Default Console levers [FR-UI-7]. Each maps a scenario value to a lever and back to what-if override entries.
import { parseCurrency, parseNumber, parsePercent } from '@/app/components/grid/parse.ts'
import { TIPS } from '@/app/tips.ts'
import type { ScenarioT } from '@/schema/model.ts'

export type SliderLever = {
  kind: 'slider'
  id: string
  label: string
  /** Tooltip on the label (5–40 words). */
  tip: string
  min: number
  max: number
  step: number
  get: (s: ScenarioT) => number
  /** Override entries (scenario-relative dotted path -> value) for a new lever value. */
  set: (v: number, s: ScenarioT) => [string, unknown][]
  format: (v: number) => string
  parse: (t: string) => number | null
  show?: (s: ScenarioT) => boolean
}

export type SegmentLever = {
  kind: 'segment'
  id: string
  label: string
  /** Tooltip on the label (5–40 words). */
  tip: string
  options: { value: string; label: string }[]
  get: (s: ScenarioT) => string
  set: (v: string, s: ScenarioT) => [string, unknown][]
  show?: (s: ScenarioT) => boolean
}

export type LeverDef = SliderLever | SegmentLever

/** Drops trailing zeros after a decimal point only ("90" stays "90"; "2.50" becomes "2.5"). */
export const trimZeros = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s)
const pct =
  (digits = 2) =>
  (v: number) =>
    `${trimZeros((v * 100).toFixed(digits))}%`
const num =
  (digits = 2) =>
  (v: number) =>
    trimZeros(v.toFixed(digits))
const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
const ok = <T>(r: { ok: true; value: T } | { ok: false }) => (r.ok ? r.value : null)
const parsePct = (t: string) => ok(parsePercent(t))
const parseNum = (t: string) => ok(parseNumber(t))
const parseMoney = (t: string) => ok(parseCurrency(t))

/** Current trust-fund cut as (payable %, start year). */
function trustFund(s: ScenarioT): { pct: number; year: number } {
  const steps = s.trustFund.preset === 'custom' ? s.trustFund.steps : s.trustFund.preset === 'none' ? [] : null
  if (steps === null)
    return s.trustFund.preset === 'trustees_2026_oasdi' ? { pct: 83, year: 2034 } : { pct: 78, year: 2033 }
  const first = steps[0]
  return first ? { pct: first.payablePercent, year: Number(first.effective.slice(0, 4)) } : { pct: 100, year: 2033 }
}
const customTrust = (p: number, y: number): [string, unknown][] => [
  ['trustFund', { preset: 'custom', steps: p >= 100 ? [] : [{ effective: `${y}-01`, payablePercent: p }] }],
]

export const DEFAULT_LEVERS: LeverDef[] = [
  {
    kind: 'slider',
    id: 'inflation',
    label: 'Inflation (mean)',
    tip: TIPS['assumptions.inflation.mean'],
    min: 0.01,
    max: 0.06,
    step: 0.0025,
    get: (s) => s.assumptions.inflation.mean,
    set: (v) => [['assumptions.inflation.mean', v]],
    format: pct(2),
    parse: parsePct,
  },
  {
    kind: 'slider',
    id: 'returnShift',
    label: 'Return shift (all accounts)',
    tip: TIPS['assumptions.returns.realReturnShift'],
    min: -0.03,
    max: 0.03,
    step: 0.0025,
    get: (s) => s.assumptions.returns.realReturnShift,
    set: (v) => [['assumptions.returns.realReturnShift', v]],
    format: (v) => `${v >= 0 ? '+' : ''}${pct(2)(v)}`,
    parse: (t) => {
      const v = parsePct(t.replace('+', ''))
      return v
    },
  },
  {
    kind: 'slider',
    id: 'vol',
    label: 'Volatility multiplier',
    tip: TIPS['assumptions.returns.volatilityMultiplier'],
    min: 0.5,
    max: 1.5,
    step: 0.05,
    get: (s) => s.assumptions.returns.volatilityMultiplier,
    set: (v) => [['assumptions.returns.volatilityMultiplier', v]],
    format: (v) => `${num(2)(v)}×`,
    parse: (t) => parseNum(t.replace('×', '').replace('x', '')),
  },
  {
    kind: 'segment',
    id: 'mortality',
    label: 'Mortality',
    tip: TIPS['assumptions.mortality.mode'],
    options: [
      { value: 'stochastic', label: 'Life table' },
      { value: 'fixed', label: 'Fixed ages' },
    ],
    get: (s) => s.assumptions.mortality.mode,
    set: (v) => [['assumptions.mortality.mode', v]],
  },
  {
    kind: 'slider',
    id: 'deathP',
    label: 'Death age — primary',
    tip: TIPS['assumptions.mortality.deathAge'],
    min: 70,
    max: 105,
    step: 1,
    get: (s) => s.assumptions.mortality.deathAge.primary,
    set: (v) => [['assumptions.mortality.deathAge.primary', v]],
    format: num(0),
    parse: parseNum,
    show: (s) => s.assumptions.mortality.mode === 'fixed',
  },
  {
    kind: 'slider',
    id: 'deathS',
    label: 'Death age — spouse',
    tip: TIPS['assumptions.mortality.deathAge'],
    min: 70,
    max: 105,
    step: 1,
    get: (s) => s.assumptions.mortality.deathAge.spouse,
    set: (v) => [['assumptions.mortality.deathAge.spouse', v]],
    format: num(0),
    parse: parseNum,
    show: (s) => s.assumptions.mortality.mode === 'fixed',
  },
  {
    kind: 'slider',
    id: 'tfPct',
    label: 'Trust fund: payable %',
    tip: TIPS['lever.trustFundPercent'],
    min: 60,
    max: 100,
    step: 1,
    get: (s) => trustFund(s).pct,
    set: (v, s) => customTrust(v, trustFund(s).year),
    format: (v) => `${num(0)(v)}%`,
    parse: (t) => parseNum(t.replace('%', '')),
  },
  {
    kind: 'slider',
    id: 'tfYear',
    label: 'Trust fund: cut starts',
    tip: TIPS['lever.trustFundYear'],
    min: 2030,
    max: 2040,
    step: 1,
    get: (s) => trustFund(s).year,
    set: (v, s) => customTrust(trustFund(s).pct, v),
    format: num(0),
    parse: parseNum,
  },
  {
    kind: 'slider',
    id: 'survivor',
    label: 'Survivor spending',
    tip: TIPS['expenses.survivorFraction'],
    min: 0.5,
    max: 1,
    step: 0.05,
    get: (s) => s.expenses.survivorFraction,
    set: (v) => [['expenses.survivorFraction', v]],
    format: pct(0),
    parse: parsePct,
  },
  {
    kind: 'slider',
    id: 'expenseScale',
    label: 'Nondiscretionary spending',
    tip: TIPS['assumptions.expenseScale'],
    min: 0.7,
    max: 1.3,
    step: 0.05,
    get: (s) => s.assumptions.expenseScale,
    set: (v) => [['assumptions.expenseScale', v]],
    format: pct(0),
    parse: parsePct,
  },
  {
    kind: 'slider',
    id: 'discretionaryScale',
    label: 'Discretionary spending',
    tip: TIPS['assumptions.discretionaryScale'],
    min: 0,
    max: 1.5,
    step: 0.05,
    get: (s) => s.assumptions.discretionaryScale,
    set: (v) => [['assumptions.discretionaryScale', v]],
    format: pct(0),
    parse: parsePct,
  },
  {
    kind: 'segment',
    id: 'roth',
    label: 'Roth conversions',
    tip: TIPS['lever.roth'],
    options: [
      { value: 'off', label: 'Off' },
      { value: '0.12', label: '12%' },
      { value: '0.22', label: '22%' },
      { value: '0.24', label: '24%' },
    ],
    get: (s) => (s.strategy.rothConversions.enabled ? String(s.strategy.rothConversions.upToBracket) : 'off'),
    set: (v, s) => [
      [
        'strategy.rothConversions',
        v === 'off'
          ? { ...s.strategy.rothConversions, enabled: false }
          : { ...s.strategy.rothConversions, enabled: true, upToBracket: Number(v) },
      ],
    ],
  },
  {
    kind: 'segment',
    id: 'withdrawal',
    label: 'Withdrawal strategy',
    tip: TIPS['strategy.withdrawal'],
    options: [
      { value: 'conventional', label: 'Conventional' },
      { value: 'bracket_fill', label: 'Bracket-fill' },
      { value: 'proportional', label: 'Proportional' },
    ],
    get: (s) => s.strategy.withdrawal,
    set: (v) => [['strategy.withdrawal', v]],
  },
  {
    kind: 'segment',
    id: 'inheritOn',
    label: 'Inheritances',
    tip: TIPS['lever.inheritancesEnabled'],
    options: [
      { value: 'on', label: 'Included' },
      { value: 'off', label: 'Excluded' },
    ],
    get: (s) => (s.assumptions.inheritancesEnabled ? 'on' : 'off'),
    set: (v) => [['assumptions.inheritancesEnabled', v === 'on']],
    show: (s) => s.inheritances.length > 0,
  },
  {
    kind: 'slider',
    id: 'inheritScale',
    label: 'Inheritance amount',
    tip: TIPS['lever.inheritanceScale'],
    min: 0,
    max: 1.5,
    step: 0.05,
    get: (s) => s.assumptions.inheritanceScale,
    set: (v) => [['assumptions.inheritanceScale', v]],
    format: pct(0),
    parse: parsePct,
    show: (s) => s.inheritances.length > 0 && s.assumptions.inheritancesEnabled,
  },
  {
    kind: 'slider',
    id: 'bequest',
    label: 'Bequest target',
    tip: TIPS['expenses.bequestTarget'],
    min: 0,
    max: 1_000_000,
    step: 25_000,
    get: (s) => s.expenses.bequestTarget,
    set: (v) => [['expenses.bequestTarget', v]],
    format: money,
    parse: parseMoney,
  },
  {
    kind: 'slider',
    id: 'successFloor',
    label: 'Success floor',
    tip: TIPS['objective.successFloor'],
    min: 0.7,
    max: 0.99,
    step: 0.01,
    get: (s) => s.objective.successFloor,
    set: (v) => [['objective.successFloor', v]],
    format: pct(0),
    parse: parsePct,
  },
]

/** Generic formatting for a promoted lever, guessed from its range. */
export function promotedFormat(
  min: number,
  max: number,
): { format: (v: number) => string; parse: (t: string) => number | null } {
  if (max <= 1 && min >= -1) return { format: pct(2), parse: parsePct }
  if (max >= 1000) return { format: money, parse: parseMoney }
  return { format: num(3), parse: parseNum }
}

/** "healthcare.medicalInflationSpread" -> "Medical inflation spread". */
export function humanizePath(path: string): string {
  const last = path.split('.').at(-1) ?? path
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
