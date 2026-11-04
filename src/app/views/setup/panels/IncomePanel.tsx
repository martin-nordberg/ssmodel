import { Panel } from '@/app/components/fields.tsx'
import { DataGrid, type GridColumn } from '@/app/components/grid/DataGrid.tsx'
import type { AnnuityT, IncomeStreamT } from '@/schema/model.ts'
import { updateScenario, useActiveScenario, useFile } from '@/state/scenario.ts'

const people = [
  { value: 'primary', label: 'Primary' },
  { value: 'spouse', label: 'Spouse' },
]

const annuityColumns: GridColumn<AnnuityT>[] = [
  {
    id: 'label',
    header: 'Label',
    type: 'text',
    width: 120,
    get: (r) => r.label,
    set: (r, v) => ({ ...r, label: v as string }),
  },
  {
    id: 'owner',
    header: 'Owner',
    type: 'select',
    width: 80,
    options: people,
    get: (r) => r.owner,
    set: (r, v) => ({ ...r, owner: v as AnnuityT['owner'] }),
  },
  {
    id: 'monthly',
    header: 'Monthly payment',
    type: 'currency',
    width: 110,
    min: 0,
    get: (r) => r.monthly,
    set: (r, v) => ({ ...r, monthly: v as number }),
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
    id: 'cola',
    header: 'COLA',
    type: 'percent',
    width: 70,
    min: 0,
    max: 0.2,
    get: (r) => r.colaPercent,
    set: (r, v) => ({ ...r, colaPercent: v as number }),
  },
  {
    id: 'surv',
    header: 'Survivor %',
    type: 'percent',
    width: 80,
    min: 0,
    max: 1,
    get: (r) => r.survivorPercent,
    set: (r, v) => ({ ...r, survivorPercent: v as number }),
  },
  {
    id: 'qual',
    header: 'Qualified (IRA money)',
    type: 'boolean',
    width: 120,
    get: (r) => r.qualified,
    set: (r, v) => ({ ...r, qualified: v as boolean }),
  },
  {
    id: 'excl',
    header: 'Exclusion ratio',
    type: 'percent',
    width: 100,
    min: 0,
    max: 1,
    get: (r) => (r.qualified ? undefined : r.exclusionRatio),
    set: (r, v) => (r.qualified ? r : { ...r, exclusionRatio: v as number }),
  },
  {
    id: 'basis',
    header: 'Investment (basis)',
    type: 'currency',
    width: 110,
    optional: true,
    get: (r) => (r.qualified ? undefined : r.basis),
    set: (r, v) => (r.qualified ? r : { ...r, basis: v as number | undefined }),
  },
]

const streamColumns: GridColumn<IncomeStreamT>[] = [
  {
    id: 'label',
    header: 'Label',
    type: 'text',
    width: 130,
    get: (r) => r.label,
    set: (r, v) => ({ ...r, label: v as string }),
  },
  {
    id: 'owner',
    header: 'Owner',
    type: 'select',
    width: 80,
    options: [...people, { value: 'joint', label: 'Joint' }],
    get: (r) => r.owner,
    set: (r, v) => ({ ...r, owner: v as IncomeStreamT['owner'] }),
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
    width: 110,
    options: [
      { value: 'inflation', label: 'Inflation' },
      { value: 'none', label: 'None' },
    ],
    get: (r) => (typeof r.indexing === 'number' ? 'none' : r.indexing),
    set: (r, v) => ({ ...r, indexing: v as 'inflation' | 'none' }),
  },
  {
    id: 'tax',
    header: 'Tax',
    type: 'select',
    width: 90,
    options: [
      { value: 'ordinary', label: 'Taxable' },
      { value: 'tax_free', label: 'Tax-free' },
    ],
    get: (r) => r.tax,
    set: (r, v) => ({ ...r, tax: v as IncomeStreamT['tax'] }),
  },
]

/** Income other than Social Security and earnings [FR-INC-2, FR-INC-3]. No pensions in this household. */
export function IncomePanel() {
  const s = useActiveScenario()
  const file = useFile()
  if (!s || !file) return null
  return (
    <Panel
      title="Income"
      description="Annuities and other income streams (rental income, part-time work after the earnings grid ends)."
    >
      <h3 className="font-medium text-xs">Annuities</h3>
      <DataGrid
        label="Annuities"
        rows={s.income.annuities}
        columns={annuityColumns}
        newRow={(): AnnuityT => ({
          label: 'Annuity',
          owner: 'primary',
          monthly: 0,
          start: file.household.baseDate,
          colaPercent: 0,
          survivorPercent: 0,
          qualified: true,
          exclusionRatio: 0,
        })}
        onChange={(rows) =>
          updateScenario((d) => {
            d.income.annuities = rows
          })
        }
      />
      <h3 className="font-medium text-xs">Other income</h3>
      <DataGrid
        label="Income streams"
        rows={s.income.streams}
        columns={streamColumns}
        newRow={(): IncomeStreamT => ({
          label: 'Income',
          owner: 'joint',
          annual: 0,
          start: file.household.baseDate,
          indexing: 'inflation',
          tax: 'ordinary',
        })}
        onChange={(rows) =>
          updateScenario((d) => {
            d.income.streams = rows
          })
        }
      />
    </Panel>
  )
}
