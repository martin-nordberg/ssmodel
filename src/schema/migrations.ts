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
