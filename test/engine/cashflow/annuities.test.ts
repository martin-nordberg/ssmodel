import { expect, test } from 'bun:test'
import { annuityForYear, toEngineAnnuity } from '@/engine/cashflow/annuities.ts'
import { parseYM } from '@/engine/core/dates.ts'

const base = {
  label: 'SPIA',
  owner: 'primary' as const,
  monthly: 1000,
  start: '2030-07',
  colaPercent: 0.02,
  survivorPercent: 0.5,
  qualified: true,
  exclusionRatio: 0,
}
const never = parseYM('2100-01')

test('starts mid-year and grows by its COLA each anniversary', () => {
  const a = toEngineAnnuity(base)
  expect(annuityForYear(a, 2030, never, never, 0).taxable).toBe(6000)
  expect(annuityForYear(a, 2031, never, never, 0).taxable).toBeCloseTo(6 * 1000 + 6 * 1020, 6)
})

test('survivor percentage after the owner dies, nothing after both', () => {
  const a = toEngineAnnuity(base)
  const r = annuityForYear(a, 2035, parseYM('2035-03'), parseYM('2035-09'), 0)
  const pay = 1000 * 1.02 ** 4
  // Jan-Jun at the pre-anniversary rate; anniversary in July.
  expect(r.taxable).toBeCloseTo(3 * pay + 3 * pay * 0.5 + 3 * pay * 1.02 * 0.5, 6)
})

test('non-qualified exclusion stops once basis is recovered', () => {
  const a = toEngineAnnuity({
    ...base,
    qualified: false,
    exclusionRatio: 0.6,
    basis: 10000,
    colaPercent: 0,
    start: '2030-01',
  })
  const y1 = annuityForYear(a, 2030, never, never, 0)
  expect(y1.taxFree).toBeCloseTo(7200, 6)
  const y2 = annuityForYear(a, 2031, never, never, y1.recovered)
  expect(y2.taxFree).toBeCloseTo(2800, 6)
  expect(y2.taxable).toBeCloseTo(9200, 6)
})
