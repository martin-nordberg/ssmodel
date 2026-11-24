import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The page templates [FR-UI-27]: every page uses one, so the app reads as one system. Each is a layout with named
// slots; pages fill them. Regions are labeled for assistive technology and tests.

/** List or tree: a tree or table with inline add and edit, and details in a side panel. */
export function ListTreeTemplate({
  toolbar,
  list,
  detail,
  label,
}: {
  toolbar?: ReactNode
  list: ReactNode
  detail?: ReactNode
  label: string
}) {
  return (
    <div data-template="list-tree" className="flex min-h-0 flex-1 flex-col gap-2">
      {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
      <div className="flex min-h-0 flex-1 gap-3">
        <section aria-label={label} className="min-w-0 flex-1 overflow-auto">
          {list}
        </section>
        {detail && (
          <aside aria-label="Details" className="w-80 shrink-0 overflow-auto rounded border p-3">
            {detail}
          </aside>
        )}
      </div>
    </div>
  )
}

/** Register: a keyboard-first transaction grid with a running balance, between a filters bar and a totals footer. */
export function RegisterTemplate({
  filters,
  grid,
  footer,
  label,
}: {
  filters?: ReactNode
  grid: ReactNode
  footer?: ReactNode
  label: string
}) {
  return (
    <div data-template="register" className="flex min-h-0 flex-1 flex-col gap-2">
      {filters && (
        <div role="toolbar" aria-label="Filters" className="flex flex-wrap items-center gap-2">
          {filters}
        </div>
      )}
      <section aria-label={label} className="min-h-0 flex-1 overflow-auto rounded border">
        {grid}
      </section>
      {footer && <footer className="flex items-center gap-4 text-xs tabular-nums">{footer}</footer>}
    </div>
  )
}

/** Editor: a grid or form, with an inspector panel for the selected row. */
export function EditorTemplate({
  editor,
  inspector,
  label,
}: {
  editor: ReactNode
  inspector?: ReactNode
  label: string
}) {
  return (
    <div data-template="editor" className="flex min-h-0 flex-1 gap-3">
      <section aria-label={label} className="min-w-0 flex-1 overflow-auto">
        {editor}
      </section>
      {inspector && (
        <aside aria-label="Inspector" className="w-80 shrink-0 overflow-auto rounded border p-3">
          {inspector}
        </aside>
      )}
    </div>
  )
}

/** Report: a filters bar, then the chart, then the table, from the same data [FR-RPT-1]. */
export function ReportTemplate({
  filters,
  chart,
  table,
  label,
}: {
  filters: ReactNode
  chart?: ReactNode
  table: ReactNode
  label: string
}) {
  return (
    <div data-template="report" className="flex flex-col gap-3">
      <div role="toolbar" aria-label="Report filters" className="no-print flex flex-wrap items-center gap-2">
        {filters}
      </div>
      {chart && (
        <section aria-label={`${label} chart`} className="h-64">
          {chart}
        </section>
      )}
      <section aria-label={`${label} table`} className="overflow-auto">
        {table}
      </section>
    </div>
  )
}

/** Console: levers, KPI tiles, the main chart and a detail strip. */
export function ConsoleTemplate({
  levers,
  kpis,
  chart,
  detail,
}: {
  levers: ReactNode
  kpis: ReactNode
  chart: ReactNode
  detail?: ReactNode
}) {
  return (
    <div data-template="console" className="flex min-h-0 flex-1 gap-3">
      <aside aria-label="Levers" className="w-72 shrink-0 overflow-auto">
        {levers}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <section aria-label="Key figures" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {kpis}
        </section>
        <section aria-label="Main chart" className="min-h-48 flex-1">
          {chart}
        </section>
        {detail && <section aria-label="Detail">{detail}</section>}
      </div>
    </div>
  )
}

/** Dashboard: a fixed grid of tiles that link to their pages [FR-UI-34]. */
export function DashboardTemplate({ children }: { children: ReactNode }) {
  return (
    <section
      data-template="dashboard"
      aria-label="Dashboard"
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      {children}
    </section>
  )
}

/** A dashboard tile: a title, the main figure, a line of context, and the page it opens. */
export function Tile({
  title,
  value,
  note,
  to,
  className,
}: {
  title: string
  value: ReactNode
  note?: ReactNode
  to?: string
  className?: string
}) {
  const body = (
    <>
      <h3 className="text-muted-foreground text-xs">{title}</h3>
      <p className="font-semibold text-xl tabular-nums">{value}</p>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </>
  )
  const classes = cn(
    'block rounded border p-3',
    to && 'hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
    className,
  )
  return to ? (
    <Link to={to as '/'} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

/** A KPI figure for the Console template. */
export function Kpi({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded border p-2', className)}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold text-lg tabular-nums">{value}</p>
    </div>
  )
}
