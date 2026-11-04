import { describe, expect, test } from 'bun:test'
import { SsaAge } from '@/engine/core/dates.ts'
import {
  piaFromCurrentBenefit,
  spousalExcess,
  spousalReduction,
  survivorBenefit,
  survivorReduction,
} from '@/engine/ss/spouse.ts'

describe('spousal benefits', () => {
  // SSA: a spouse at 62 with FRA 67 gets 32.5% of the worker's PIA (50% reduced by 35%).
  test('spousal reduction at 62 with FRA 67 is 35%', () => {
    expect(spousalReduction(60)).toBeCloseTo(0.35, 10)
    expect(0.5 * (1 - spousalReduction(60))).toBeCloseTo(0.325, 10)
    expect(spousalReduction(0)).toBe(0)
    expect(spousalReduction(-5)).toBe(0)
  })

  test('derives her PIA from the current benefit', () => {
    const s = new SsaAge('1963-02-02') // FRA 2030-02, claimed 2025-03: 59 months early
    const factor = 1 - 36 * (5 / 900) - 23 * (5 / 1200)
    expect(piaFromCurrentBenefit(1400, s.attainMonth(62 * 12 + 1), s)).toBeCloseTo(1400.5 / factor, 6)
  })

  test('spousal excess uses 50% of the worker PIA and her age when it starts', () => {
    const s = new SsaAge('1963-02-02')
    // Starts at her FRA: unreduced excess.
    expect(spousalExcess(3000, 1000, s.fraMonth, s)).toBe(500)
    // Starts 24 months before her FRA: reduced by 24 * 25/36 % = 16.67%.
    expect(spousalExcess(3000, 1000, s.fraMonth - 24, s)).toBeCloseTo(500 * (1 - 24 / 144), 10)
    // Own PIA above half the worker's: no excess.
    expect(spousalExcess(3000, 1600, s.fraMonth, s)).toBe(0)
  })
})

describe('survivor benefits', () => {
  const husband = new SsaAge('1961-05-14') // FRA 2028-05, 70 in 2031-05
  const wife = new SsaAge('1963-02-02') // survivor FRA 67 (born 1962+)

  test('survivor reduction is 28.5% at 60, linear to survivor FRA', () => {
    expect(survivorReduction(wife.attainMonth(60 * 12), wife)).toBeCloseTo(0.285, 10)
    expect(survivorReduction(wife.survivorFraMonth, wife)).toBe(0)
    expect(survivorReduction(wife.attainMonth(63 * 12 + 6), wife)).toBeCloseTo(0.285 * (42 / 84), 10)
  })

  test('he claimed at 70 and dies at 75: she gets his full delayed benefit after her survivor FRA', () => {
    const b = survivorBenefit({
      deceasedPia: 3000,
      deceasedAge: husband,
      deceasedClaim: husband.age70Month,
      deceasedDeath: husband.attainMonth(75 * 12),
      survivorAge: wife,
      start: husband.attainMonth(75 * 12) + 1,
    })
    expect(b).toBeCloseTo(3000 * 1.24, 6)
  })

  test('he claimed early: RIB-LIM floor of 82.5% of PIA', () => {
    // Claimed at 65y9m: 32 months early = 82.22% of PIA; the survivor gets max(82.22%, 82.5%) = 82.5%.
    const claim = husband.fraMonth - 32
    const b = survivorBenefit({
      deceasedPia: 3000,
      deceasedAge: husband,
      deceasedClaim: claim,
      deceasedDeath: husband.attainMonth(80 * 12),
      survivorAge: wife,
      start: husband.attainMonth(80 * 12) + 1,
    })
    expect(b).toBeCloseTo(3000 * 0.825, 6)
  })

  test('he dies before FRA without claiming: based on PIA, reduced for her age', () => {
    const death = husband.attainMonth(64 * 12) // she is 62y3m
    const b = survivorBenefit({
      deceasedPia: 3000,
      deceasedAge: husband,
      deceasedClaim: null,
      deceasedDeath: death,
      survivorAge: wife,
      start: death + 1,
    })
    expect(b).toBeCloseTo(3000 * (1 - survivorReduction(death + 1, wife)), 6)
  })

  test('he dies after FRA without claiming: delayed credits to death', () => {
    const death = husband.fraMonth + 24
    const b = survivorBenefit({
      deceasedPia: 3000,
      deceasedAge: husband,
      deceasedClaim: null,
      deceasedDeath: death,
      survivorAge: wife,
      start: wife.survivorFraMonth + 1,
    })
    expect(b).toBeCloseTo(3000 * 1.16, 6)
  })
})
