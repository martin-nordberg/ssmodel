// Shared chart frame [FR-OUT-8]: title, legend (identity never by color alone), and a table view of the same data.
import { type ReactNode, useState } from 'react'
import { ACTIVE_TOGGLE } from '@/app/components/toggleStyle.ts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export type LegendItem = { label: string; color: string; dashed?: boolean; band?: boolean }

export const compactMoney = (x: number) => {
  const a = Math.abs(x)
  const s =
    a >= 1e6 ? `$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `$${Math.round(a / 1e3)}k` : `$${Math.round(a)}`
  return x < 0 ? `−${s}` : s
}
export const fullMoney = (x: number) => `${x < 0 ? '−' : ''}$${Math.round(Math.abs(x)).toLocaleString('en-US')}`

export function ChartFrame({
  title,
  legend,
  table,
  children,
  note,
}: {
  title: string
  legend: LegendItem[]
  table: { columns: string[]; rows: (string | number)[][] }
  children: ReactNode
  note?: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <figure className="grid min-h-0 gap-1" aria-label={title}>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-medium">{title}</span>
        {legend.length > 1 &&
          legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1 text-muted-foreground">
              <svg width="16" height="10" aria-hidden>
                {l.band ? (
                  <rect x="0" y="1" width="16" height="8" rx="2" fill={l.color} />
                ) : (
                  <line
                    x1="0"
                    y1="5"
                    x2="16"
                    y2="5"
                    stroke={l.color}
                    strokeWidth="2"
                    strokeDasharray={l.dashed ? '3 2' : undefined}
                  />
                )}
              </svg>
              {l.label}
            </span>
          ))}
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          className="ml-auto"
          value={asTable ? 'table' : 'chart'}
          onValueChange={(v) => v && setAsTable(v === 'table')}
          aria-label={`${title} view`}
        >
          <ToggleGroupItem value="chart" className={ACTIVE_TOGGLE}>
            Chart
          </ToggleGroupItem>
          <ToggleGroupItem value="table" className={ACTIVE_TOGGLE}>
            Table
          </ToggleGroupItem>
        </ToggleGroup>
      </figcaption>
      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full font-mono text-[11px] tabular-nums">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col" className="px-2 py-1 text-left font-sans font-medium text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={String(r[0])} className="border-t">
                  {r.map((v, i) => (
                    <td key={table.columns[i]} className="px-2 py-0.5">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </figure>
  )
}
