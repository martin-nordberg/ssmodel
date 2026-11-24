import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { TipLabel } from '@/app/components/TipLabel.tsx'
import { usePlensFile } from '@/app/files/plensFile.ts'
import { useAccounts, useCategories } from '@/app/ledger/ledgerData.ts'
import { Input } from '@/components/ui/input'
import { acctCtgRootName } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { accountCategoryPath } from '@/ledger/accountCategories/accountTree.ts'
import type { Account } from '@/ledger/accounts/Account.ts'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'
import { isDebitNormal } from '@/ledger/transactions/register.ts'
import { todayIso } from '@/lib/dateShortcuts.ts'
import { formatCents } from '@/lib/format.ts'
import { getStoreClient, useStoreQuery } from '@/state/storeClient.ts'
import { NoPlensFile } from '../home/NoPlensFile.tsx'
import { PageHeader } from '../PageHeader.tsx'

// Past › Registers [FR-UI-19]: every account's register, by search or list, with today's balance.

const types = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE'] as const

/** Today's balance per account, in each account's normal direction. */
export function useBalances(): Map<string, number> {
  const rows = useStoreQuery(getStoreClient(), 'transactions', 'findAccountBalancesAsOf', todayIso() as IsoDate).data
  const accounts = useAccounts()
  return useMemo(() => {
    const type = new Map(accounts.map((a) => [a.id as string, a.acctType]))
    const m = new Map<string, number>()
    for (const r of rows ?? []) {
      const t = type.get(r.acctId)
      if (t) m.set(r.acctId, (isDebitNormal(t) ? 1 : -1) * (r.debit - r.credit))
    }
    return m
  }, [rows, accounts])
}

export function RegisterLink({ account, label }: { account: Account; label: string }) {
  return (
    <Link to="/past/register/$acctId" params={{ acctId: account.id }} className="hover:underline">
      {label}
    </Link>
  )
}

export function RegistersPage() {
  const file = usePlensFile((s) => s.file)
  return (
    <div className="p-4">
      <PageHeader title="Registers" description="Every account’s transactions, with today’s balance." />
      {file ? <RegisterList /> : <NoPlensFile />}
    </div>
  )
}

function RegisterList() {
  const accounts = useAccounts()
  const categories = useCategories()
  const balances = useBalances()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="grid max-w-sm gap-1">
        <TipLabel htmlFor="register-search" tip="Type part of an account or category name to narrow the list.">
          Find an account
        </TipLabel>
        <Input id="register-search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {types.map((type) => {
        const list = accounts
          .filter((a) => a.acctType === type)
          .map((a) => ({ a, path: accountCategoryPath(a, categories) }))
          .filter(({ path }) => !q || path.toLowerCase().includes(q))
          .sort((x, y) => x.path.localeCompare(y.path))
        if (list.length === 0) return null
        return (
          <section key={type} aria-label={acctCtgRootName[type]}>
            <h3 className="mb-1 font-medium">{acctCtgRootName[type]}</h3>
            <table className="w-full text-sm">
              <tbody>
                {list.map(({ a, path }) => (
                  <tr key={a.id} className="border-t">
                    <td className="py-1">
                      <RegisterLink account={a} label={path} />
                    </td>
                    <td className="py-1 text-right tabular-nums">{formatCents(balances.get(a.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
