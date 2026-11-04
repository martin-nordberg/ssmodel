// Return presets for accounts [FR-MC-3]: nominal arithmetic annual mean and standard deviation, before fees.
import type { ReturnSpecT } from '../../schema/model.ts'

export const RETURN_PRESETS = {
  conservative: { mean: 0.045, sd: 0.07 },
  moderate: { mean: 0.06, sd: 0.11 },
  aggressive: { mean: 0.075, sd: 0.16 },
  cash: { mean: 0.03, sd: 0.01 },
} as const

/** Explicit mean/sd override the preset; with neither, Moderate. */
export function resolveReturn(spec: ReturnSpecT | undefined): { mean: number; sd: number } {
  const preset = RETURN_PRESETS[spec?.preset ?? 'moderate']
  return { mean: spec?.mean ?? preset.mean, sd: spec?.sd ?? preset.sd }
}
