import { Panel } from '@/app/components/fields.tsx'
import { DataGrid, type GridColumn } from '@/app/components/grid/DataGrid.tsx'
import { Account, type AccountT } from '@/schema/model.ts'
import { updateScenario, useActiveScenario } from '@/state/scenario.ts'

type Regular = Exclude<AccountT, { type: 'inherited_ira' }>
type Inherited = Extract<AccountT, { type: 'inherited_ira' }>

const typeOptions = [
  { value: 'traditional_ira', label: 'Traditional IRA' },
  { value: 'traditional_401k', label: 'Traditional 401(k)' },
  { value: 'roth_ira', label: 'Roth IRA' },
  { value: 'roth_401k', label: 'Roth 401(k)' },
  { value: 'hsa', label: 'HSA' },
  { value: 'taxable', label: 'Taxable brokerage' },
  { value: 'cash', label: 'Cash reserve' },
]
const ownerOptions = [
  { value: 'primary', label: 'Primary' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'joint', label: 'Joint' },
]
const presetOptions = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'cash', label: 'Cash' },
]

const has = <K extends string>(r: object, k: K): r is Record<K, unknown> => k in r

/** Rebuild an account as a new type, keeping the fields they share. */
function retype(r: Regular, type: string): Regular {
  const jointOk = type === 'taxable' || type === 'cash'
  const owner = r.owner === 'joint' && !jointOk ? 'primary' : r.owner
  const base: Record<string, unknown> = { type, owner, balance: r.balance, label: r.label }
  if (type !== 'cash' && has(r, 'return')) base.return = r.return
  return Account.parse(base) as Regular
}

function setField<T extends object>(r: T, key: string, value: unknown, applies: boolean): T {
  if (!applies) return r
  return { ...r, [key]: value }
}

const ret = (r: Regular) => (r.type === 'cash' ? undefined : r.return)

const regularColumns: GridColumn<Regular>[] = [
  {
    id: 'type',
    header: 'Type',
    type: 'select',
    width: 140,
    options: typeOptions,
    get: (r) => r.type,
    set: (r, v) => retype(r, v as string),
  },
  {
    id: 'label',
    header: 'Label',
    type: 'text',
    optional: true,
    width: 120,
    get: (r) => r.label,
    set: (r, v) => ({ ...r, label: v as string | undefined }),
  },
  {
    id: 'owner',
    header: 'Owner',
    type: 'select',
    width: 80,
    options: ownerOptions,
    get: (r) => r.owner,
    set: (r, v) => (v === 'joint' && r.type !== 'taxable' && r.type !== 'cash' ? r : ({ ...r, owner: v } as Regular)),
  },
  {
    id: 'balance',
    header: 'Balance',
    type: 'currency',
    width: 110,
    min: 0,
    get: (r) => r.balance,
    set: (r, v) => ({ ...r, balance: v as number }),
  },
  {
    id: 'preset',
    header: 'Return preset',
    type: 'select',
    width: 110,
    options: presetOptions,
    get: (r) => (r.type === 'cash' ? undefined : (ret(r)?.preset ?? 'moderate')),
    set: (r, v) => (r.type === 'cash' ? r : ({ ...r, return: { ...r.return, preset: v as 'moderate' } } as Regular)),
  },
  {
    id: 'mean',
    header: 'Mean (override)',
    type: 'percent',
    optional: true,
    width: 100,
    get: (r) => ret(r)?.mean,
    set: (r, v) =>
      r.type === 'cash' ? r : ({ ...r, return: { ...r.return, mean: v as number | undefined } } as Regular),
  },
  {
    id: 'sd',
    header: 'Volatility (override)',
    type: 'percent',
    optional: true,
    width: 110,
    get: (r) => ret(r)?.sd,
    set: (r, v) =>
      r.type === 'cash' ? r : ({ ...r, return: { ...r.return, sd: v as number | undefined } } as Regular),
  },
  {
    id: 'fee',
    header: 'Fee',
    type: 'percent',
    width: 70,
    min: 0,
    max: 0.05,
    get: (r) => (r.type === 'cash' ? undefined : r.fee),
    set: (r, v) => setField(r, 'fee', v, r.type !== 'cash'),
  },
  {
    id: 'basis',
    header: 'Cost basis',
    type: 'currency',
    optional: true,
    width: 100,
    get: (r) => (r.type === 'taxable' ? r.costBasis : undefined),
    set: (r, v) => setField(r, 'costBasis', v, r.type === 'taxable'),
  },
  {
    id: 'yield',
    header: 'Dividend yield',
    type: 'percent',
    width: 90,
    get: (r) => (r.type === 'taxable' ? r.dividendYield : undefined),
    set: (r, v) => setField(r, 'dividendYield', v, r.type === 'taxable'),
  },
  {
    id: 'rate',
    header: 'Cash rate',
    type: 'percent',
    width: 80,
    get: (r) => (r.type === 'cash' ? r.rate : undefined),
    set: (r, v) => setField(r, 'rate', v, r.type === 'cash'),
  },
  {
    id: 'target',
    header: 'Reserve (months)',
    type: 'number',
    width: 100,
    min: 0,
    max: 60,
    get: (r) => (r.type === 'cash' ? r.targetMonths : undefined),
    set: (r, v) => setField(r, 'targetMonths', v, r.type === 'cash'),
  },
  {
    id: 'employer',
    header: 'Current employer',
    type: 'boolean',
    width: 100,
    get: (r) => (r.type === 'traditional_401k' ? r.currentEmployer : undefined),
    set: (r, v) => setField(r, 'currentEmployer', v, r.type === 'traditional_401k'),
  },
  {
    id: 'hsaFirst',
    header: 'HSA pays medical',
    type: 'boolean',
    width: 100,
    get: (r) => (r.type === 'hsa' ? r.payMedicalFirst : undefined),
    set: (r, v) => setField(r, 'payMedicalFirst', v, r.type === 'hsa'),
  },
  {
    id: 'hsaContrib',
    header: 'HSA contribution/yr',
    type: 'currency',
    width: 110,
    get: (r) => (r.type === 'hsa' ? r.annualContribution : undefined),
    set: (r, v) => setField(r, 'annualContribution', v, r.type === 'hsa'),
  },
]

const inheritedColumns: GridColumn<Inherited>[] = [
  {
    id: 'label',
    header: 'Label',
    type: 'text',
    optional: true,
    width: 120,
    get: (r) => r.label,
    set: (r, v) => ({ ...r, label: v as string | undefined }),
  },
  {
    id: 'flavor',
    header: 'Kind',
    type: 'select',
    width: 100,
    options: [
      { value: 'traditional', label: 'Traditional' },
      { value: 'roth', label: 'Roth' },
    ],
    get: (r) => r.flavor,
    set: (r, v) => ({ ...r, flavor: v as 'traditional' | 'roth' }),
  },
  {
    id: 'beneficiary',
    header: 'Beneficiary',
    type: 'select',
    width: 90,
    options: ownerOptions.slice(0, 2),
    get: (r) => r.beneficiary,
    set: (r, v) => ({ ...r, beneficiary: v as 'primary' | 'spouse' }),
  },
  {
    id: 'balance',
    header: 'Balance',
    type: 'currency',
    width: 110,
    min: 0,
    get: (r) => r.balance,
    set: (r, v) => ({ ...r, balance: v as number }),
  },
  {
    id: 'dob',
    header: 'Owner born',
    type: 'date',
    width: 100,
    get: (r) => r.decedentBirthDate,
    set: (r, v) => ({ ...r, decedentBirthDate: v as string }),
  },
  {
    id: 'dod',
    header: 'Owner died',
    type: 'date',
    width: 100,
    get: (r) => r.decedentDeathDate,
    set: (r, v) => ({ ...r, decedentDeathDate: v as string }),
  },
  {
    id: 'class',
    header: 'Beneficiary class',
    type: 'select',
    width: 140,
    options: [
      { value: 'designated', label: 'Designated (10-year)' },
      { value: 'eligible_designated', label: 'Eligible (stretch)' },
    ],
    get: (r) => r.beneficiaryClass,
    set: (r, v) => ({ ...r, beneficiaryClass: v as Inherited['beneficiaryClass'] }),
  },
  {
    id: 'schedule',
    header: 'Schedule',
    type: 'select',
    width: 120,
    options: [
      { value: '', label: 'Strategy default' },
      { value: 'even', label: 'Even' },
      { value: 'back_loaded', label: 'Back-loaded' },
      { value: 'bracket_aware', label: 'Bracket-aware' },
    ],
    get: (r) => r.schedule ?? '',
    set: (r, v) => ({ ...r, schedule: v === '' ? undefined : (v as Inherited['schedule']) }),
  },
  {
    id: 'preset',
    header: 'Return preset',
    type: 'select',
    width: 110,
    options: presetOptions,
    get: (r) => r.return.preset ?? 'moderate',
    set: (r, v) => ({ ...r, return: { ...r.return, preset: v as 'moderate' } }),
  },
  {
    id: 'fee',
    header: 'Fee',
    type: 'percent',
    width: 70,
    min: 0,
    max: 0.05,
    get: (r) => r.fee,
    set: (r, v) => ({ ...r, fee: v as number }),
  },
]

export function AccountsPanel() {
  const s = useActiveScenario()
  if (!s) return null
  const regular = s.accounts.filter((a): a is Regular => a.type !== 'inherited_ira')
  const inherited = s.accounts.filter((a): a is Inherited => a.type === 'inherited_ira')
  const save = (r: Regular[], i: Inherited[]) =>
    updateScenario((d) => {
      d.accounts = [...r, ...i]
    })
  return (
    <Panel
      title="Accounts"
      description="Balances on the base date. Returns are nominal annual means before fees; a mean or volatility entered overrides the preset."
    >
      <DataGrid
        label="Accounts"
        rows={regular}
        columns={regularColumns}
        newRow={() => Account.parse({ type: 'traditional_ira', owner: 'primary' }) as Regular}
        onChange={(rows) => save(rows, inherited)}
      />
      <h3 className="font-medium text-xs">Inherited IRAs</h3>
      <p className="text-muted-foreground text-xs">
        The deadline, whether annual RMDs apply, and the divisor are derived from the original owner's dates.
      </p>
      <DataGrid
        label="Inherited IRAs"
        rows={inherited}
        columns={inheritedColumns}
        newRow={() =>
          Account.parse({
            type: 'inherited_ira',
            beneficiary: 'primary',
            decedentBirthDate: '1940-01-01',
            decedentDeathDate: '2025-01-01',
          }) as Inherited
        }
        onChange={(rows) => save(regular, rows)}
      />
    </Panel>
  )
}
