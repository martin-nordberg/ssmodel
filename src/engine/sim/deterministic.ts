// Deterministic path [FR-MC-3 deterministic]: mean inflation and returns every year, fixed death ages.
import type { YM } from '../core/dates.ts'
import type { YearTrace } from '../explain/trace.ts'
import type { EnginePerson, Prepared } from '../model/prepare.ts'
import { drawInheritances } from './inheritance.ts'
import { type PathDraws, type PathResult, runPath } from './path.ts'

/** Last month alive for someone who lives through the year of the given age. */
export function fixedDeathMonth(person: EnginePerson): YM {
  return person.age.attainMonth((Math.floor(person.fixedDeathAge) + 1) * 12) - 1
}

export function deterministicDraws(prep: Prepared): PathDraws {
  const n = prep.endYear - prep.baseYear + 1
  const asm = prep.scenario.assumptions
  const shift = asm.returns.realReturnShift
  return {
    inflation: new Float64Array(n).fill(asm.inflation.mean),
    returns: prep.accounts.map((a) => new Float64Array(n).fill(a.mean + (a.kind === 'cash' ? 0 : shift))),
    deathMonth: [fixedDeathMonth(prep.people[0]), fixedDeathMonth(prep.people[1])],
    inheritances: drawInheritances(prep.inheritances, prep.baseYM, 0, null),
    propertyReturns: prep.properties.map((pr) => new Float64Array(n).fill(pr.mean)),
  }
}

export function runDeterministic(prep: Prepared, claim: YM, recordRows = true, trace?: YearTrace): PathResult {
  return runPath(prep, claim, deterministicDraws(prep), { recordRows, trace })
}
