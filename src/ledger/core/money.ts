import { z } from 'zod'

// Ledger and budget money is exact integer cents [NFR-ARCH-12, D: OQ-LED-2]. Planning code uses float dollars and
// converts only through src/engine/money/. Checquery stored `$#,###.##` strings; migration 0004 rewrote them to
// cents, and CurrencyAmt.ts parses that legacy format for the migration only.

/** An amount in integer cents. Negative amounts are allowed (Checquery accepted parenthesized negatives). */
export type Cents = number

export const centsSchema = z
  .number()
  .int('An amount must be a whole number of cents.')
  .refine(Number.isSafeInteger, 'An amount is too large.')

const dollarFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Formats cents as `$1,234.56`, with negatives in parentheses: `($1,234.56)`, as Checquery displayed them. */
export function formatCents(cents: Cents): string {
  const text = dollarFormatter.format(Math.abs(cents) / 100)
  return cents < 0 ? `(${text})` : text
}
