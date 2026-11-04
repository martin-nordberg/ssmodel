// Sensitivity variants [FR-REC-4]: scenario edits for longevity, real return, the trust-fund cut and inheritances.
import type { ScenarioT } from '../../schema/model.ts'

export type Variant = { factor: string; label: string; apply: (s: ScenarioT) => ScenarioT }

export function sensitivityVariants(s: ScenarioT): Variant[] {
  const out: Variant[] = []
  for (const age of [75, 85, 95, 100]) {
    out.push({
      factor: 'Longevity',
      label: `Both live to ${age}`,
      apply: (x) => ({
        ...x,
        assumptions: {
          ...x.assumptions,
          mortality: { ...x.assumptions.mortality, mode: 'fixed', deathAge: { primary: age, spouse: age } },
        },
      }),
    })
  }
  for (const shift of [-0.02, 0.02]) {
    out.push({
      factor: 'Returns',
      label: `${shift > 0 ? '+' : '−'}2% a year`,
      apply: (x) => ({
        ...x,
        assumptions: {
          ...x.assumptions,
          returns: { ...x.assumptions.returns, realReturnShift: x.assumptions.returns.realReturnShift + shift },
        },
      }),
    })
  }
  out.push({
    factor: 'Trust fund',
    label: 'No cut',
    apply: (x) => ({ ...x, trustFund: { preset: 'none', steps: [] } }),
  })
  out.push({
    factor: 'Trust fund',
    label: 'Trustees 2026 (78% from 2033)',
    apply: (x) => ({ ...x, trustFund: { preset: 'trustees_2026_oasi', steps: [] } }),
  })
  if (s.inheritances.length > 0) {
    out.push({
      factor: 'Inheritances',
      label: 'Without',
      apply: (x) => ({ ...x, assumptions: { ...x.assumptions, inheritancesEnabled: false } }),
    })
    out.push({
      factor: 'Inheritances',
      label: 'With',
      apply: (x) => ({ ...x, assumptions: { ...x.assumptions, inheritancesEnabled: true } }),
    })
  }
  return out
}
