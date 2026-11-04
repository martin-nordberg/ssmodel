import { Field, FieldRow, Panel } from '@/app/components/fields.tsx'
import { DataGrid, type GridColumn } from '@/app/components/grid/DataGrid.tsx'
import type { ExpenseItemT } from '@/schema/model.ts'
import { updateScenario, useActiveScenario, useFile } from '@/state/scenario.ts'

const indexingOptions = [
  { value: 'inflation', label: 'Inflation' },
  { value: 'none', label: 'None (nominal)' },
  { value: 'medical', label: 'Medical inflation' },
  { value: 'fixed', label: 'Fixed rate' },
]

const columns: GridColumn<ExpenseItemT>[] = [
  {
    id: 'label',
    header: 'Label',
    type: 'text',
    width: 140,
    get: (r) => r.label,
    set: (r, v) => ({ ...r, label: v as string }),
  },
  {
    id: 'annual',
    header: 'Annual (base-date $)',
    type: 'currency',
    width: 130,
    min: 0,
    get: (r) => r.annual,
    set: (r, v) => ({ ...r, annual: v as number }),
  },
  {
    id: 'start',
    header: 'Start',
    type: 'yearMonth',
    width: 90,
    get: (r) => r.start,
    set: (r, v) => ({ ...r, start: v as string }),
  },
  {
    id: 'end',
    header: 'End',
    type: 'yearMonth',
    width: 90,
    optional: true,
    get: (r) => r.end,
    set: (r, v) => ({ ...r, end: v as string | undefined }),
  },
  {
    id: 'indexing',
    header: 'Indexing',
    type: 'select',
    width: 130,
    options: indexingOptions,
    get: (r) => (typeof r.indexing === 'number' ? 'fixed' : r.indexing),
    set: (r, v) => ({
      ...r,
      indexing: v === 'fixed' ? (typeof r.indexing === 'number' ? r.indexing : 0.03) : (v as 'inflation'),
    }),
  },
  {
    id: 'rate',
    header: 'Fixed rate',
    type: 'percent',
    width: 80,
    optional: true,
    get: (r) => (typeof r.indexing === 'number' ? r.indexing : undefined),
    set: (r, v) => (typeof r.indexing === 'number' && typeof v === 'number' ? { ...r, indexing: v } : r),
  },
  {
    id: 'oneTime',
    header: 'One-time',
    type: 'boolean',
    width: 70,
    get: (r) => r.oneTime,
    set: (r, v) => ({ ...r, oneTime: v as boolean }),
  },
  {
    id: 'perPerson',
    header: 'Per person',
    type: 'boolean',
    width: 80,
    get: (r) => r.perPerson,
    set: (r, v) => ({ ...r, perPerson: v as boolean }),
  },
]

export function ExpensesPanel() {
  const s = useActiveScenario()
  const file = useFile()
  if (!s || !file) return null
  return (
    <Panel
      title="Expenses"
      description="After-tax spending. Per-person items drop to the survivor fraction after the first death; a mortgage is usually nominal (no indexing) with an end month."
    >
      <FieldRow>
        <Field
          leverPath="expenses.survivorFraction"
          label="Survivor spending fraction"
          type="percent"
          min={0}
          max={1}
          value={s.expenses.survivorFraction}
          onCommit={(v) =>
            updateScenario((d) => {
              d.expenses.survivorFraction = v as number
            })
          }
        />
        <Field
          leverPath="expenses.bequestTarget"
          label="Bequest target (real, after tax)"
          type="currency"
          min={0}
          value={s.expenses.bequestTarget}
          onCommit={(v) =>
            updateScenario((d) => {
              d.expenses.bequestTarget = v as number
            })
          }
        />
      </FieldRow>
      <DataGrid
        label="Expenses"
        rows={s.expenses.items}
        columns={columns}
        newRow={(): ExpenseItemT => ({
          label: 'New expense',
          annual: 0,
          start: file.household.baseDate,
          indexing: 'inflation',
          oneTime: false,
          perPerson: false,
        })}
        onChange={(rows) =>
          updateScenario((d) => {
            d.expenses.items = rows
          })
        }
      />
    </Panel>
  )
}
