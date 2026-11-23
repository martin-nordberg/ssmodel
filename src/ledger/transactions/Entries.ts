import { z } from 'zod'
import { type CurrencyAmt, toCents } from '@/ledger/core/CurrencyAmt.ts'
import { entryReadSchema, entryWriteSchema } from '@/ledger/transactions/Entry.ts'

const totalsBalance = (entries: readonly { debit: CurrencyAmt; credit: CurrencyAmt }[]): boolean => {
  let totalDr = 0
  let totalCr = 0
  for (const entry of entries) {
    totalDr += toCents(entry.debit)
    totalCr += toCents(entry.credit)
  }
  return totalDr === totalCr
}

const totalsBalanceMessage = 'Total debits for all entries must match total credits.'

export const entriesWriteSchema = z
  .array(entryWriteSchema)
  .min(2)
  .refine(totalsBalance, { error: totalsBalanceMessage })

export const entriesReadSchema = z.array(entryReadSchema).min(2).refine(totalsBalance, { error: totalsBalanceMessage })
