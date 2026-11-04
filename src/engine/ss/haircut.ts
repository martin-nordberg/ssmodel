// Trust-fund benefit haircut schedule [FR-TF-1, FR-TF-2]: a step function applied to all benefits.
import { parseYM, type YM } from '../core/dates.ts'
import { ssaRules } from '../rules/tables.ts'

export type TrustFundInput = {
  preset: 'none' | 'trustees_2026_oasi' | 'trustees_2026_oasdi' | 'custom'
  steps: { effective: string; payablePercent: number }[]
}

export type Haircut = (month: YM) => number

export function haircutSchedule(tf: TrustFundInput): Haircut {
  const raw = tf.preset === 'custom' ? tf.steps : ssaRules.trusteesPreset(tf.preset)
  const steps = raw
    .map((s) => ({ from: parseYM(s.effective), factor: s.payablePercent / 100 }))
    .sort((a, b) => a.from - b.from)
  return (month) => {
    let f = 1
    for (const s of steps) if (month >= s.from) f = s.factor
    return f
  }
}
