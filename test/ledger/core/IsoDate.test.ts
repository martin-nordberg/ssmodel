import { afterEach, describe, expect, it, setSystemTime } from 'bun:test'
import { isoDateSchema, isoDateToday } from '@/ledger/core/IsoDate.ts'

const check = (date: string) => {
  expect(() => isoDateSchema.parse(date)).not.toThrow()
}

describe('ISO Dates', () => {
  it('Should parse without error', () => {
    check('2026-01-01')
    check('2026-01-02')
    check('2026-01-08')
    check('2026-01-09')
    check('2026-01-10')
    check('2026-01-28')
    check('2026-01-29')
    check('2026-01-30')
    check('2026-01-31')
    check('2026-02-01')
    check('2026-02-28')
    check('2026-03-01')
    check('2026-03-31')
    check('2026-06-01')
    check('2026-06-30')
    check('2026-07-01')
    check('2026-07-31')
    check('2026-08-01')
    check('2026-11-01')
    check('2026-11-30')
    check('2026-12-01')
    check('2026-12-11')
    check('2026-12-15')
    check('2026-12-20')
    check('2026-12-27')
    check('2026-12-28')
    check('2026-12-30')
    check('2026-12-31')
  })
})

describe('isoDateToday', () => {
  const originalTz = process.env.TZ

  afterEach(() => {
    setSystemTime()
    process.env.TZ = originalTz
  })

  it('is a function that computes the date fresh on each call, not a cached value', () => {
    process.env.TZ = 'America/Los_Angeles'

    setSystemTime(new Date('2026-07-16T03:00:00Z')) // 2026-07-15 local
    expect(isoDateToday() as string).toEqual('2026-07-15')

    setSystemTime(new Date('2026-07-17T03:00:00Z')) // 2026-07-16 local
    expect(isoDateToday() as string).toEqual('2026-07-16')
  })

  it('returns a value accepted by isoDateSchema', () => {
    check(isoDateToday())
  })
})

describe('Invalid ISO Dates', () => {
  describe('invalid length', () => {
    it('rejects too short', () => {
      expect(() => isoDateSchema.parse('2026-01-1')).toThrow()
    })

    it('rejects too long', () => {
      expect(() => isoDateSchema.parse('2026-01-011')).toThrow()
    })

    it('rejects empty string', () => {
      expect(() => isoDateSchema.parse('')).toThrow()
    })
  })

  describe('invalid year', () => {
    it('rejects year before 2000', () => {
      expect(() => isoDateSchema.parse('1999-01-15')).toThrow()
    })

    it('rejects 1900s year', () => {
      expect(() => isoDateSchema.parse('1926-01-15')).toThrow()
    })

    it('rejects non-numeric year', () => {
      expect(() => isoDateSchema.parse('20XX-01-15')).toThrow()
    })

    it('rejects partial year', () => {
      expect(() => isoDateSchema.parse('202-01-15')).toThrow()
    })
  })

  describe('invalid month', () => {
    it('rejects month 00', () => {
      expect(() => isoDateSchema.parse('2026-00-15')).toThrow()
    })

    it('rejects month 13', () => {
      expect(() => isoDateSchema.parse('2026-13-15')).toThrow()
    })

    it('rejects single digit month', () => {
      expect(() => isoDateSchema.parse('2026-1-15')).toThrow()
    })

    it('rejects month with letters', () => {
      expect(() => isoDateSchema.parse('2026-0A-15')).toThrow()
    })

    it('rejects month name', () => {
      expect(() => isoDateSchema.parse('2026-Jan-15')).toThrow()
    })
  })

  describe('invalid day', () => {
    it('rejects day 00', () => {
      expect(() => isoDateSchema.parse('2026-01-00')).toThrow()
    })

    it('rejects day 32', () => {
      expect(() => isoDateSchema.parse('2026-01-32')).toThrow()
    })

    it('rejects Feb 30 in a non-leap year', () => {
      expect(() => isoDateSchema.parse('2026-02-30')).toThrow()
    })

    it('rejects Feb 29 in a non-leap year', () => {
      expect(() => isoDateSchema.parse('2026-02-29')).toThrow()
    })

    it('accepts Feb 29 in a leap year', () => {
      check('2028-02-29')
    })

    it('rejects Feb 30 in a leap year', () => {
      expect(() => isoDateSchema.parse('2028-02-30')).toThrow()
    })

    it('rejects Apr 31 (30-day month)', () => {
      expect(() => isoDateSchema.parse('2026-04-31')).toThrow()
    })

    it('accepts Apr 30 (30-day month)', () => {
      check('2026-04-30')
    })

    it('rejects Sep, Jun, Nov 31', () => {
      expect(() => isoDateSchema.parse('2026-09-31')).toThrow()
      expect(() => isoDateSchema.parse('2026-06-31')).toThrow()
      expect(() => isoDateSchema.parse('2026-11-31')).toThrow()
    })

    it('accepts Jan, Mar, May, Jul, Aug, Oct, Dec 31 (31-day months)', () => {
      check('2026-01-31')
      check('2026-03-31')
      check('2026-05-31')
      check('2026-07-31')
      check('2026-08-31')
      check('2026-10-31')
      check('2026-12-31')
    })

    it('rejects single digit day', () => {
      expect(() => isoDateSchema.parse('2026-01-1')).toThrow()
    })

    it('rejects day with letters', () => {
      expect(() => isoDateSchema.parse('2026-01-0A')).toThrow()
    })

    it('rejects day 40', () => {
      expect(() => isoDateSchema.parse('2026-01-40')).toThrow()
    })
  })

  describe('invalid separator', () => {
    it('rejects slash separator', () => {
      expect(() => isoDateSchema.parse('2026/01/15')).toThrow()
    })

    it('rejects space separator', () => {
      expect(() => isoDateSchema.parse('2026 01 15')).toThrow()
    })

    it('rejects no separator', () => {
      expect(() => isoDateSchema.parse('20260115')).toThrow()
    })

    it('rejects dot separator', () => {
      expect(() => isoDateSchema.parse('2026.01.15')).toThrow()
    })

    it('rejects mixed separators', () => {
      expect(() => isoDateSchema.parse('2026-01/15')).toThrow()
    })
  })

  describe('invalid format', () => {
    it('rejects day-month-year order', () => {
      expect(() => isoDateSchema.parse('15-01-2026')).toThrow()
    })

    it('rejects month-day-year order', () => {
      expect(() => isoDateSchema.parse('01-15-2026')).toThrow()
    })

    it('rejects extra characters at start', () => {
      expect(() => isoDateSchema.parse('x2026-01-15')).toThrow()
    })

    it('rejects extra characters at end', () => {
      expect(() => isoDateSchema.parse('2026-01-15x')).toThrow()
    })

    it('rejects timestamp format', () => {
      expect(() => isoDateSchema.parse('2026-01-15T00:00:00')).toThrow()
    })

    it('accepts and trims whitespace around valid date', () => {
      expect(isoDateSchema.parse(' 2026-01-15 ') as string).toBe('2026-01-15')
    })

    it('rejects internal whitespace', () => {
      expect(() => isoDateSchema.parse('2026- 01-15')).toThrow()
    })
  })
})
