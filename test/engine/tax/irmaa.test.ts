import { describe, expect, test } from 'bun:test'
import { healthcareCost } from '@/engine/cashflow/healthcare.ts'
import { medicareRules } from '@/engine/rules/tables.ts'
import { irmaaHeadroom, irmaaTier, monthlyPremiums } from '@/engine/tax/irmaa.ts'

const m = medicareRules.params(2026).value

describe('IRMAA', () => {
  test('tiers apply above each threshold', () => {
    expect(irmaaTier(218000, 'mfj', m)).toBe(0)
    expect(irmaaTier(218001, 'mfj', m)).toBe(1)
    expect(irmaaTier(400000, 'mfj', m)).toBe(3)
    expect(irmaaTier(800000, 'mfj', m)).toBe(5)
    expect(irmaaTier(110000, 'single', m)).toBe(1)
  })
  test('premiums by tier (2026)', () => {
    expect(monthlyPremiums(0, m)).toEqual({ partB: 202.9, partDSurcharge: 0 })
    expect(monthlyPremiums(1, m)).toEqual({ partB: 284.1, partDSurcharge: 14.5 })
  })
  test('headroom to the next tier', () => {
    expect(irmaaHeadroom(200000, 0, 'mfj', m)).toBe(18000)
    expect(irmaaHeadroom(200000, 5, 'mfj', m)).toBe(Number.POSITIVE_INFINITY)
  })
  test('projected thresholds scale with prices, premiums with medical costs', () => {
    const p = medicareRules.params(2028, 1.05, 1.1)
    expect(p.projected).toBe(true)
    expect(p.value.thresholds.mfj[0]).toBeCloseTo(218000 * 1.05, 6)
    expect(p.value.partBStandardMonthly).toBeCloseTo(202.9 * 1.1, 6)
  })
})

describe('healthcareCost', () => {
  const costs = {
    medicare: m,
    medicalFactor: 1,
    pre65: { cobraMonthly: 1000, outOfPocket: 3000 },
    medicareCosts: { medigapAnnual: 2400, outOfPocket: 1200 },
  }
  test('turning 65 in July: 6 COBRA months then 6 Medicare months', () => {
    const c = healthcareCost({ ...costs, cobraMonths: 6, pre65Months: 6, medicareMonths: 6, irmaaTier: 0 })
    expect(c.cobra).toBe(6000)
    expect(c.partBD).toBeCloseTo(6 * (202.9 + 38.99), 6)
    expect(c.medigap).toBe(1200)
    expect(c.outOfPocket).toBe(1500 + 600)
    expect(c.irmaaSurcharge).toBe(0)
  })
  test('IRMAA surcharge for a full year at tier 2', () => {
    const c = healthcareCost({ ...costs, cobraMonths: 0, pre65Months: 0, medicareMonths: 12, irmaaTier: 2 })
    expect(c.irmaaSurcharge).toBeCloseTo(12 * (405.8 - 202.9 + 37.5), 6)
    expect(c.hsaQualified).toBeCloseTo(c.partBD + c.outOfPocket, 6)
  })
  test('medical inflation scales user inputs', () => {
    const c = healthcareCost({
      ...costs,
      medicalFactor: 1.2,
      cobraMonths: 12,
      pre65Months: 12,
      medicareMonths: 0,
      irmaaTier: 0,
    })
    expect(c.cobra).toBeCloseTo(14400, 6)
    expect(c.outOfPocket).toBeCloseTo(3600, 6)
  })
})
