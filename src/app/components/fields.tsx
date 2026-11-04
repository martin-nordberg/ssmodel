// Form fields that parse and format like grid cells [FR-UI-4]. Values commit on blur or Enter.
import { type ReactNode, useEffect, useId, useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { updateScenario } from '@/state/scenario.ts'
import { type CellType, formatCell, parseCell } from './grid/DataGrid.tsx'

/** Default lever range around the current value. */
export function leverRange(type: CellType, v: number): { min: number; max: number; step: number } {
  if (type === 'percent') {
    const span = Math.max(0.05, Math.abs(v))
    return { min: Math.max(-1, v - span), max: Math.min(1, v + span), step: 0.0025 }
  }
  if (type === 'currency') {
    const max = Math.max(1000, Math.ceil((v * 2) / 1000) * 1000)
    return { min: 0, max, step: Math.max(50, Math.round(max / 40 / 50) * 50) }
  }
  const span = Math.max(1, Math.abs(v))
  return { min: v - span, max: v + span, step: span / 20 }
}

function addToConsole(path: string, label: string, type: CellType, value: number) {
  updateScenario((s) => {
    if (s.consoleLevers.some((l) => l.path === path)) return
    s.consoleLevers.push({ path, label, ...leverRange(type, value) })
  }, 'add lever')
}

type FieldProps = {
  /** Scenario-relative path; enables right-click "Add to Console" [FR-UI-7a]. */
  leverPath?: string
  label: string
  type: Exclude<CellType, 'select' | 'boolean'>
  value: unknown
  onCommit: (value: unknown) => void
  optional?: boolean
  min?: number
  max?: number
  hint?: ReactNode
  placeholder?: string
  className?: string
}

export function Field({
  label,
  type,
  value,
  onCommit,
  optional,
  min,
  max,
  hint,
  placeholder,
  className,
  leverPath,
}: FieldProps) {
  const id = useId()
  const display = formatCell(type, value)
  const [text, setText] = useState(display)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(display)
  }, [display, focused])

  const commit = () => {
    const r = parseCell({ type, optional, min, max }, text)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(null)
    if (r.value !== value) onCommit(r.value)
    setText(formatCell(type, r.value))
  }

  const [menu, setMenu] = useState(false)
  const field = (
    <input
      id={id}
      value={text}
      placeholder={placeholder}
      aria-invalid={!!error}
      aria-describedby={error || hint ? `${id}-help` : undefined}
      className={cn(
        'h-7 rounded-md border bg-background px-2 font-mono text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        error && 'border-destructive',
      )}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          setText(display)
          setError(null)
        }
      }}
      onContextMenu={
        leverPath && typeof value === 'number'
          ? (e) => {
              e.preventDefault()
              setMenu(true)
            }
          : undefined
      }
    />
  )
  return (
    <div className={cn('grid gap-1', className)}>
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      {leverPath && typeof value === 'number' ? (
        <DropdownMenu open={menu} onOpenChange={setMenu}>
          <div className="relative grid">
            {field}
            <DropdownMenuTrigger asChild>
              <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 size-0" />
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => addToConsole(leverPath, label, type, value)}>
              Add to Console
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        field
      )}
      {(error || hint) && (
        <span id={`${id}-help`} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? hint}
        </span>
      )}
    </div>
  )
}

type SelectProps<T extends string | number> = {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  hint?: ReactNode
  className?: string
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
  className,
}: SelectProps<T>) {
  const id = useId()
  return (
    <div className={cn('grid gap-1', className)}>
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <select
        id={id}
        value={String(value)}
        className="h-7 rounded-md border bg-background px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value)
          if (o) onChange(o.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  )
}

export function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2 pt-4">
      <Switch id={id} checked={checked} onCheckedChange={onChange} size="sm" />
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
    </div>
  )
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid gap-3">
      <header>
        <h2 className="font-semibold text-sm">{title}</h2>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </header>
      {children}
    </section>
  )
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">{children}</div>
}
