import { z } from 'zod'

// Ledger and budget money is exact integer cents [NFR-ARCH-12, D: OQ-LED-2]. Planning code uses float dollars and
// converts only through src/engine/money/. Checquery stored `$#,###.##` strings; migration 0004 rewrote them to
// cents, and CurrencyAmt.ts parses that legacy format for the migration only. Display
// formatting is in src/lib/format.ts.

/** An amount in integer cents. Negative amounts are allowed (Checquery accepted parenthesized negatives). */
export type Cents = number

export const centsSchema = z
  .number()
  .int('An amount must be a whole number of cents.')
  .refine(Number.isSafeInteger, 'An amount is too large.')
