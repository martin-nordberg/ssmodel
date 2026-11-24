import { useMemo } from 'react'
import { usePlensFile } from '@/app/files/plensFile.ts'
import { useAccounts, useCategories, useVendors } from '@/app/ledger/ledgerData.ts'
import { accountCategoryPath } from '@/ledger/accountCategories/accountTree.ts'
import type { Account } from '@/ledger/accounts/Account.ts'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'
import { buildRegisterLines, buildRegisterRows, isDebitNormal } from '@/ledger/transactions/register.ts'
import { todayIso } from '@/lib/dateShortcuts.ts'
import { formatCents, formatDate } from '@/lib/format.ts'
import { cn } from '@/lib/utils'
import { getStoreClient, useStoreQuery } from '@/state/storeClient.ts'
import { NoPlensFile } from '../home/NoPlensFile.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { RegisterLink } from './RegistersPage.tsx'

// Past › Income Log and Expense Log [FR-LED-3]: each income or expense account's log (its register without a
// running balance), primary accounts first, with this year's total. Past › Balance checks: every balance check
// and whether the register agrees with it [FR-LED-1].

export function LogsPage({ type }: { type: 'INCOME' | 'EXPENSE' }) {
  const file = usePlensFile((s) => s.file)
  const title = type === 'INCOME' ? 'Income Log' : 'Expense Log'
  return (
    <div className="p-4">
      <PageHeader
        title={title}
        description={`Each ${type === 'INCOME' ? 'income' : 'expense'} account’s transactions, with this year’s total.`}
      />
      {file ? <LogList type={type} /> : <NoPlensFile />}
    </div>
  )
}

function LogList({ type }: { type: 'INCOME' | 'EXPENSE' }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const year = todayIso().slice(0, 4)
  const totals =
    useStoreQuery(
      getStoreClient(),
      'transactions',
      'findAccountBalancesForPeriod',
      `${year}-01-01` as IsoDate,
      `${year}-12-31` as IsoDate,
    ).data ?? []
  const totalOf = (a: Account) => {
    const r = totals.find((t) => t.acctId === a.id)
    return r ? (isDebitNormal(a.acctType) ? 1 : -1) * (r.debit - r.credit) : 0
  }
  const list = accounts
    .filter((a) => a.acctType === type)
    .map((a) => ({ a, path: accountCategoryPath(a, categories) }))
    .sort((x, y) => Number(y.a.isPrimary) - Number(x.a.isPrimary) || x.path.localeCompare(y.path))
  if (list.length === 0) {
    return <p className="text-muted-foreground text-sm">No {type === 'INCOME' ? 'income' : 'expense'} accounts yet.</p>
  }
  return (
    <table className="w-full max-w-2xl text-sm">
      <thead className="text-left text-muted-foreground text-xs">
        <tr>
          <th className="py-1 font-normal">Account</th>
          <th className="py-1 text-right font-normal">{year} so far</th>
        </tr>
      </thead>
      <tbody>
        {list.map(({ a, path }) => (
          <tr key={a.id} className="border-t">
            <td className="py-1">
              <RegisterLink account={a} label={path} />
              {a.isPrimary && <span className="text-muted-foreground text-xs"> · primary</span>}
            </td>
            <td className="py-1 text-right tabular-nums">{formatCents(totalOf(a))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function BalanceChecksPage() {
  const file = usePlensFile((s) => s.file)
  return (
    <div className="p-4">
      <PageHeader
        title="Balance checks"
        description="Statement balances you recorded, and whether each register agrees. Add them from a register."
      />
      {file ? <ChecksList /> : <NoPlensFile />}
    </div>
  )
}

const NONE: never[] = []

function ChecksList() {
  const assertions = useStoreQuery(getStoreClient(), 'balanceAssertions', 'findBalanceAssertionsAll').data ?? NONE
  const accounts = useAccounts()
  const categories = useCategories()
  const acctIds = useMemo(() => [...new Set(assertions.map((a) => a.acctId as string))], [assertions])
  if (assertions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No balance checks yet. In an account’s register, press B on a row (or use Add balance check) to record a
        statement balance.
      </p>
    )
  }
  return (
    <table className="w-full max-w-3xl text-sm">
      <thead className="text-left text-muted-foreground text-xs">
        <tr>
          <th className="py-1 font-normal">Account</th>
          <th className="py-1 font-normal">Date</th>
          <th className="py-1 text-right font-normal">Statement</th>
          <th className="py-1 text-right font-normal">Register</th>
          <th className="py-1 font-normal">Status</th>
        </tr>
      </thead>
      {acctIds.map((id) => {
        const account = accounts.find((a) => a.id === id)
        return account ? (
          <AccountChecks key={id} account={account} label={accountCategoryPath(account, categories)} />
        ) : null
      })}
    </table>
  )
}

/** One account's checks, computed from its register (balances by transaction date, as the register shows them). */
function AccountChecks({ account, label }: { account: Account; label: string }) {
  const client = getStoreClient()
  const transactions = useStoreQuery(client, 'transactions', 'findTransactionsByAccount', account.id).data ?? NONE
  const assertions =
    useStoreQuery(client, 'balanceAssertions', 'findBalanceAssertionsByAccount', account.id).data ?? NONE
  const vendors = useVendors()
  const rows = useMemo(
    () =>
      buildRegisterRows(buildRegisterLines(transactions, [], vendors, account.id, account.acctType), assertions).filter(
        (r) => r.kind === 'assertion',
      ),
    [transactions, assertions, vendors, account],
  )
  return (
    <tbody>
      {rows.map(
        (r) =>
          r.kind === 'assertion' && (
            <tr key={r.assertion.id} className={cn('border-t', !r.matches && 'text-warning')}>
              <td className="py-1">
                <RegisterLink account={account} label={label} />
              </td>
              <td className="py-1">{formatDate(r.assertion.assertionDate)}</td>
              <td className="py-1 text-right tabular-nums">{formatCents(r.assertion.balance)}</td>
              <td className="py-1 text-right tabular-nums">{formatCents(r.balance)}</td>
              <td className="py-1">{r.matches ? 'Confirmed' : `Out by ${formatCents(Math.abs(r.difference))}`}</td>
            </tr>
          ),
      )}
    </tbody>
  )
}
