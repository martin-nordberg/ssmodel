// Rates: https://www.ssa.gov/oact/progdata/oasdiRates.html (OASDI employee rate by year).
import { expect, test } from 'bun:test'
import { ssaRules } from '@/engine/rules/tables.ts'
import { employeeSsTaxPaid } from '@/engine/ss/taxesPaid.ts'

test('employee OASDI rate by year', () => {
  expect(ssaRules.oasdiEmployeeRate(1937)).toBe(0.01)
  expect(ssaRules.oasdiEmployeeRate(1977)).toBe(0.0495)
  expect(ssaRules.oasdiEmployeeRate(1989)).toBe(0.0606)
  expect(ssaRules.oasdiEmployeeRate(2000)).toBe(0.062)
  expect(ssaRules.oasdiEmployeeRate(2011)).toBe(0.042) // payroll tax holiday
  expect(ssaRules.oasdiEmployeeRate(2012)).toBe(0.042)
  expect(ssaRules.oasdiEmployeeRate(2013)).toBe(0.062)
  expect(ssaRules.oasdiEmployeeRate(2040)).toBe(0.062)
})

test('sums amount x rate across the record', () => {
  expect(employeeSsTaxPaid([])).toBe(0)
  const total = employeeSsTaxPaid([
    { year: 1985, amount: 10_000 },
    { year: 2011, amount: 50_000 },
    { year: 2024, amount: 100_000 },
  ])
  expect(total).toBeCloseTo(570 + 2_100 + 6_200, 6)
})
