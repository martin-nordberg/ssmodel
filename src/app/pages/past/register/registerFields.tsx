import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { TIP_TRIGGER, Tip } from '@/app/components/Tip.tsx'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import { amountToCents } from '@/lib/calculator.ts'
import { dateShortcut, parseDateInput, todayIso } from '@/lib/dateShortcuts.ts'
import { formatCents } from '@/lib/format.ts'
import { cn } from '@/lib/utils'

// Inputs for the register's row editor [FR-UI-31]: dates with shortcut keys, amounts with the inline calculator,
// and pickers that autocomplete from a list (accounts, vendors).

/** The register's two amount columns in the plain view [FR-HLP-6]: labels for a decrease and an increase. */
export const amountLabels: Record<
  AcctTypeStr,
  { decrease: string; increase: string; order: ('decrease' | 'increase')[] }
> = {
  ASSET: { decrease: 'Payment', increase: 'Deposit', order: ['decrease', 'increase'] },
  LIABILITY: { decrease: 'Payment', increase: 'Charge', order: ['increase', 'decrease'] },
  INCOME: { decrease: 'Refund', increase: 'Received', order: ['increase', 'decrease'] },
  EXPENSE: { decrease: 'Refund', increase: 'Spent', order: ['increase', 'decrease'] },
  EQUITY: { decrease: 'Decrease', increase: 'Increase', order: ['decrease', 'increase'] },
}

const inputClass =
  'h-7 w-full rounded border bg-background px-1.5 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive'

interface FieldProps {
  label: string
  /** Tooltip (5–40 words) [FR-UI-37]. */
  tip: string
  className?: string
}

function FieldLabel({ htmlFor, label, tip }: { htmlFor: string; label: string; tip: string }) {
  return (
    <Tip tip={tip}>
      <label htmlFor={htmlFor} className={cn(TIP_TRIGGER, 'block w-fit text-[11px] text-muted-foreground')}>
        {label}
      </label>
    </Tip>
  )
}

/**
 * A date: type it ("11/23", "23", "2026-11-23") or use the shortcut keys: t today, + and − a day, PageUp and
 * PageDown a month, m/h the month's first and last day, y/r the year's.
 */
export function DateField({
  label,
  tip,
  value,
  onChange,
  optional,
  className,
  autoFocus,
}: FieldProps & { value: string; onChange: (iso: string) => void; optional?: boolean; autoFocus?: boolean }) {
  const id = useId()
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setText(value)
  }
  const ref = useRef<HTMLInputElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: focuses once, when the editor opens
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [])
  const invalid = text.trim() !== '' && parseDateInput(text, todayIso()) === null
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const next = dateShortcut(e.key, parseDateInput(text, todayIso()) ?? value, todayIso())
    if (next === null) return
    e.preventDefault()
    setText(next)
    onChange(next)
  }
  const commit = () => {
    if (optional && text.trim() === '') return onChange('')
    const iso = parseDateInput(text, todayIso())
    if (iso) {
      setText(iso)
      onChange(iso)
    }
  }
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} label={label} tip={tip} />
      <input
        id={id}
        className={inputClass}
        ref={ref}
        value={text}
        aria-invalid={invalid}
        aria-description={tip}
        placeholder={optional ? '' : 'YYYY-MM-DD'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  )
}

/** An amount in dollars; arithmetic is evaluated when the field is left ("45.50 + 4.50" becomes $50.00). */
export function AmountField({
  label,
  tip,
  cents,
  onChange,
  className,
  allowNegative,
}: FieldProps & { cents: number | null; onChange: (cents: number | null) => void; allowNegative?: boolean }) {
  const id = useId()
  const toText = (c: number | null) => (c === null || c === 0 ? '' : (c / 100).toFixed(2))
  const [text, setText] = useState(toText(cents))
  const [shown, setShown] = useState(cents)
  const [error, setError] = useState<string | null>(null)
  if (cents !== shown) {
    setShown(cents)
    setText(toText(cents))
  }
  const commit = () => {
    const result = amountToCents(text)
    if ('error' in result) return setError(result.error)
    if (result.cents < 0 && !allowNegative) return setError('Enter a positive amount; use the other column instead.')
    setError(null)
    setShown(result.cents === 0 ? null : result.cents)
    setText(toText(result.cents))
    onChange(result.cents === 0 ? null : result.cents)
  }
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} label={label} tip={tip} />
      <input
        id={id}
        className={cn(inputClass, 'text-right')}
        value={text}
        inputMode="decimal"
        aria-invalid={error !== null}
        aria-description={tip}
        title={error ?? undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}

/** Text with suggestions from a list (native datalist: type to filter, arrows and Enter to pick). */
export function ListField({
  label,
  tip,
  value,
  onChange,
  options,
  invalid,
  className,
}: FieldProps & { value: string; onChange: (text: string) => void; options: string[]; invalid?: boolean }) {
  const id = useId()
  const listId = `${id}-list`
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} label={label} tip={tip} />
      <input
        id={id}
        list={listId}
        className={inputClass}
        value={value}
        autoComplete="off"
        aria-invalid={invalid}
        aria-description={tip}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  )
}

export function TextField({
  label,
  tip,
  value,
  onChange,
  className,
}: FieldProps & { value: string; onChange: (text: string) => void }) {
  const id = useId()
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} label={label} tip={tip} />
      <input
        id={id}
        className={inputClass}
        value={value}
        aria-description={tip}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** Cents for a register column: blank for zero. */
export function amountCell(cents: number): string {
  return cents === 0 ? '' : formatCents(cents)
}
