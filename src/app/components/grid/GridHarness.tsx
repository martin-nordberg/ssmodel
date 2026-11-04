// Test harness for the grid (open with ?harness=grid); used by Playwright [FR-UI-3].
import { useState } from 'react'
import { DataGrid, type GridColumn } from './DataGrid.tsx'

type Row = { year: number; amount: number; note?: string; kind: string; flag: boolean }

const columns: GridColumn<Row>[] = [
  {
    id: 'year',
    header: 'Year',
    type: 'integer',
    get: (r) => r.year,
    set: (r, v) => ({ ...r, year: v as number }),
    min: 1937,
  },
  {
    id: 'amount',
    header: 'Amount',
    type: 'currency',
    get: (r) => r.amount,
    set: (r, v) => ({ ...r, amount: v as number }),
  },
  {
    id: 'note',
    header: 'Note',
    type: 'text',
    optional: true,
    get: (r) => r.note,
    set: (r, v) => ({ ...r, note: v as string | undefined }),
  },
  {
    id: 'kind',
    header: 'Kind',
    type: 'select',
    options: [
      { value: 'wages', label: 'Wages' },
      { value: 'se', label: 'Self-employment' },
    ],
    get: (r) => r.kind,
    set: (r, v) => ({ ...r, kind: v as string }),
  },
  { id: 'flag', header: 'Flag', type: 'boolean', get: (r) => r.flag, set: (r, v) => ({ ...r, flag: v as boolean }) },
]

export function GridHarness() {
  const [rows, setRows] = useState<Row[]>([
    { year: 2020, amount: 50000, kind: 'wages', flag: false },
    { year: 2021, amount: 52000, kind: 'wages', flag: true },
  ])
  return (
    <div className="p-4">
      <DataGrid
        label="Harness grid"
        rows={rows}
        columns={columns}
        onChange={setRows}
        newRow={() => ({ year: 2000, amount: 0, kind: 'wages', flag: false })}
        validateRow={(r): Record<string, string> => (r.amount > 1e6 ? { amount: 'too large' } : {})}
      />
      <pre data-testid="harness-json" className="mt-4 text-xs">
        {JSON.stringify(rows)}
      </pre>
    </div>
  )
}
