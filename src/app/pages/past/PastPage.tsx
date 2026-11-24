import { usePlensFile } from '@/app/files/plensFile.ts'
import { useAccounts, useCategories } from '@/app/ledger/ledgerData.ts'
import { accountCategoryPath } from '@/ledger/accountCategories/accountTree.ts'
import { formatCents } from '@/lib/format.ts'
import { NoPlensFile } from '../home/NoPlensFile.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { SectionLinks } from '../SectionLinks.tsx'
import { RegisterLink, useBalances } from './RegistersPage.tsx'

/** Past: registers and reports of what has happened [FR-UI-19], with shortcuts to the primary accounts. */
export function PastPage() {
  const file = usePlensFile((s) => s.file)
  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Past" description="Registers and reports of what has happened." />
      {file ? (
        <>
          <PrimaryAccounts />
          <SectionLinks section="past" />
        </>
      ) : (
        <NoPlensFile />
      )}
    </div>
  )
}

function PrimaryAccounts() {
  const accounts = useAccounts()
  const categories = useCategories()
  const balances = useBalances()
  const primary = accounts.filter((a) => a.isPrimary)
  return (
    <section aria-label="Primary accounts" className="max-w-xl">
      <h3 className="mb-1 font-medium">Primary accounts</h3>
      {primary.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Mark the accounts you use most as primary (Setup › Accounts and categories) to list them here.
        </p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {primary.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="py-1">
                  <RegisterLink account={a} label={accountCategoryPath(a, categories)} />
                </td>
                <td className="py-1 text-right tabular-nums">{formatCents(balances.get(a.id) ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
