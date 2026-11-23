import { z } from 'zod'

/** Schema for a Checquery currency amount. */
export const currencyAmtMaxLength = 20

export const currencyAmtRegex = /^((\$\d{1,3}(,\d{3})*\.\d{2})|(\(\$\d{1,3}(,\d{3})*\.\d{2}\)))$/

export const currencyAmtSchema = z
  .string()
  .trim()
  .max(currencyAmtMaxLength, `Currency amount can be at most ${currencyAmtMaxLength} characters.`)
  .regex(currencyAmtRegex, "Currency amount must match format '$#,###.##'.")
  .brand('CurrencyAmt')

export type CurrencyAmt = z.infer<typeof currencyAmtSchema>

export const toCents = (currencyAmt: CurrencyAmt): number => {
  if (currencyAmt.startsWith('(') && currencyAmt.endsWith(')')) {
    return -toCents(currencyAmt.substring(1, currencyAmt.length - 1) as CurrencyAmt)
  }
  const centsStr = currencyAmt.replace(/[$,.]/g, '')
  return parseInt(centsStr, 10)
}

const dollarFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export const fromCents = (cents: number): CurrencyAmt => {
  if (cents < 0) {
    return `(${dollarFormatter.format(-cents / 100)})` as CurrencyAmt
  }
  return dollarFormatter.format(Math.abs(cents) / 100) as CurrencyAmt
}
