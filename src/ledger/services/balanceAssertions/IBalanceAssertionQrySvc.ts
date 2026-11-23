import type { AcctId } from '@/ledger/accounts/AcctId.ts'
import type { AsrtId } from '@/ledger/balanceAssertions/AsrtId.ts'
import type { BalanceAssertion } from '@/ledger/balanceAssertions/BalanceAssertion.ts'

export interface IBalanceAssertionQrySvc {
  /** Finds the balance assertion with given unique ID */
  findBalanceAssertionById(assertionId: AsrtId): Promise<BalanceAssertion | null>

  /** Finds the entire list of balance assertions */
  findBalanceAssertionsAll(): Promise<BalanceAssertion[]>

  /** Every non-deleted balance assertion for this account, ordered by assertionDate -- backs the register's
   *  gray assertion rows and its balance-check column (see balance-assertions-implementation-plan.md §2). */
  findBalanceAssertionsByAccount(accountId: AcctId): Promise<BalanceAssertion[]>

  /** Counts non-deleted balance assertions. */
  countBalanceAssertionsAll(): Promise<number>
}
