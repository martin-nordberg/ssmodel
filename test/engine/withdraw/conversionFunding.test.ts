import { describe, expect, test } from 'bun:test'
import { fundConversionTax } from '@/engine/withdraw/conversionFunding.ts'

// Q-TAX-6: gains realized to pay a conversion's tax are taxed in the same year (IRC 1001, 1(h)).
describe('fundConversionTax', () => {
  const src = { freeCash: 0, taxableBalance: 100_000, gainFrac: 1, reserveCash: 0 }

  test('the tax on the funding gain is included (fixed point)', () => {
    // $2,200 on the conversion plus 15% on an all-gain sale that pays the whole bill: T = 2200 / 0.85.
    const f = fundConversionTax((gain) => 2200 + 0.15 * gain, src)
    expect(f.tax).toBeCloseTo(2200 / 0.85, 1)
    expect(f.sold).toBeCloseTo(f.tax, 6)
    expect(f.gain).toBeCloseTo(f.tax, 6)
  })

  test('a gain in the 0% bracket adds nothing', () => {
    expect(fundConversionTax(() => 2200, src).tax).toBe(2200)
  })

  test('full basis realizes no gain', () => {
    const f = fundConversionTax((gain) => 2200 + 0.15 * gain, { ...src, gainFrac: 0 })
    expect(f.tax).toBe(2200)
    expect(f.gain).toBe(0)
  })

  test('cash above the reserve target pays first, then taxable, then the reserve', () => {
    const taxFor = (gain: number) => 5000 + 0.2 * gain
    const a = fundConversionTax(taxFor, { freeCash: 6000, taxableBalance: 10_000, gainFrac: 0.5, reserveCash: 9000 })
    expect(a.fromFreeCash).toBe(5000)
    expect(a.sold).toBe(0)
    const b = fundConversionTax(taxFor, { freeCash: 1000, taxableBalance: 10_000, gainFrac: 0.5, reserveCash: 9000 })
    // T = 5000 + 0.2 × 0.5 × (T − 1000)  =>  T = 4900 / 0.9.
    expect(b.tax).toBeCloseTo(4900 / 0.9, 1)
    expect(b.fromFreeCash).toBe(1000)
    expect(b.sold).toBeCloseTo(b.tax - 1000, 6)
    expect(b.fromReserve).toBe(0)
    const c = fundConversionTax(taxFor, { freeCash: 1000, taxableBalance: 2000, gainFrac: 0.5, reserveCash: 9000 })
    expect(c.sold).toBe(2000)
    expect(c.fromReserve).toBeCloseTo(c.tax - 3000, 6)
  })
})
