// Spreadsheet-like editable grid [FR-UI-3, FR-UI-4] built on TanStack Table's row/column model.
// Mouse: a click edits the cell (text selected; drop-downs open); Shift+click selects a range.
// Keyboard: arrows/Tab/Enter move; Enter, F2 or typing edits; Esc cancels; Delete clears optional cells;
// Shift+arrows select a range; Ctrl+C / Ctrl+V copy and paste TSV (Excel/Sheets compatible).
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  formatCurrency,
  formatPercent,
  getMoneyStyle,
  type Parsed,
  parseCurrency,
  parseDate,
  parseInteger,
  parseNumber,
  parsePercent,
  parseTsv,
  parseYearMonth,
  toTsv,
} from './parse.ts'

export type CellType =
  | 'text'
  | 'currency'
  | 'percent'
  | 'integer'
  | 'number'
  | 'yearMonth'
  | 'date'
  | 'select'
  | 'boolean'

export type GridColumn<R> = {
  id: string
  header: string
  type: CellType
  width?: number
  options?: { value: string; label: string }[]
  get: (row: R) => unknown
  set: (row: R, value: unknown) => R
  /** Empty input clears the value (undefined) instead of being an error. */
  optional?: boolean
  readOnly?: boolean
  min?: number
  max?: number
}

export type DataGridProps<R> = {
  label: string
  rows: R[]
  columns: GridColumn<R>[]
  onChange: (rows: R[]) => void
  /** Enables adding, deleting and reordering rows. */
  newRow?: () => R
  /** Row-level validation: column id -> message. */
  validateRow?: (row: R) => Record<string, string>
  readOnly?: boolean
  maxHeight?: number
  /** Row index to highlight (linked highlighting) [FR-UI-11]. */
  highlightRow?: number
  /** Pointer or keyboard focus moved to a row (null when leaving the grid). */
  onRowHover?: (index: number | null) => void
}

type Cell = { r: number; c: number }
/** An open cell editor; it carries its own cell so a commit never lands in a newly clicked cell. */
type Edit = Cell & { text: string; error?: string; selectAll?: boolean }

// Cells of an ARIA grid table; focus stays on the grid container (aria-activedescendant).
const gridCellProps = (selected: boolean) => ({ role: 'gridcell', 'aria-selected': selected }) as const

export function formatCell(
  type: CellType,
  v: unknown,
  options?: GridColumn<unknown>['options'],
  readOnly = false,
): string {
  if (v === undefined || v === null) return ''
  switch (type) {
    case 'currency':
      return formatCurrency(v as number, readOnly && getMoneyStyle() === 'compact')
    case 'percent':
      return formatPercent(v as number)
    case 'boolean':
      return v ? 'Yes' : 'No'
    case 'select':
      return options?.find((o) => o.value === v)?.label ?? String(v)
    case 'number':
      return String(Math.round((v as number) * 1e6) / 1e6)
    default:
      return String(v)
  }
}

export function parseCell(
  col: Pick<GridColumn<unknown>, 'type' | 'options' | 'optional' | 'min' | 'max'>,
  text: string,
): Parsed<unknown> {
  if (text.trim() === '') {
    if (col.optional) return { ok: true, value: undefined }
    if (col.type === 'text') return { ok: true, value: '' }
    return { ok: false, error: 'required' }
  }
  let r: Parsed<unknown>
  switch (col.type) {
    case 'currency':
      r = parseCurrency(text)
      break
    case 'percent':
      r = parsePercent(text)
      break
    case 'integer':
      r = parseInteger(text)
      break
    case 'number':
      r = parseNumber(text)
      break
    case 'yearMonth':
      r = parseYearMonth(text)
      break
    case 'date':
      r = parseDate(text)
      break
    case 'boolean': {
      const t = text.trim().toLowerCase()
      r = ['yes', 'y', 'true', '1', 'x'].includes(t)
        ? { ok: true, value: true }
        : ['no', 'n', 'false', '0'].includes(t)
          ? { ok: true, value: false }
          : { ok: false, error: 'expected yes or no' }
      break
    }
    case 'select': {
      const t = text.trim().toLowerCase()
      const o = col.options?.find((x) => x.value.toLowerCase() === t || x.label.toLowerCase() === t)
      r = o
        ? { ok: true, value: o.value }
        : { ok: false, error: `choose one of: ${col.options?.map((x) => x.label).join(', ')}` }
      break
    }
    default:
      r = { ok: true, value: text }
  }
  if (r.ok && typeof r.value === 'number') {
    if (col.min !== undefined && r.value < col.min) return { ok: false, error: `minimum ${col.min}` }
    if (col.max !== undefined && r.value > col.max) return { ok: false, error: `maximum ${col.max}` }
  }
  return r
}

export function DataGrid<R>({
  label,
  rows,
  columns,
  onChange,
  newRow,
  validateRow,
  readOnly,
  maxHeight,
  highlightRow,
  onRowHover,
}: DataGridProps<R>) {
  const [active, setActive] = useState<Cell>({ r: 0, c: 0 })
  const [anchor, setAnchor] = useState<Cell | null>(null)
  const [editing, setEditingState] = useState<Edit | null>(null)
  // Mirrors `editing` synchronously: blur events fire before React re-renders.
  const editRef = useRef<Edit | null>(null)
  const setEditing = (e: Edit | null) => {
    editRef.current = e
    setEditingState(e)
  }
  const [message, setMessage] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const gridId = useId()

  const nRows = rows.length
  const nCols = columns.length
  const canEditRows = !!newRow && !readOnly

  const rowErrors = useMemo(() => rows.map((row) => validateRow?.(row) ?? {}), [rows, validateRow])

  const sel = useMemo(() => {
    const a = anchor ?? active
    return {
      r0: Math.min(a.r, active.r),
      r1: Math.max(a.r, active.r),
      c0: Math.min(a.c, active.c),
      c1: Math.max(a.c, active.c),
    }
  }, [anchor, active])

  const focusGrid = () => gridRef.current?.focus()
  useEffect(() => {
    if (document.activeElement === gridRef.current) onRowHover?.(active.r)
  }, [active.r, onRowHover])

  const move = (dr: number, dc: number, extend = false) => {
    if (extend) setAnchor((a) => a ?? active)
    else setAnchor(null)
    setActive((p) => ({
      r: Math.max(0, Math.min(Math.max(0, nRows - 1), p.r + dr)),
      c: Math.max(0, Math.min(nCols - 1, p.c + dc)),
    }))
  }

  const isEditable = (c: number) => !readOnly && !columns[c]?.readOnly

  /** Commits the open editor (if any) to its own cell; false keeps it open with an error. */
  const commit = (text: string): boolean => {
    const ed = editRef.current
    if (!ed) return true
    const col = columns[ed.c]
    const row = rows[ed.r]
    if (!col || !row) {
      setEditing(null)
      return true
    }
    const r = parseCell(col as GridColumn<unknown>, text)
    if (!r.ok) {
      setEditing({ ...ed, text, error: r.error })
      return false
    }
    setEditing(null)
    const next = rows.slice()
    next[ed.r] = col.set(row, r.value)
    onChange(next)
    return true
  }

  const cancelEdit = () => {
    setEditing(null)
    focusGrid()
  }

  const startEdit = (initial?: string, at: Cell = active, selectAll = initial === undefined) => {
    if (!isEditable(at.c) || !rows[at.r]) return
    const col = columns[at.c]!
    if (col.type === 'boolean') {
      const next = rows.slice()
      next[at.r] = col.set(rows[at.r]!, !col.get(rows[at.r]!))
      onChange(next)
      return
    }
    const text = initial ?? formatCell(col.type, col.get(rows[at.r]!), col.options).replace(/^\$/, '')
    setEditing({ ...at, text, selectAll })
  }

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return
    const k = e.key
    if (k === 'ArrowDown') move(1, 0, e.shiftKey)
    else if (k === 'ArrowUp') move(-1, 0, e.shiftKey)
    else if (k === 'ArrowLeft') move(0, -1, e.shiftKey)
    else if (k === 'ArrowRight') move(0, 1, e.shiftKey)
    else if (k === 'Tab') move(0, e.shiftKey ? -1 : 1)
    else if (k === 'Enter' || k === 'F2') startEdit()
    else if (k === ' ' && columns[active.c]?.type === 'boolean') startEdit()
    else if ((k === 'Delete' || k === 'Backspace') && !readOnly) {
      const next = rows.slice()
      let err: string | null = null
      for (let r = sel.r0; r <= sel.r1; r++)
        for (let c = sel.c0; c <= sel.c1; c++) {
          const col = columns[c]!
          if (col.readOnly || !next[r]) continue
          const p = parseCell(col as GridColumn<unknown>, '')
          if (p.ok) next[r] = col.set(next[r]!, p.value)
          else err = `${col.header}: ${p.error}`
        }
      onChange(next)
      setMessage(err)
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      startEdit(k)
    } else return
    e.preventDefault()
  }

  const onCopy = (e: React.ClipboardEvent) => {
    if (editing) return
    const cells: string[][] = []
    for (let r = sel.r0; r <= sel.r1; r++) {
      const line: string[] = []
      for (let c = sel.c0; c <= sel.c1; c++) {
        const col = columns[c]!
        line.push(rows[r] ? formatCell(col.type, col.get(rows[r]!), col.options) : '')
      }
      cells.push(line)
    }
    e.clipboardData.setData('text/plain', toTsv(cells))
    e.preventDefault()
  }

  const onPaste = (e: React.ClipboardEvent) => {
    if (editing || readOnly) return
    e.preventDefault()
    const cells = parseTsv(e.clipboardData.getData('text/plain'))
    const next = rows.slice()
    const errors: string[] = []
    cells.forEach((line, i) => {
      const r = active.r + i
      if (r >= next.length) {
        if (!newRow) return
        next.push(newRow())
      }
      line.forEach((text, j) => {
        const c = active.c + j
        const col = columns[c]
        if (!col || col.readOnly) return
        const p = parseCell(col as GridColumn<unknown>, text)
        if (p.ok) next[r] = col.set(next[r]!, p.value)
        else errors.push(`row ${r + 1} ${col.header}: ${p.error}`)
      })
    })
    onChange(next)
    setMessage(errors.length ? `${errors.length} cell(s) not pasted — ${errors.slice(0, 3).join('; ')}` : null)
  }

  const rowOps = {
    add: () => {
      if (!newRow) return
      onChange([...rows, newRow()])
      setActive({ r: rows.length, c: 0 })
    },
    remove: (i: number) => {
      onChange(rows.filter((_, j) => j !== i))
      setActive((p) => ({ r: Math.max(0, Math.min(p.r, rows.length - 2)), c: p.c }))
    },
    shift: (i: number, d: number) => {
      const j = i + d
      if (j < 0 || j >= rows.length) return
      const next = rows.slice()
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      onChange(next)
      setActive({ r: j, c: active.c })
    },
  }

  const columnDefs: ColumnDef<R>[] = [
    ...columns.map(
      (col, ci): ColumnDef<R> => ({
        id: col.id,
        header: col.header,
        size: col.width ?? 120,
        cell: (ctx) => {
          const ri = ctx.row.index
          const row = ctx.row.original
          const err = rowErrors[ri]?.[col.id]
          if (editing && editing.r === ri && editing.c === ci) {
            return col.type === 'select' ? (
              <CellSelect
                label={col.header}
                value={String(col.get(row) ?? '')}
                options={col.options ?? []}
                onPick={(v) => {
                  if (commit(v)) focusGrid()
                }}
                onCancel={cancelEdit}
                onBlur={() => {
                  if (editRef.current?.r === ri && editRef.current.c === ci) setEditing(null)
                }}
              />
            ) : (
              <CellInput
                label={col.header}
                edit={editing}
                onText={(text) => setEditing({ ...editing, text, error: undefined })}
                onBlur={(text) => commit(text)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (commit(editing.text)) {
                      move(1, 0)
                      focusGrid()
                    }
                  } else if (e.key === 'Tab') {
                    e.preventDefault()
                    if (commit(editing.text)) {
                      move(0, e.shiftKey ? -1 : 1)
                      focusGrid()
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelEdit()
                  }
                }}
              />
            )
          }
          return (
            <span className={cn('block truncate px-1', err && 'text-destructive')} title={err}>
              {formatCell(col.type, col.get(row), col.options, col.readOnly || readOnly)}
            </span>
          )
        },
      }),
    ),
  ]

  const table = useReactTable({ data: rows, columns: columnDefs, getCoreRowModel: getCoreRowModel() })

  return (
    <div className="grid gap-1">
      {/* biome-ignore lint/a11y/useSemanticElements: an ARIA grid needs a focusable container for keyboard control */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        aria-activedescendant={nRows > 0 ? `${gridId}-${active.r}-${active.c}` : undefined}
        tabIndex={0}
        onKeyDown={onGridKey}
        onCopy={onCopy}
        onPaste={onPaste}
        onMouseLeave={() => onRowHover?.(null)}
        className="group overflow-auto rounded-md border font-mono text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        style={{ maxHeight }}
      >
        <table className="w-max min-w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-muted">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    style={{ width: h.getSize() }}
                    className="border-b px-1 py-1 text-left font-medium font-sans text-muted-foreground"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
                {canEditRows && <th className="w-20 border-b" aria-label="Row actions" />}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                aria-rowindex={row.index + 1}
                className={cn(row.index === highlightRow && 'bg-primary/10')}
              >
                {row.getVisibleCells().map((cell, ci) => {
                  const ri = row.index
                  const isActive = active.r === ri && active.c === ci
                  const isEditing = editing?.r === ri && editing.c === ci
                  const inSel = ri >= sel.r0 && ri <= sel.r1 && ci >= sel.c0 && ci <= sel.c1
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: the grid container handles the keyboard (Enter/F2/typing edit)
                    <td
                      key={cell.id}
                      id={`${gridId}-${ri}-${ci}`}
                      {...gridCellProps(inSel)}
                      className={cn(
                        'h-6 border-b border-r',
                        inSel && 'bg-accent',
                        isActive &&
                          'outline outline-2 -outline-offset-2 outline-muted-foreground/30 group-focus-within:outline-primary',
                        columns[ci]?.readOnly && 'text-muted-foreground',
                      )}
                      onMouseDown={(e) => {
                        if (isEditing) return
                        // Finish an edit in another cell first; an invalid value keeps its editor open.
                        if (editRef.current && !commit(editRef.current.text)) {
                          e.preventDefault()
                          return
                        }
                        if (e.shiftKey) setAnchor((a) => a ?? active)
                        else setAnchor(null)
                        setActive({ r: ri, c: ci })
                      }}
                      onClick={(e) => {
                        if (!e.shiftKey && !isEditing) startEdit(undefined, { r: ri, c: ci })
                      }}
                    >
                      {/* Called directly: flexRender would mount this inline function as a component type that changes every render, remounting the cell (and its editor) on each update. */}
                      {(cell.column.columnDef.cell as (ctx: ReturnType<typeof cell.getContext>) => ReactNode)(
                        cell.getContext(),
                      )}
                    </td>
                  )
                })}
                {canEditRows && (
                  <td className="border-b px-1 whitespace-nowrap">
                    <button
                      type="button"
                      aria-label={`Move row ${row.index + 1} up`}
                      className="p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() => rowOps.shift(row.index, -1)}
                    >
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move row ${row.index + 1} down`}
                      className="p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() => rowOps.shift(row.index, 1)}
                    >
                      <ArrowDown className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete row ${row.index + 1}`}
                      className="p-0.5 text-muted-foreground hover:text-destructive"
                      onClick={() => rowOps.remove(row.index)}
                    >
                      <X className="size-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        {canEditRows && (
          <Button variant="outline" size="xs" onClick={rowOps.add}>
            <Plus /> Add row
          </Button>
        )}
        {editing?.error && <span className="text-destructive text-xs">{editing.error}</span>}
        {message && <span className="text-destructive text-xs">{message}</span>}
      </div>
    </div>
  )
}

function CellInput({
  label,
  edit,
  onText,
  onBlur,
  onKeyDown,
}: {
  label: string
  edit: Edit
  onText: (text: string) => void
  onBlur: (text: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  // Focus once on open: select the whole value (click, Enter, F2) or put the caret after a typed character.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs only when the editor opens
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    if (edit.selectAll) el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  return (
    <input
      ref={ref}
      aria-label={label}
      aria-invalid={!!edit.error}
      title={edit.error}
      className={cn('h-6 w-full bg-background px-1 text-xs outline-none', edit.error && 'text-destructive')}
      value={edit.text}
      onChange={(e) => onText(e.target.value)}
      onBlur={(e) => onBlur(e.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}

function CellSelect({
  label,
  value,
  options,
  onPick,
  onCancel,
  onBlur,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onPick: (value: string) => void
  onCancel: () => void
  onBlur: () => void
}) {
  const ref = useRef<HTMLSelectElement>(null)
  // Open the option list straight away, so a click (or Enter) drops it down.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    try {
      el.showPicker()
    } catch {
      // Unsupported (e.g. Safari) or no user activation: the focused select still opens on click or Alt+Down.
    }
  }, [])
  return (
    <select
      ref={ref}
      aria-label={label}
      className="h-6 w-full bg-background text-xs outline-none"
      defaultValue={value}
      onChange={(e) => onPick(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
        else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          onPick(e.currentTarget.value)
        }
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
