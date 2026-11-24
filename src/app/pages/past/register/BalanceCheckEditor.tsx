import { type KeyboardEvent, useRef, useState } from 'react'
import { runCommand } from '@/app/ledger/ledgerData.ts'
import { LEDGER_TIPS } from '@/app/ledger/ledgerTips.ts'
import { Button } from '@/components/ui/button'
import { genAsrtId } from '@/ledger/balanceAssertions/AsrtId.ts'
import type { BalanceAssertion } from '@/ledger/balanceAssertions/BalanceAssertion.ts'
import { AmountField, DateField } from './registerFields.tsx'

// A balance check (balance assertion) in an asset or liability register [FR-LED-1]: the balance a statement shows at
// the end of a date. The register then says whether it agrees. A check's date is fixed once made; its balance can
// be changed. Enter saves; Escape cancels.

export function BalanceCheckEditor({
  acctId,
  assertion,
  date,
  balance,
  onDone,
}: {
  acctId: string
  /** The check being edited, or undefined for a new one. */
  assertion?: BalanceAssertion
  date: string
  /** The balance to start with (the register's own balance at that date, for a new check). */
  balance: number
  onDone: () => void
}) {
  const [checkDate, setCheckDate] = useState(date)
  const [amount, setAmount] = useState<number | null>(balance)
  const saveRef = useRef<() => Promise<void>>(async () => {})

  const save = async () => {
    const cents = amount ?? 0
    const ok = assertion
      ? await runCommand('balanceAssertions', 'patchBalanceAssertion', { id: assertion.id, balance: cents })
      : await runCommand('balanceAssertions', 'createBalanceAssertion', {
          id: genAsrtId(),
          acctId,
          assertionDate: checkDate,
          balance: cents,
        })
    if (ok) onDone()
  }
  saveRef.current = save

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onDone()
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      e.stopPropagation()
      ;(e.target as HTMLElement).blur?.()
      setTimeout(() => void saveRef.current(), 0)
    }
  }

  return (
    <fieldset
      aria-label={assertion ? 'Edit balance check' : 'New balance check'}
      className="flex flex-wrap items-end gap-2 border-y-2 border-ring bg-accent/40 p-2"
      onKeyDown={onKeyDown}
    >
      {assertion ? (
        <p className="pb-1 text-sm">Balance check for {assertion.assertionDate}</p>
      ) : (
        <DateField
          label="Statement date"
          tip={LEDGER_TIPS['check.date']}
          value={checkDate}
          onChange={setCheckDate}
          autoFocus
        />
      )}
      <AmountField
        label="Statement balance"
        tip={LEDGER_TIPS['check.balance']}
        cents={amount}
        onChange={setAmount}
        allowNegative
        autoFocus={assertion !== undefined}
        className="w-40"
      />
      <Button type="button" size="sm" onClick={() => void save()}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </fieldset>
  )
}
