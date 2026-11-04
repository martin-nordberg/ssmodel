import { expect, test } from 'bun:test'
import { parseYM } from '@/engine/core/dates.ts'
import { haircutSchedule } from '@/engine/ss/haircut.ts'

test('presets', () => {
  const none = haircutSchedule({ preset: 'none', steps: [] })
  expect(none(parseYM('2040-01'))).toBe(1)
  const oasi = haircutSchedule({ preset: 'trustees_2026_oasi', steps: [] })
  expect(oasi(parseYM('2032-12'))).toBe(1)
  expect(oasi(parseYM('2033-01'))).toBe(0.78)
  const oasdi = haircutSchedule({ preset: 'trustees_2026_oasdi', steps: [] })
  expect(oasdi(parseYM('2034-06'))).toBe(1)
  expect(oasdi(parseYM('2034-07'))).toBe(0.83)
})

test('custom steps apply in order regardless of listing order', () => {
  const h = haircutSchedule({
    preset: 'custom',
    steps: [
      { effective: '2040-01', payablePercent: 70 },
      { effective: '2032-01', payablePercent: 80 },
    ],
  })
  expect(h(parseYM('2031-12'))).toBe(1)
  expect(h(parseYM('2035-06'))).toBe(0.8)
  expect(h(parseYM('2041-01'))).toBe(0.7)
})

test('custom preset ignores steps when preset is not custom', () => {
  const h = haircutSchedule({ preset: 'none', steps: [{ effective: '2030-01', payablePercent: 50 }] })
  expect(h(parseYM('2031-01'))).toBe(1)
})
