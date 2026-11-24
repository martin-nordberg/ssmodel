import { Link, useParams, useSearch } from '@tanstack/react-router'
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Flag } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { RegisterTemplate } from '@/app/components/templates/templates.tsx'
import { usePlensFile } from '@/app/files/plensFile.ts'
import { runCommand, useAccounts, useCategories, useEditable, useVendors } from '@/app/ledger/ledgerData.ts'
import type { Crumb } from '@/app/shell/Breadcrumbs.tsx'
import { Button } from '@/components/ui/button'
import { accountCategoryPath } from '@/ledger/accountCategories/accountTree.ts'
import type { BalanceAssertion } from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import { buildRegisterLines, buildRegisterRows, type RegisterRow } from '@/ledger/transactions/register.ts'
import type { Transaction } from '@/ledger/transactions/Transaction.ts'
import { todayIso } from '@/lib/dateShortcuts.ts'
import { formatCents, formatDate } from '@/lib/format.ts'
import { cn } from '@/lib/utils'
import { redoLedger, undoLedger, useLedgerUndo } from '@/state/ledgerUndo.ts'
import { useSettings } from '@/state/settingsStore.ts'
import { getStoreClient, useStoreQuery } from '@/state/storeClient.ts'
import { NoPlensFile } from '../../home/NoPlensFile.tsx'
import { PageHeader } from '../../PageHeader.tsx'
import { BalanceCheckEditor } from './BalanceCheckEditor.tsx'
import { amountCell, amountLabelsFor } from './registerFields.tsx'
import { TransactionEditor } from './TransactionEditor.tsx'

// An account's register [FR-LED-3, FR-UI-31, D: OQ-UI-13]: a keyboard-first transaction grid with a running balance,
// newest first, built on TanStack Table (Register template).
//
// Keys on the grid: ↑ ↓ (and Home, End, PageUp, PageDown) move; Enter or F2 edits the row; Insert or N adds a
// transaction; Delete removes the row after a confirmation (Enter deletes, Escape keeps it).

export function RegisterPage() {
  const file = usePlensFile((s) => s.file)
  return file ? (
    <Register />
  ) : (
    <div className="p-4">
      <PageHeader title="Register" />
      <NoPlensFile />
    </div>
  )
}

const NONE: never[] = []

function Register() {
  const { acctId } = useParams({ from: '/past/register/$acctId' })
  const { trail, select } = useSearch({ from: '/past/register/$acctId' })
  const client = getStoreClient()
  const accounts = useAccounts()
  const categories = useCategories()
  const vendors = useVendors()
  const editable = useEditable()
  const transactions = useStoreQuery(client, 'transactions', 'findTransactionsByAccount', acctId as never).data ?? NONE
  const assertions =
    useStoreQuery(client, 'balanceAssertions', 'findBalanceAssertionsByAccount', acctId as never).data ?? NONE
  const account = accounts.find((a) => a.id === acctId)

  // Income and expense accounts get a log: no running balance and no balance checks (no statements to match).
  const hasBalance = account?.acctType === 'ASSET' || account?.acctType === 'LIABILITY'
  const rows = useMemo(() => {
    if (!account) return []
    const lines = buildRegisterLines(transactions, accounts, vendors, acctId, account.acctType)
    return buildRegisterRows(lines, hasBalance ? assertions : [])
  }, [transactions, accounts, vendors, assertions, account, acctId, hasBalance])

  if (!account) {
    return (
      <div className="p-4">
        <PageHeader title="Register" />
        <p className="text-muted-foreground text-sm">
          {accounts.length === 0 ? 'Loading…' : 'That account doesn’t exist.'}
        </p>
      </div>
    )
  }

  const balance = rows.find((r) => r.kind === 'transaction')
  return (
    <div className="flex h-full flex-col p-4">
      <PageHeader
        title={accountCategoryPath(account, categories)}
        description={
          hasBalance
            ? `${account.acctType === 'LIABILITY' ? 'Owed' : 'Balance'}: ${formatCents(balance?.kind === 'transaction' ? balance.line.balance : 0)}`
            : `${account.acctType === 'INCOME' ? 'Income Log' : 'Expense Log'}: every transaction filed here`
        }
        trail={trail as Crumb[] | undefined}
        actions={
          <Link
            to="/setup/accounts"
            search={{ type: account.acctType === 'EQUITY' ? 'ASSET' : account.acctType }}
            className="text-xs hover:underline"
          >
            Account settings
          </Link>
        }
      />
      <RegisterGrid
        key={acctId}
        acctId={acctId}
        acctType={account.acctType}
        rows={rows}
        select={select}
        hasBalance={hasBalance}
        accounts={accounts}
        categories={categories}
        vendors={vendors}
        editable={editable}
      />
    </div>
  )
}

/** The open editor; `n` remounts the new-transaction editor after each save, ready for the next. */
type Editing =
  | { kind: 'new'; n: number }
  | { kind: 'edit'; txn: Transaction }
  | { kind: 'check'; date: string; balance: number; assertion?: BalanceAssertion }
  | null

function RegisterGrid({
  acctId,
  acctType,
  rows,
  select,
  hasBalance,
  accounts,
  categories,
  vendors,
  editable,
}: {
  acctId: string
  acctType: Parameters<typeof TransactionEditor>[0]['acctType']
  rows: RegisterRow[]
  /** A transaction to select when it appears (from a search result). */
  select?: string
  hasBalance: boolean
  accounts: Parameters<typeof TransactionEditor>[0]['accounts']
  categories: Parameters<typeof TransactionEditor>[0]['categories']
  vendors: Parameters<typeof TransactionEditor>[0]['vendors']
  editable: boolean
}) {
  const ledgerView = useSettings((st) => st.ledgerView)
  const labels = amountLabelsFor(acctType, ledgerView)
  const [active, setActive] = useState(0)
  const [editing, setEditing] = useState<Editing>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lastDate, setLastDate] = useState(todayIso())
  const gridRef = useRef<HTMLDivElement>(null)
  const txnRows = rows.filter((r): r is Extract<RegisterRow, { kind: 'transaction' }> => r.kind === 'transaction')

  useEffect(() => {
    if (active >= rows.length && rows.length > 0) setActive(rows.length - 1)
  }, [rows.length, active])

  // Select the transaction a search result pointed at, once, and put the keyboard on the list.
  const [selected, setSelected] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!select || select === selected) return
    const index = rows.findIndex((r) => r.kind === 'transaction' && r.line.txn.id === select)
    if (index < 0) return
    setSelected(select)
    setActive(index)
    setTimeout(() => {
      gridRef.current?.focus()
      document.getElementById(`register-row-${index}`)?.scrollIntoView({ block: 'nearest' })
    }, 0)
  }, [select, selected, rows])

  const columns = useMemo<ColumnDef<RegisterRow>[]>(
    () => [
      { id: 'date', header: 'Date' },
      { id: 'code', header: 'Number' },
      { id: 'payee', header: 'Vendor or description' },
      { id: 'account', header: 'Account' },
      ...labels.order.map((which) => ({ id: which, header: labels[which] })),
      ...(hasBalance ? [{ id: 'balance', header: acctType === 'LIABILITY' ? 'Owed' : 'Balance' }] : []),
      { id: 'review', header: 'Review' },
    ],
    [labels, acctType, hasBalance],
  )
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  const focusGrid = () => setTimeout(() => gridRef.current?.focus(), 0)
  const current = rows[active]

  const remove = async () => {
    setConfirmDelete(false)
    if (current?.kind === 'transaction')
      await runCommand('transactions', 'deleteTransaction', { id: current.line.txn.id })
    if (current?.kind === 'assertion')
      await runCommand('balanceAssertions', 'deleteBalanceAssertion', { id: current.assertion.id })
    focusGrid()
  }

  /** The register's balance at the end of a date (the newest line on or before it). */
  const balanceAt = (date: string): number => {
    for (const r of rows) if (r.kind === 'transaction' && r.line.date <= date) return r.line.balance
    return 0
  }
  const newCheck = (date: string) => setEditing({ kind: 'check', date, balance: balanceAt(date) })

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return // keys inside the editor are its own
    if (confirmDelete) {
      e.preventDefault()
      if (e.key === 'Enter') void remove()
      else if (e.key === 'Escape') setConfirmDelete(false)
      return
    }
    const move = (to: number) => {
      e.preventDefault()
      setActive(Math.max(0, Math.min(rows.length - 1, to)))
    }
    switch (e.key) {
      case 'ArrowDown':
        return move(active + 1)
      case 'ArrowUp':
        return move(active - 1)
      case 'Home':
        return move(0)
      case 'End':
        return move(rows.length - 1)
      case 'PageDown':
        return move(active + 10)
      case 'PageUp':
        return move(active - 10)
      case 'Enter':
      case 'F2':
        if (editable && current?.kind === 'transaction') {
          e.preventDefault()
          setEditing({ kind: 'edit', txn: current.line.txn })
        } else if (editable && current?.kind === 'assertion') {
          e.preventDefault()
          setEditing({
            kind: 'check',
            date: current.assertion.assertionDate,
            balance: current.assertion.balance,
            assertion: current.assertion,
          })
        }
        return
      case 'b':
      case 'B':
        // A balance check for the selected row's date, starting from the register's balance then.
        if (editable && hasBalance && current?.kind === 'transaction') {
          e.preventDefault()
          newCheck(current.line.date)
        }
        return
      case 'Insert':
      case 'n':
      case 'N':
        if (editable) {
          e.preventDefault()
          setEditing({ kind: 'new', n: 0 })
        }
        return
      case 'Delete':
      case 'Backspace':
        if (editable && current) {
          e.preventDefault()
          setConfirmDelete(true)
        }
        return
    }
  }

  const editor = (txn: Transaction | null) => (
    <TransactionEditor
      acctId={acctId}
      acctType={acctType}
      txn={txn}
      accounts={accounts}
      categories={categories}
      vendors={vendors}
      defaultDate={lastDate}
      onSaved={(date) => {
        setLastDate(date)
        if (txn) {
          setEditing(null)
          focusGrid()
        } else {
          // Ready for the next one, as on paper.
          setEditing((e) => ({ kind: 'new', n: e?.kind === 'new' ? e.n + 1 : 0 }))
        }
      }}
      onCancel={() => {
        setEditing(null)
        focusGrid()
      }}
    />
  )

  const rowId = (i: number) => `register-row-${i}`
  return (
    <RegisterTemplate
      label="Transactions"
      filters={
        <>
          <Button size="sm" variant="outline" disabled={!editable} onClick={() => setEditing({ kind: 'new', n: 0 })}>
            New transaction
          </Button>
          {hasBalance && (
            <Button size="sm" variant="outline" disabled={!editable} onClick={() => newCheck(todayIso())}>
              Add balance check
            </Button>
          )}
          <UndoButtons />
          <span className="text-muted-foreground text-xs">
            On the list: ↑ ↓ move · Enter edit · N or Insert new · Delete remove{hasBalance ? ' · B balance check' : ''}
          </span>
        </>
      }
      grid={
        // biome-ignore lint/a11y/useSemanticElements: an ARIA grid needs a focusable container for keyboard control
        <div
          ref={gridRef}
          role="grid"
          aria-label="Register"
          aria-activedescendant={rows.length > 0 && !editing ? rowId(active) : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-background text-left text-muted-foreground text-xs">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className={cn(
                        'border-b px-2 py-1 font-normal',
                        ['increase', 'decrease', 'balance'].includes(h.column.id) && 'text-right',
                      )}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {editing?.kind === 'check' && !editing.assertion && (
                <tr>
                  <td colSpan={columns.length}>
                    <BalanceCheckEditor
                      acctId={acctId}
                      date={editing.date}
                      balance={editing.balance}
                      onDone={() => {
                        setEditing(null)
                        focusGrid()
                      }}
                    />
                  </td>
                </tr>
              )}
              {editing?.kind === 'new' && (
                <tr key={`new-${editing.n}`}>
                  <td colSpan={columns.length}>{editor(null)}</td>
                </tr>
              )}
              {table.getRowModel().rows.map((row, i) => {
                const r = row.original
                if (editing?.kind === 'edit' && r.kind === 'transaction' && r.line.txn.id === editing.txn.id) {
                  return (
                    <tr key={row.id}>
                      <td colSpan={columns.length}>{editor(editing.txn)}</td>
                    </tr>
                  )
                }
                const selected = i === active
                if (r.kind === 'assertion' && editing?.kind === 'check' && editing.assertion?.id === r.assertion.id) {
                  return (
                    <tr key={row.id}>
                      <td colSpan={columns.length}>
                        <BalanceCheckEditor
                          acctId={acctId}
                          assertion={r.assertion}
                          date={r.assertion.assertionDate}
                          balance={r.assertion.balance}
                          onDone={() => {
                            setEditing(null)
                            focusGrid()
                          }}
                        />
                      </td>
                    </tr>
                  )
                }
                if (r.kind === 'assertion') {
                  const confirming = selected && confirmDelete
                  return (
                    <tr
                      key={row.id}
                      id={rowId(i)}
                      aria-selected={selected}
                      data-check={r.matches ? 'confirmed' : 'out-of-balance'}
                      onClick={() => setActive(i)}
                      className={cn(
                        'border-b text-xs',
                        r.matches ? 'text-muted-foreground' : 'bg-warning/10 text-warning',
                        selected && 'outline outline-ring',
                      )}
                    >
                      {confirming ? (
                        <td colSpan={columns.length} className="px-2 py-1 text-destructive" role="alert">
                          Delete this balance check? Press Enter to delete, or Escape to keep it.
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-1">{formatDate(r.assertion.assertionDate)}</td>
                          <td colSpan={columns.length - 3} className="px-2 py-1">
                            {r.matches
                              ? `Balance confirmed: ${formatCents(r.assertion.balance)}`
                              : `Out of balance: the statement says ${formatCents(r.assertion.balance)}, ${formatCents(Math.abs(r.difference))} ${r.difference > 0 ? 'more' : 'less'} than the register`}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{formatCents(r.balance)}</td>
                          <td />
                        </>
                      )}
                    </tr>
                  )
                }
                const line = r.line
                const isConfirming = selected && confirmDelete
                return (
                  <tr
                    key={row.id}
                    id={rowId(i)}
                    aria-selected={selected}
                    onClick={() => setActive(i)}
                    onDoubleClick={() => editable && setEditing({ kind: 'edit', txn: line.txn })}
                    className={cn('border-b', selected && 'bg-accent', isConfirming && 'bg-destructive/10')}
                  >
                    {isConfirming ? (
                      <td colSpan={columns.length} className="px-2 py-1 text-destructive" role="alert">
                        Delete this transaction ({line.vendorName ?? line.txn.description},{' '}
                        {formatCents(Math.abs(line.amount))})? Press Enter to delete, or Escape to keep it.
                      </td>
                    ) : (
                      <>
                        <td className="px-2 py-1 tabular-nums">{formatDate(line.date)}</td>
                        <td className="px-2 py-1">{line.txn.code}</td>
                        <td className="px-2 py-1">
                          {line.vendorName ?? line.txn.description}
                          {line.vendorName && line.txn.description && (
                            <span className="text-muted-foreground"> · {line.txn.description}</span>
                          )}
                        </td>
                        <td className="px-2 py-1">{line.offsetLabel}</td>
                        {labels.order.map((which) => (
                          <td key={which} className="px-2 py-1 text-right tabular-nums">
                            {which === 'increase'
                              ? amountCell(Math.max(0, line.amount))
                              : amountCell(Math.max(0, -line.amount))}
                          </td>
                        ))}
                        <td className="px-2 py-1 text-right tabular-nums">{formatCents(line.balance)}</td>
                        <td className="px-2 py-1">
                          {line.txn.needsReview && <Flag className="size-3.5 text-warning" aria-label="Needs review" />}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
              {rows.length === 0 && !editing && (
                <tr>
                  <td colSpan={columns.length} className="p-3 text-muted-foreground">
                    No transactions yet. Press N (or Insert) to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      }
      footer={<span>{txnRows.length} transactions</span>}
    />
  )
}

/** Undo and redo for ledger changes made in this session (also Ctrl+Z and Ctrl+Shift+Z) (plan P2.7). */
function UndoButtons() {
  const canUndo = useLedgerUndo((s) => s.undo.length > 0)
  const canRedo = useLedgerUndo((s) => s.redo.length > 0)
  return (
    <>
      <Button size="sm" variant="ghost" disabled={!canUndo} onClick={() => void undoLedger()}>
        Undo
      </Button>
      <Button size="sm" variant="ghost" disabled={!canRedo} onClick={() => void redoLedger()}>
        Redo
      </Button>
    </>
  )
}
