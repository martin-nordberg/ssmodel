import { Plus, Split, X } from 'lucide-react'
import { type KeyboardEvent, useMemo, useRef, useState } from 'react'
import { TIP_TRIGGER, Tip } from '@/app/components/Tip.tsx'
import { runCommand } from '@/app/ledger/ledgerData.ts'
import { LEDGER_TIPS } from '@/app/ledger/ledgerTips.ts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { AccountCategory } from '@/ledger/accountCategories/AccountCategory.ts'
import { accountFullPath } from '@/ledger/accountCategories/accountTree.ts'
import type { Account } from '@/ledger/accounts/Account.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import { draftEntries, draftProblem, type RegisterDraft, toRegisterDraft } from '@/ledger/transactions/registerDraft.ts'
import type { Transaction } from '@/ledger/transactions/Transaction.ts'
import { genTxnId } from '@/ledger/transactions/TxnId.ts'
import type { Vendor } from '@/ledger/vendors/Vendor.ts'
import { formatCents } from '@/lib/format.ts'
import { useSettings } from '@/state/settingsStore.ts'
import { AmountField, amountLabelsFor, DateField, ListField, TextField } from './registerFields.tsx'

// The register's row editor [FR-LED-3, FR-UI-31]: keyboard-first, in tab order (date, cleared, code, vendor,
// description, account or split lines, amounts, review). Enter saves; Escape cancels. A vendor fills in its default
// account. Splits allocate the amount to several accounts, with signed lines.

export interface EditorProps {
  acctId: string
  acctType: AcctTypeStr
  /** The transaction being edited, or null for a new one. */
  txn: Transaction | null
  accounts: Account[]
  categories: AccountCategory[]
  vendors: Vendor[]
  /** The date a new transaction starts with (the last one entered, or today). */
  defaultDate: string
  onSaved: (date: string) => void
  onCancel: () => void
}

interface Line {
  key: number
  account: string // the account's path label, as typed
  amount: number | null
}

let nextKey = 1

export function TransactionEditor(props: EditorProps) {
  const { acctId, acctType, txn, accounts, categories, vendors, defaultDate, onSaved, onCancel } = props
  const ledgerView = useSettings((st) => st.ledgerView)
  const labels = amountLabelsFor(acctType, ledgerView)
  const pathOf = useMemo(() => {
    const m = new Map(accounts.map((a) => [a.id as string, accountFullPath(a, categories)]))
    return (id: string) => m.get(id) ?? ''
  }, [accounts, categories])
  const idOfPath = useMemo(() => {
    const m = new Map(accounts.map((a) => [accountFullPath(a, categories).toLowerCase(), a.id as string]))
    return (path: string) => m.get(path.trim().toLowerCase()) ?? null
  }, [accounts, categories])
  const accountOptions = useMemo(
    () =>
      accounts
        .filter((a) => a.id !== acctId)
        .map((a) => accountFullPath(a, categories))
        .sort(),
    [accounts, categories, acctId],
  )
  const activeVendors = useMemo(
    () => vendors.filter((v) => v.isActive || v.id === txn?.vndrId).sort((a, b) => a.name.localeCompare(b.name)),
    [vendors, txn],
  )

  const initial: RegisterDraft = txn ? toRegisterDraft(txn, acctId, acctType) : { increase: false, total: 0, lines: [] }
  const [postDate, setPostDate] = useState<string>(txn?.postDate ?? defaultDate)
  const [clearedDate, setClearedDate] = useState<string>(txn?.clearedDate ?? '')
  const [code, setCode] = useState<string>(txn?.code ?? '')
  const [vendor, setVendor] = useState<string>(vendors.find((v) => v.id === txn?.vndrId)?.name ?? '')
  const [description, setDescription] = useState<string>(txn?.description ?? '')
  const [decrease, setDecrease] = useState<number | null>(txn && !initial.increase ? initial.total : null)
  const [increase, setIncrease] = useState<number | null>(txn && initial.increase ? initial.total : null)
  const [lines, setLines] = useState<Line[]>(
    initial.lines.length > 0
      ? initial.lines.map((l) => ({ key: nextKey++, account: pathOf(l.acctId), amount: l.amount }))
      : [{ key: nextKey++, account: '', amount: null }],
  )
  const [split, setSplit] = useState(initial.lines.length > 1)
  const [review, setReview] = useState<boolean>(txn?.needsReview ?? false)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLFieldSetElement>(null)
  /** Focuses a split line's account field (the Split and Add line buttons move focus, keyboard-first). */
  const focusLine = (index: number) =>
    setTimeout(() => containerRef.current?.querySelector<HTMLInputElement>(`[data-line="${index}"] input`)?.focus(), 0)

  const total = increase ?? decrease ?? 0
  const allocated = lines.reduce((s, l) => s + (l.amount ?? 0), 0)

  const pickVendor = (text: string) => {
    setVendor(text)
    const v = vendors.find((x) => x.name.toLowerCase() === text.trim().toLowerCase())
    // Picking a vendor fills its default account into an empty account field [FR-UI-31].
    if (v?.defaultAcctId && !split && !lines[0]?.account) {
      setLines([{ ...lines[0]!, account: pathOf(v.defaultAcctId) }])
    }
  }

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const startSplit = () => {
    setSplit(true)
    setLines((ls) => [
      { ...ls[0]!, amount: ls[0]!.amount ?? (total || null) },
      { key: nextKey++, account: '', amount: total ? total - (ls[0]!.amount ?? total) || null : null },
    ])
    focusLine(1)
  }

  const save = async () => {
    if (saving) return
    const vendorText = vendor.trim()
    const v = vendorText ? vendors.find((x) => x.name.toLowerCase() === vendorText.toLowerCase()) : undefined
    if (vendorText && !v) return setProblem(`There is no vendor named “${vendorText}”. Add it on Setup › Vendors.`)
    if (!v && !description.trim()) return setProblem('Enter a vendor or a description.')
    const draftLines = (split ? lines : [{ ...lines[0]!, amount: total }]).filter((l) => l.account.trim() || l.amount)
    const unknown = draftLines.find((l) => l.account.trim() && !idOfPath(l.account))
    if (unknown) return setProblem(`There is no account “${unknown.account}”. Pick one from the list.`)
    const draft: RegisterDraft = {
      increase: increase !== null,
      total,
      lines: draftLines.map((l) => ({ acctId: idOfPath(l.account) ?? '', amount: l.amount ?? 0 })),
    }
    const issue = draftProblem(draft)
    if (issue) return setProblem(issue)
    if (clearedDate && clearedDate < postDate) return setProblem('The cleared date can’t be before the date.')
    setProblem(null)
    setSaving(true)
    const entries = draftEntries(draft, acctId, acctType)
    const ok = txn
      ? await runCommand('transactions', 'patchTransaction', {
          id: txn.id,
          postDate,
          clearedDate: clearedDate || null,
          code,
          vndrId: v?.id ?? null,
          description,
          needsReview: review,
          entries,
        })
      : await runCommand('transactions', 'createTransaction', {
          id: genTxnId(),
          postDate,
          ...(clearedDate ? { clearedDate } : {}),
          code,
          ...(v ? { vndrId: v.id } : {}),
          description,
          needsReview: review,
          entries,
        })
    setSaving(false)
    if (ok) onSaved(postDate)
  }

  const saveRef = useRef(save)
  saveRef.current = save

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      e.stopPropagation()
      // Let the focused field commit (amounts evaluate on blur), then save with the state that produces.
      ;(e.target as HTMLElement).blur?.()
      setTimeout(() => void saveRef.current(), 0)
    }
  }

  return (
    <fieldset
      ref={containerRef}
      aria-label={txn ? 'Edit transaction' : 'New transaction'}
      className="grid gap-2 border-y-2 border-ring bg-accent/40 p-2"
      onKeyDown={onKeyDown}
    >
      <div className="grid grid-cols-[8rem_8rem_5rem_1fr_1fr] gap-2">
        <DateField label="Date" tip={LEDGER_TIPS['txn.postDate']} value={postDate} onChange={setPostDate} autoFocus />
        <DateField
          label="Cleared"
          tip={LEDGER_TIPS['txn.clearedDate']}
          value={clearedDate}
          onChange={setClearedDate}
          optional
        />
        <TextField label="Number" tip={LEDGER_TIPS['txn.code']} value={code} onChange={setCode} />
        <ListField
          label="Vendor"
          tip={LEDGER_TIPS['txn.vendor']}
          value={vendor}
          onChange={pickVendor}
          options={activeVendors.map((v) => v.name)}
        />
        <TextField
          label="Description"
          tip={LEDGER_TIPS['txn.description']}
          value={description}
          onChange={setDescription}
        />
      </div>
      <div className="grid grid-cols-[1fr_8rem_8rem_auto] items-end gap-2">
        {split ? (
          <fieldset className="col-span-1 grid gap-1" aria-label="Split lines">
            {lines.map((l, i) => (
              <div key={l.key} data-line={i} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
                <ListField
                  label={`Line ${i + 1} account`}
                  tip={LEDGER_TIPS['split.account']}
                  value={l.account}
                  onChange={(t) => setLine(l.key, { account: t })}
                  options={accountOptions}
                  invalid={!!l.account.trim() && !idOfPath(l.account)}
                />
                <AmountField
                  label={`Line ${i + 1} amount`}
                  tip={LEDGER_TIPS['split.amount']}
                  cents={l.amount}
                  onChange={(c) => setLine(l.key, { amount: c })}
                  allowNegative
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Remove line ${i + 1}`}
                  disabled={lines.length <= 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-3 text-xs">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLines((ls) => [...ls, { key: nextKey++, account: '', amount: null }])
                  focusLine(lines.length)
                }}
              >
                <Plus className="size-3.5" /> Add line
              </Button>
              <span className="tabular-nums text-muted-foreground" data-testid="split-remaining">
                {allocated === total ? 'Balanced' : `Remaining ${formatCents(total - allocated)}`}
              </span>
            </div>
          </fieldset>
        ) : (
          <ListField
            label="Account"
            tip={LEDGER_TIPS['txn.account']}
            value={lines[0]?.account ?? ''}
            onChange={(t) => setLine(lines[0]!.key, { account: t })}
            options={accountOptions}
            invalid={!!lines[0]?.account.trim() && !idOfPath(lines[0]!.account)}
          />
        )}
        {labels.order.map((which) =>
          which === 'decrease' ? (
            <AmountField
              key={which}
              label={labels.decrease}
              tip={LEDGER_TIPS['txn.amount']}
              cents={decrease}
              onChange={(c) => {
                setDecrease(c)
                if (c !== null) setIncrease(null)
              }}
            />
          ) : (
            <AmountField
              key={which}
              label={labels.increase}
              tip={LEDGER_TIPS['txn.amount']}
              cents={increase}
              onChange={(c) => {
                setIncrease(c)
                if (c !== null) setDecrease(null)
              }}
            />
          ),
        )}
        <div className="flex items-center gap-2 pb-1">
          {!split && (
            <Button type="button" size="sm" variant="outline" onClick={startSplit}>
              <Split className="size-3.5" /> Split
            </Button>
          )}
          <span className="flex items-center gap-1">
            <Checkbox id="txn-review" checked={review} onCheckedChange={(c) => setReview(c === true)} />
            <Tip tip={LEDGER_TIPS['txn.review']}>
              <label htmlFor="txn-review" className={`${TIP_TRIGGER} text-xs`}>
                Review
              </label>
            </Tip>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {txn ? 'Save' : 'Add'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-muted-foreground text-xs">Enter saves · Escape cancels</span>
        {problem && (
          <p role="alert" className="text-destructive text-xs">
            {problem}
          </p>
        )}
      </div>
    </fieldset>
  )
}
