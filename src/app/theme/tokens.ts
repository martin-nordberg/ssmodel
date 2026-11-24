import type { SectionId } from '@/app/sections.ts'

// The semantic color tokens [FR-UI-29], as Tailwind class names and CSS variables, so meaning lives in one place.
// Values are in src/index.css, with light and dark versions.

/** Variance relative to a budget or plan: favorable (under budget on spending, over on income) or not. */
export function varianceClass(favorable: boolean | null): string {
  if (favorable === null) return ''
  return favorable ? 'text-favorable' : 'text-unfavorable'
}

export type GoalStatus = 'on-track' | 'at-risk' | 'off-track'

export const goalStatusClass: Record<GoalStatus, string> = {
  'on-track': 'text-on-track',
  'at-risk': 'text-at-risk',
  'off-track': 'text-off-track',
}

/** One quiet hue per timeline phase [D: OQ-UI-9], for section tabs and timeline charts. */
export const phaseHue: Partial<Record<SectionId, string>> = {
  past: 'var(--phase-past)',
  thisYear: 'var(--phase-this-year)',
  nextYear: 'var(--phase-next-year)',
  goals: 'var(--phase-goals)',
  building: 'var(--phase-building)',
  retiring: 'var(--phase-retiring)',
}

/** Chart series colors, in their validated order. */
export const seriesColors = [1, 2, 3, 4, 5, 6, 7].map((n) => `var(--series-${n})`)

/**
 * A stable series color for an account or category, so it keeps the same color across charts [FR-UI-29]: chosen by
 * its id, not its position in a chart.
 */
export function seriesColorFor(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return seriesColors[(h >>> 0) % seriesColors.length]!
}
