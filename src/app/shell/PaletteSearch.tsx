import { useEffect, useMemo, useState } from 'react'
import { router } from '@/app/routes.tsx'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { acctCtgRootName } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { accountCategoryPath } from '@/ledger/accountCategories/accountTree.ts'
import type { Transaction } from '@/ledger/transactions/Transaction.ts'
import { searchAmount } from '@/lib/calculator.ts'
import { formatCents, formatDate } from '@/lib/format.ts'
import { getStoreClient } from '@/state/storeClient.ts'
import { useAccounts, useCategories, useVendors } from '../ledger/ledgerData.ts'

// Ledger search in the command palette [FR-UI-26]: accounts, categories and vendors by name, and transactions by
// text or amount (from the store worker). Shown only while a ProvisionLens file is open.

const go = (to: string, params?: Record<string, string>, search?: Record<string, unknown>) =>
  void router.navigate({ to: to as '/', params: params as never, search: search as never })

export function PaletteSearch({ query, onDone }: { query: string; onDone: () => void }) {
  const q = query.trim().toLowerCase()
  const accounts = useAccounts()
  const categories = useCategories()
  const vendors = useVendors()
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    if (q.length < 2) {
      setTransactions([])
      return
    }
    let live = true
    const timer = setTimeout(() => {
      void getStoreClient()
        .query('transactions', 'searchTransactions', q, searchAmount(q), 8)
        .then(
          (list) => live && setTransactions(list),
          () => live && setTransactions([]),
        )
    }, 120)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [q])

  const matches = useMemo(() => {
    if (q.length < 2) return { accounts: [], categories: [], vendors: [] }
    return {
      accounts: accounts
        .filter((a) => a.acctType !== 'EQUITY')
        .map((a) => ({ a, label: `${acctCtgRootName[a.acctType]} : ${accountCategoryPath(a, categories)}` }))
        .filter(({ label }) => label.toLowerCase().includes(q))
        .slice(0, 8),
      categories: categories.filter((c) => c.parentCtgId !== undefined && c.name.toLowerCase().includes(q)).slice(0, 5),
      vendors: vendors.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 5),
    }
  }, [q, accounts, categories, vendors])

  if (q.length < 2) return null
  const typeOf = new Map(accounts.map((a) => [a.id as string, a.acctType]))
  const vendorName = new Map(vendors.map((v) => [v.id as string, v.name as string]))
  // Values carry the query so the palette's own filter keeps them.
  const value = (label: string) => `${label} ${query}`
  const run = (fn: () => void) => () => {
    onDone()
    fn()
  }

  return (
    <>
      {matches.accounts.length > 0 && (
        <CommandGroup heading="Accounts">
          {matches.accounts.map(({ a, label }) => (
            <CommandItem
              key={a.id}
              value={value(label)}
              onSelect={run(() => go('/past/register/$acctId', { acctId: a.id }))}
            >
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {matches.categories.length > 0 && (
        <CommandGroup heading="Categories">
          {matches.categories.map((c) => (
            <CommandItem
              key={c.id}
              value={value(`category ${c.name}`)}
              onSelect={run(() =>
                go('/setup/accounts', undefined, { type: c.acctType === 'EQUITY' ? 'ASSET' : c.acctType }),
              )}
            >
              {acctCtgRootName[c.acctType]} : {c.name}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {matches.vendors.length > 0 && (
        <CommandGroup heading="Vendors">
          {matches.vendors.map((v) => (
            <CommandItem key={v.id} value={value(`vendor ${v.name}`)} onSelect={run(() => go('/setup/vendors'))}>
              {v.name}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {transactions.length > 0 && (
        <CommandGroup heading="Transactions">
          {transactions.map((t) => {
            // Open the register of the bank or card account involved, if any, and show its amount.
            const entry =
              t.entries.find((e) => ['ASSET', 'LIABILITY'].includes(typeOf.get(e.acctId) ?? '')) ?? t.entries[0]!
            const amount = entry.debit || entry.credit
            const label = `${formatDate(t.postDate)} · ${(t.vndrId && vendorName.get(t.vndrId)) || t.description} · ${formatCents(amount)}`
            return (
              <CommandItem
                key={t.id}
                value={value(`transaction ${label}`)}
                onSelect={run(() => go('/past/register/$acctId', { acctId: entry.acctId }, { select: t.id }))}
              >
                {label}
              </CommandItem>
            )
          })}
        </CommandGroup>
      )}
    </>
  )
}
