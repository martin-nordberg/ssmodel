import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo } from 'react'
import { PeriodPicker, periodLabel } from '@/app/components/PeriodPicker.tsx'
import { ReportTemplate } from '@/app/components/templates/templates.tsx'
import { usePlensFile } from '@/app/files/plensFile.ts'
import { useAccounts, useCategories, useVendors } from '@/app/ledger/ledgerData.ts'
import type { Crumb } from '@/app/shell/Breadcrumbs.tsx'
import type { IsoDate } from '@/ledger/core/IsoDate.ts'
import { getEndDate, getStartDate, type Period } from '@/ledger/core/Period.ts'
import {
  buildBalanceSheet,
  buildIncomeStatement,
  incomeStatementEntries,
  type RollupSection,
} from '@/ledger/reports/statements.ts'
import { formatCents, formatDate } from '@/lib/format.ts'
import { cn } from '@/lib/utils'
import { getStoreClient, useStoreQuery } from '@/state/storeClient.ts'
import { NoPlensFile } from '../../home/NoPlensFile.tsx'
import { PageHeader } from '../../PageHeader.tsx'

// Past › Balance Sheet and Income Statement [FR-LED-2, FR-LED-3, RPT-LED-1, RPT-LED-2 base versions], by year,
// quarter or month (Report template). Every account amount opens its register, with the trail back [FR-RPT-3].

const NONE: never[] = []

/** The default period: this year. */
export function defaultPeriod(): string {
  return String(new Date().getFullYear())
}

function Section({
  section,
  trail,
  testId,
  renderAccount,
}: {
  section: RollupSection
  trail: Crumb[]
  testId: string
  renderAccount?: (id: string) => React.ReactNode
}) {
  return (
    <tbody data-testid={testId}>
      <tr className="border-b">
        <th colSpan={2} className="pt-3 pb-1 text-left font-semibold">
          {section.heading}
        </th>
      </tr>
      {section.lines.map((line) => (
        <FragmentRows key={line.id}>
          <tr className={cn('border-b border-border/50', line.kind === 'category' && 'font-medium')}>
            <td className="py-0.5" style={{ paddingLeft: `${line.depth * 1.25 + 0.5}rem` }}>
              {line.kind === 'account' ? (
                <Link
                  to="/past/register/$acctId"
                  params={{ acctId: line.id }}
                  search={{ trail }}
                  className="hover:underline"
                >
                  {line.label}
                </Link>
              ) : (
                line.label
              )}
            </td>
            <td className="py-0.5 text-right tabular-nums">{formatCents(line.amount)}</td>
          </tr>
          {line.kind === 'account' && renderAccount?.(line.id)}
        </FragmentRows>
      ))}
      <tr className="font-semibold">
        <td className="py-1 pl-2">Total {section.heading.toLowerCase()}</td>
        <td className="py-1 text-right tabular-nums" data-testid={`${testId}-total`}>
          {formatCents(section.total)}
        </td>
      </tr>
    </tbody>
  )
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function usePeriod(from: '/past/balance-sheet' | '/past/income-statement') {
  const search = useSearch({ from })
  const navigate = useNavigate()
  const set = (patch: Record<string, string>) => void navigate({ to: from, search: { ...search, ...patch } })
  return { search, set }
}

export function BalanceSheetPage() {
  const file = usePlensFile((s) => s.file)
  return (
    <div className="p-4">
      <PageHeader title="Balance Sheet" description="What you own and owe, and your net worth, at a date." />
      {file ? <BalanceSheet /> : <NoPlensFile />}
    </div>
  )
}

function BalanceSheet() {
  const { search, set } = usePeriod('/past/balance-sheet')
  const period = search.period as Period
  const asOf = getEndDate(period)
  const accounts = useAccounts()
  const categories = useCategories()
  const balances = useStoreQuery(getStoreClient(), 'transactions', 'findAccountBalancesAsOf', asOf).data ?? NONE
  const sheet = useMemo(
    () => buildBalanceSheet(categories, accounts, balances, asOf),
    [categories, accounts, balances, asOf],
  )
  const trail: Crumb[] = [
    { label: 'Past', href: '/past' },
    { label: `Balance Sheet ${periodLabel(period)}`, href: `/past/balance-sheet?period=${period}` },
  ]
  return (
    <ReportTemplate
      label="Balance Sheet"
      filters={
        <>
          <PeriodPicker
            period={period}
            onChange={(p) => set({ period: p })}
            label="As of the end of"
            tip="The balance sheet shows balances at the end of this period, or today for the period you're in."
          />
          <span className="text-muted-foreground text-xs">Balances as of {formatDate(asOf)}</span>
        </>
      }
      table={
        <table className="w-full max-w-2xl text-sm">
          <Section section={sheet.assets} trail={trail} testId="assets" />
          <Section section={sheet.liabilities} trail={trail} testId="liabilities" />
          <tbody>
            <tr className="border-t-2 font-semibold">
              <td className="py-2 pl-2">Net worth (assets − liabilities)</td>
              <td className="py-2 text-right tabular-nums" data-testid="net-worth">
                {formatCents(sheet.netWorth)}
              </td>
            </tr>
          </tbody>
        </table>
      }
    />
  )
}

export function IncomeStatementPage() {
  const file = usePlensFile((s) => s.file)
  return (
    <div className="p-4">
      <PageHeader title="Income Statement" description="Income and spending for a period." />
      {file ? <IncomeStatement /> : <NoPlensFile />}
    </div>
  )
}

function IncomeStatement() {
  const { search, set } = usePeriod('/past/income-statement')
  const period = search.period as Period
  const details = 'view' in search && search.view === 'details'
  const start = getStartDate(period)
  const end = getEndDate(period)
  const client = getStoreClient()
  const accounts = useAccounts()
  const categories = useCategories()
  const vendors = useVendors()
  const balances = useStoreQuery(client, 'transactions', 'findAccountBalancesForPeriod', start, end).data ?? NONE
  const transactions =
    useStoreQuery(client, 'transactions', 'findTransactionsForPeriod', start as IsoDate, end as IsoDate).data ?? NONE
  const statement = useMemo(
    () => buildIncomeStatement(categories, accounts, balances, start, end),
    [categories, accounts, balances, start, end],
  )
  const entries = useMemo(
    () => (details ? incomeStatementEntries(accounts, transactions, vendors) : new Map()),
    [details, accounts, transactions, vendors],
  )
  const trail: Crumb[] = [
    { label: 'Past', href: '/past' },
    {
      label: `Income Statement ${periodLabel(period)}`,
      href: `/past/income-statement?period=${period}${details ? '&view=details' : ''}`,
    },
  ]
  const renderEntries = (id: string) =>
    (entries.get(id) ?? []).map((e: { txnId: string; date: string; label: string; amount: number }) => (
      <tr key={`${id}-${e.txnId}`} className="text-muted-foreground text-xs">
        <td className="py-0.5 pl-12">
          {formatDate(e.date)} · {e.label}
        </td>
        <td className="py-0.5 text-right tabular-nums">{formatCents(e.amount)}</td>
      </tr>
    ))
  return (
    <ReportTemplate
      label="Income Statement"
      filters={
        <>
          <PeriodPicker
            period={period}
            onChange={(p) => set({ period: p })}
            label="Period"
            tip="The income statement adds up income and spending posted in this period: a year, a quarter or a month."
          />
          <nav aria-label="View" className="flex rounded-md border p-0.5">
            {(['summary', 'details'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={(v === 'details') === details}
                onClick={() => set({ view: v })}
                className={cn(
                  'rounded px-2 py-0.5 text-sm capitalize',
                  (v === 'details') === details ? 'bg-accent font-medium' : 'text-muted-foreground',
                )}
              >
                {v}
              </button>
            ))}
          </nav>
          <span className="text-muted-foreground text-xs">
            {formatDate(start)} – {formatDate(end)}
          </span>
        </>
      }
      table={
        <table className="w-full max-w-2xl text-sm">
          <Section
            section={statement.income}
            trail={trail}
            testId="income"
            renderAccount={details ? renderEntries : undefined}
          />
          <Section
            section={statement.expenses}
            trail={trail}
            testId="expenses"
            renderAccount={details ? renderEntries : undefined}
          />
          <tbody>
            <tr className="border-t-2 font-semibold">
              <td className="py-2 pl-2">Net income (income − expenses)</td>
              <td className="py-2 text-right tabular-nums" data-testid="net-income">
                {formatCents(statement.netIncome)}
              </td>
            </tr>
          </tbody>
        </table>
      }
    />
  )
}
