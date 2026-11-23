import { afterEach, describe, expect, it, setSystemTime } from 'bun:test'
import { isoDateSchema } from '@/ledger/core/IsoDate.ts'
import { getEndDate, getStartDate, periodSchema } from '@/ledger/core/Period.ts'

const check = (periodStr: string, startDateStr: string, endDateStr: string) => {
  const period = periodSchema.parse(periodStr)
  const startDate = isoDateSchema.parse(startDateStr)
  const endDate = isoDateSchema.parse(endDateStr)

  expect(getStartDate(period)).toEqual(startDate)
  expect(getEndDate(period)).toEqual(endDate)
}

describe('Periods', () => {
  it('Should process months', () => {
    check('2026-01', '2026-01-01', '2026-01-31')
    check('2026-02', '2026-02-01', '2026-02-28')
    check('2026-03', '2026-03-01', '2026-03-31')
    check('2026-04', '2026-04-01', '2026-04-30')
    check('2026-05', '2026-05-01', '2026-05-31')
    check('2026-06', '2026-06-01', '2026-06-30')
    check('2026-07', '2026-07-01', '2026-07-31')
    check('2026-08', '2026-08-01', '2026-08-31')
    check('2026-09', '2026-09-01', '2026-09-30')
    check('2026-10', '2026-10-01', '2026-10-31')
    check('2026-11', '2026-11-01', '2026-11-30')
    check('2026-12', '2026-12-01', '2026-12-31')
  })

  it('Should process quarters', () => {
    check('2026-Q1', '2026-01-01', '2026-03-31')
    check('2026-Q2', '2026-04-01', '2026-06-30')
    check('2026-Q3', '2026-07-01', '2026-09-30')
    check('2026-Q4', '2026-10-01', '2026-12-31')
  })

  it('Should process years (year-to-date / full year)', () => {
    const period = periodSchema.parse('2026')
    expect(getStartDate(period) as string).toEqual('2026-01-01')
    // getEndDate("2026") for a past year returns Dec 31
    const period2025 = periodSchema.parse('2025')
    expect(getStartDate(period2025) as string).toEqual('2025-01-01')
    expect(getEndDate(period2025) as string).toEqual('2025-12-31')
  })

  describe('getEndDate for the current, in-progress year', () => {
    const originalTz = process.env.TZ

    afterEach(() => {
      setSystemTime()
      process.env.TZ = originalTz
    })

    it('uses the local date, not the UTC date, when they fall on different days', () => {
      // 8pm Pacific on 2026-07-15 is already 2026-07-16 in UTC.
      // getEndDate must report the local day, matching getFullYear()'s basis.
      process.env.TZ = 'America/Los_Angeles'
      setSystemTime(new Date('2026-07-16T03:00:00Z'))

      const period = periodSchema.parse('2026')
      expect(getEndDate(period) as string).toEqual('2026-07-15')
    })

    it("stays within the requested year even late on New Year's Eve local time", () => {
      // 8pm Pacific on 2025-12-31 is already 2026-01-01 in UTC.
      process.env.TZ = 'America/Los_Angeles'
      setSystemTime(new Date('2026-01-01T04:00:00Z'))

      const period = periodSchema.parse('2025')
      expect(getEndDate(period) as string).toEqual('2025-12-31')
    })
  })

  it('Should handle leap years', () => {
    check('2027-02', '2027-02-01', '2027-02-28')
    check('2028-02', '2028-02-01', '2028-02-29')
    check('2029-02', '2029-02-01', '2029-02-28')
    check('2030-02', '2030-02-01', '2030-02-28')
    check('2031-02', '2031-02-01', '2031-02-28')
    check('2032-02', '2032-02-01', '2032-02-29')
    check('2036-02', '2036-02-01', '2036-02-29')
    check('2037-02', '2037-02-01', '2037-02-28')
    check('2040-02', '2040-02-01', '2040-02-29')
  })
})

describe('Invalid Periods', () => {
  describe('invalid length', () => {
    it('rejects too short', () => {
      expect(() => periodSchema.parse('2026-1')).toThrow()
    })

    it('rejects too long', () => {
      expect(() => periodSchema.parse('2026-011')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => periodSchema.parse('')).toThrow()
    })
  })

  describe('invalid year', () => {
    it('rejects year before 2000', () => {
      expect(() => periodSchema.parse('1999-01')).toThrow()
    })

    it('rejects 1900s year', () => {
      expect(() => periodSchema.parse('1926-01')).toThrow()
    })

    it('rejects non-numeric year', () => {
      expect(() => periodSchema.parse('20XX-01')).toThrow()
    })

    it('rejects partial year', () => {
      expect(() => periodSchema.parse('202-01')).toThrow()
    })
  })

  describe('invalid month', () => {
    it('rejects month 00', () => {
      expect(() => periodSchema.parse('2026-00')).toThrow()
    })

    it('rejects month 13', () => {
      expect(() => periodSchema.parse('2026-13')).toThrow()
    })

    it('rejects single digit month without leading zero', () => {
      expect(() => periodSchema.parse('2026-1')).toThrow()
    })

    it('rejects month with letters', () => {
      expect(() => periodSchema.parse('2026-0A')).toThrow()
    })

    it('rejects month name', () => {
      expect(() => periodSchema.parse('2026-Jan')).toThrow()
    })
  })

  describe('invalid quarter', () => {
    it('rejects Q0', () => {
      expect(() => periodSchema.parse('2026-Q0')).toThrow()
    })

    it('rejects Q5', () => {
      expect(() => periodSchema.parse('2026-Q5')).toThrow()
    })

    it('rejects lowercase q1', () => {
      expect(() => periodSchema.parse('2026-q1')).toThrow()
    })

    it('rejects quarter without Q prefix', () => {
      expect(() => periodSchema.parse('2026-01Q')).toThrow()
    })
  })

  describe('invalid separator', () => {
    it('rejects slash separator', () => {
      expect(() => periodSchema.parse('2026/01')).toThrow()
    })

    it('rejects space separator', () => {
      expect(() => periodSchema.parse('2026 01')).toThrow()
    })

    it('rejects no separator', () => {
      expect(() => periodSchema.parse('202601')).toThrow()
    })

    it('rejects dot separator', () => {
      expect(() => periodSchema.parse('2026.01')).toThrow()
    })
  })

  describe('invalid format', () => {
    it('rejects month-year order', () => {
      expect(() => periodSchema.parse('01-2026')).toThrow()
    })

    it('rejects extra characters at start', () => {
      expect(() => periodSchema.parse('x2026-01')).toThrow()
    })

    it('rejects extra characters at end', () => {
      expect(() => periodSchema.parse('2026-01x')).toThrow()
    })

    it('rejects full date format', () => {
      expect(() => periodSchema.parse('2026-01-01')).toThrow()
    })

    it('accepts and trims whitespace around valid period', () => {
      // Schema trims before length check
      expect(periodSchema.parse(' 2026-01 ') as string).toBe('2026-01')
    })

    it('rejects internal whitespace', () => {
      expect(() => periodSchema.parse('2026- 01')).toThrow()
    })
  })
})
