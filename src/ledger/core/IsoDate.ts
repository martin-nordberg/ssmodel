import { z } from 'zod'

/** Schema for a Checquery date. */
export const isoDateLength = 10

export const isoDateRegex = /^20\d\d-((0[1-9])|(10)|(11)|(12))-((0[1-9])|(1\d)|(2\d)|(30)|(31))$/

const isLeapYear = (year: number): boolean => year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)

const daysInMonth = (year: number, month: number): number =>
  [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0

/** Checks that the day is valid for the given month/year (e.g. rejects Feb 30). */
const isValidCalendarDate = (date: string): boolean => {
  const [year = 0, month = 0, day = 0] = date.split('-').map((part) => parseInt(part, 10))
  return day <= daysInMonth(year, month)
}

export const isoDateSchema = z
  .string()
  .trim()
  .length(isoDateLength, `ISO date must be ${isoDateLength} characters.`)
  .regex(isoDateRegex, "ISO date must match format 'YYYY-MM-DD'.")
  .refine(isValidCalendarDate, 'ISO date must be a valid calendar date.')
  .brand('IsoDate')

export type IsoDate = z.infer<typeof isoDateSchema>

/** Returns today's date, computed fresh on each call (not cached at module load). */
export const isoDateToday = (): IsoDate => new Date().toLocaleDateString('sv') as IsoDate

// TODO: to/fromDate
