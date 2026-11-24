import { expect, test } from 'bun:test'
import { searchAmount } from '@/lib/calculator.ts'

// FR-UI-26: which searches also look for an amount.
test('numbers are searched as amounts; words and zero are not', () => {
  expect(searchAmount('50')).toBe(5000)
  expect(searchAmount('$1,234.56')).toBe(123456)
  expect(searchAmount(' 45.5 ')).toBe(4550)
  expect(searchAmount('grocer')).toBeNull()
  expect(searchAmount('1042 check')).toBeNull()
  expect(searchAmount('0')).toBeNull()
})
