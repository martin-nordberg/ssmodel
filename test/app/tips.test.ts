import { expect, test } from 'bun:test'
import { TIPS } from '@/app/tips.ts'

// Every label and column tooltip is 5–40 words.
test('tooltips are 5 to 40 words', () => {
  const bad = Object.entries(TIPS)
    .map(([k, v]) => [k, v.split(/\s+/).filter(Boolean).length] as const)
    .filter(([, n]) => n < 5 || n > 40)
  expect(bad).toEqual([])
})
