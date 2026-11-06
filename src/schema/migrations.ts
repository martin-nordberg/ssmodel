import { levelPayment } from '../engine/accounts/mortgage.ts'
import { parseYM } from '../engine/core/dates.ts'
import { CURRENT_SCHEMA_VERSION } from './model.ts'

type Raw = Record<string, unknown>

/**
 * Migrations keyed by the version they upgrade *from*. Each takes a raw (unvalidated) object of version n and
 * returns version n + 1 [FR-FILE-3]. A step may push notes for the user about anything it could not carry over.
 */
export const migrations: Record<number, (raw: Raw, notes: string[]) => Raw> = {
  // v2: the home's mortgage moved from a linked expense row to the home itself (balance, rate, payoff), with
  // property tax, insurance and maintenance as home costs. The balance and rate cannot be derived from the row,
  // so the link is dropped and the row is left in place (it no longer stops when the home is sold).
  1: (raw, notes) => {
    const scenarios = Array.isArray(raw.scenarios) ? raw.scenarios : []
    return {
      ...raw,
      scenarios: scenarios.map((s: unknown) => {
        if (!isObj(s) || !isObj(s.home) || !('mortgageExpense' in s.home)) return s
        const { mortgageExpense, ...home } = s.home
        notes.push(
          `Scenario "${String(s.name ?? s.id)}": the home is no longer linked to the "${String(mortgageExpense)}" ` +
            'expense. Enter the mortgage balance, rate and payoff month, plus property tax and insurance, on the ' +
            'Home screen, then remove them from Expenses.',
        )
        return { ...s, home }
      }),
    }
  },
  // v3: the mortgage is described by its monthly payment instead of a payoff month, so extra principal payments
  // shorten the loan. The payment is the level payment that retires the balance by the old payoff month.
  2: (raw, notes) => {
    const scenarios = Array.isArray(raw.scenarios) ? raw.scenarios : []
    return {
      ...raw,
      scenarios: scenarios.map((s: unknown) => {
        if (!isObj(s) || !isObj(s.home) || !isObj(s.home.mortgage)) return s
        const { payoff, ...mg } = s.home.mortgage
        const n = parseYM(String(payoff)) - parseYM(String(mg.asOf))
        const balance = Number(mg.balance)
        const payment = Math.ceil(levelPayment(balance, Number(mg.rate), Math.max(1, n)) * 100) / 100
        notes.push(
          `Scenario "${String(s.name ?? s.id)}": the mortgage now uses its monthly payment instead of a payoff ` +
            `month. It was set to $${payment.toFixed(2)}, which pays it off in ${String(payoff)}. On the Home ` +
            'screen, replace it with the principal + interest you actually pay, including any extra principal.',
        )
        return { ...s, home: { ...s.home, mortgage: { ...mg, payment } } }
      }),
    }
  },
}

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)

export function migrate(raw: Raw, fromVersion: number, notes: string[] = []): Raw {
  let current = raw
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v]
    if (!step) throw new Error(`no migration from schema version ${v}`)
    current = { ...step(current, notes), schemaVersion: v + 1 }
  }
  return current
}
