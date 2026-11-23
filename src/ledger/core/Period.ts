import { z } from 'zod'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'

export const periodRegex = /^20\d\d(-((Q1)|(Q2)|(Q3)|(Q4)|(0[1-9])|(10)|(11)|(12)))?$/

export const periodSchema = z
  .string()
  .trim()
  .regex(periodRegex, "Accounting period must match format 'YYYY', 'YYYY-MM', or 'YYYY-Q#'.")
  .brand('Period')

export type Period = z.infer<typeof periodSchema>

const asIsoDate = (s: string): IsoDate => s as IsoDate

export const getStartDate = (period: Period): IsoDate => {
  const year = period.substring(0, 4)
  const monthOrQtr = period.substring(5)

  if (monthOrQtr === '') {
    return asIsoDate(`${year}-01-01`)
  }

  switch (monthOrQtr) {
    case '01':
    case 'Q1':
      return asIsoDate(`${year}-01-01`)
    case '02':
      return asIsoDate(`${year}-02-01`)
    case '03':
      return asIsoDate(`${year}-03-01`)
    case '04':
    case 'Q2':
      return asIsoDate(`${year}-04-01`)
    case '05':
      return asIsoDate(`${year}-05-01`)
    case '06':
      return asIsoDate(`${year}-06-01`)
    case '07':
    case 'Q3':
      return asIsoDate(`${year}-07-01`)
    case '08':
      return asIsoDate(`${year}-08-01`)
    case '09':
      return asIsoDate(`${year}-09-01`)
    case '10':
    case 'Q4':
      return asIsoDate(`${year}-10-01`)
    case '11':
      return asIsoDate(`${year}-11-01`)
    case '12':
      return asIsoDate(`${year}-12-01`)
  }

  throw new Error(`Unknown period "${period}"`)
}

export const getEndDate = (period: Period): IsoDate => {
  const year = period.substring(0, 4)
  const monthOrQtr = period.substring(5)

  if (monthOrQtr === '') {
    const currentYear = new Date().getFullYear().toString()
    if (year === currentYear) {
      // Use local time, not toISOString() (UTC) — otherwise this returns
      // tomorrow's date for part of every evening in UTC-behind timezones.
      return asIsoDate(new Date().toLocaleDateString('sv'))
    }
    return asIsoDate(`${year}-12-31`)
  }

  switch (monthOrQtr) {
    case '01':
      return asIsoDate(`${year}-01-31`)
    case '02': {
      const y = parseInt(year, 10)
      const isLeap = y % 400 === 0 || (y % 4 === 0 && y % 100 !== 0)
      return asIsoDate(year + (isLeap ? '-02-29' : '-02-28'))
    }
    case '03':
    case 'Q1':
      return asIsoDate(`${year}-03-31`)
    case '04':
      return asIsoDate(`${year}-04-30`)
    case '05':
      return asIsoDate(`${year}-05-31`)
    case '06':
    case 'Q2':
      return asIsoDate(`${year}-06-30`)
    case '07':
      return asIsoDate(`${year}-07-31`)
    case '08':
      return asIsoDate(`${year}-08-31`)
    case '09':
    case 'Q3':
      return asIsoDate(`${year}-09-30`)
    case '10':
      return asIsoDate(`${year}-10-31`)
    case '11':
      return asIsoDate(`${year}-11-30`)
    case '12':
    case 'Q4':
      return asIsoDate(`${year}-12-31`)
  }

  throw new Error(`Unknown period "${period}"`)
}
