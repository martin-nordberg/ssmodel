import { useState } from 'react'
import { Panel, SelectField } from '@/app/components/fields.tsx'
import { DataGrid, type GridColumn } from '@/app/components/grid/DataGrid.tsx'
import { Inheritance, type InheritanceT, InheritedRealEstate } from '@/schema/model.ts'
import { updateScenario, useActiveScenario } from '@/state/scenario.ts'

type RealEstateT = InheritanceT['realEstate'][number]

const columns: GridColumn<InheritanceT>[] = [
  {
    id: 'label',
    header: 'Label',
    type: 'text',
    width: 130,
    get: (r) => r.label,
    set: (r, v) => ({ ...r, label: v as string }),
  },
  {
    id: 'heir',
    header: 'Heir',
    type: 'select',
    width: 80,
    options: [
      { value: 'primary', label: 'Primary' },
      { value: 'spouse', label: 'Spouse' },
    ],
    get: (r) => r.heir,
    set: (r, v) => ({ ...r, heir: v as InheritanceT['heir'] }),
  },
  {
    id: 'dob',
    header: 'Decedent born',
    type: 'date',
    width: 100,
    get: (r) => r.decedentBirthDate,
    set: (r, v) => ({ ...r, decedentBirthDate: v as string }),
  },
  {
    id: 'sex',
    header: 'Sex',
    type: 'select',
    width: 70,
    options: [
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
    ],
    get: (r) => r.decedentSex,
    set: (r, v) => ({ ...r, decedentSex: v as InheritanceT['decedentSex'] }),
  },
  {
    id: 'timing',
    header: 'Timing',
    type: 'select',
    width: 110,
    options: [
      { value: 'mortality', label: 'Life table' },
      { value: 'fixed', label: 'Fixed date' },
      { value: 'window', label: 'Window' },
    ],
    get: (r) => r.timing.mode,
    set: (r, v) => ({ ...r, timing: { ...r.timing, mode: v as InheritanceT['timing']['mode'] } }),
  },
  {
    id: 'date',
    header: 'Date / from',
    type: 'yearMonth',
    width: 90,
    optional: true,
    get: (r) => (r.timing.mode === 'fixed' ? r.timing.date : r.timing.mode === 'window' ? r.timing.from : undefined),
    set: (r, v) => ({
      ...r,
      timing:
        r.timing.mode === 'fixed'
          ? { ...r.timing, date: v as string | undefined }
          : { ...r.timing, from: v as string | undefined },
    }),
  },
  {
    id: 'to',
    header: 'To',
    type: 'yearMonth',
    width: 90,
    optional: true,
    get: (r) => (r.timing.mode === 'window' ? r.timing.to : undefined),
    set: (r, v) => (r.timing.mode === 'window' ? { ...r, timing: { ...r.timing, to: v as string | undefined } } : r),
  },
  {
    id: 'offset',
    header: 'Health offset (yrs)',
    type: 'number',
    width: 100,
    min: -20,
    max: 20,
    get: (r) => (r.timing.mode === 'mortality' ? r.timing.ageOffset : undefined),
    set: (r, v) => ({ ...r, timing: { ...r.timing, ageOffset: v as number } }),
  },
  {
    id: 'trad',
    header: 'Traditional IRA',
    type: 'currency',
    width: 110,
    min: 0,
    get: (r) => r.amounts.traditionalIra,
    set: (r, v) => ({ ...r, amounts: { ...r.amounts, traditionalIra: v as number } }),
  },
  {
    id: 'roth',
    header: 'Roth IRA',
    type: 'currency',
    width: 100,
    min: 0,
    get: (r) => r.amounts.rothIra,
    set: (r, v) => ({ ...r, amounts: { ...r.amounts, rothIra: v as number } }),
  },
  {
    id: 'non',
    header: 'Non-IRA',
    type: 'currency',
    width: 100,
    min: 0,
    get: (r) => r.amounts.nonIra,
    set: (r, v) => ({ ...r, amounts: { ...r.amounts, nonIra: v as number } }),
  },
  {
    id: 'growth',
    header: 'Real growth',
    type: 'percent',
    width: 80,
    min: -0.2,
    max: 0.2,
    get: (r) => r.growth.realRate,
    set: (r, v) => ({ ...r, growth: { ...r.growth, realRate: v as number } }),
  },
  {
    id: 'spend',
    header: 'Spend-down / yr',
    type: 'currency',
    width: 100,
    min: 0,
    get: (r) => r.growth.annualSpendDown,
    set: (r, v) => ({ ...r, growth: { ...r.growth, annualSpendDown: v as number } }),
  },
  {
    id: 'prob',
    header: 'Probability',
    type: 'percent',
    width: 80,
    min: 0,
    max: 1,
    get: (r) => r.probability,
    set: (r, v) => ({ ...r, probability: v as number }),
  },
  {
    id: 'pre',
    header: 'If heir has died',
    type: 'select',
    width: 120,
    options: [
      { value: 'surviving_spouse', label: 'To surviving spouse' },
      { value: 'lost', label: 'Lost to household' },
    ],
    get: (r) => r.ifHeirPredeceases,
    set: (r, v) => ({ ...r, ifHeirPredeceases: v as InheritanceT['ifHeirPredeceases'] }),
  },
  {
    id: 'class',
    header: 'IRA rule',
    type: 'select',
    width: 120,
    options: [
      { value: 'designated', label: '10-year' },
      { value: 'eligible_designated', label: 'Stretch (EDB)' },
    ],
    get: (r) => r.beneficiaryClass,
    set: (r, v) => ({ ...r, beneficiaryClass: v as InheritanceT['beneficiaryClass'] }),
  },
]

const reColumns: GridColumn<RealEstateT>[] = [
  {
    id: 'label',
    header: 'Property',
    type: 'text',
    width: 120,
    get: (r) => r.label,
    set: (r, v) => ({ ...r, label: v as string }),
  },
  {
    id: 'value',
    header: 'Value today',
    type: 'currency',
    width: 110,
    min: 0,
    get: (r) => r.value,
    set: (r, v) => ({ ...r, value: v as number }),
  },
  {
    id: 'disp',
    header: 'On receipt',
    type: 'select',
    width: 100,
    options: [
      { value: 'sell_on_receipt', label: 'Sell' },
      { value: 'keep', label: 'Keep' },
    ],
    get: (r) => r.disposition,
    set: (r, v) => ({ ...r, disposition: v as RealEstateT['disposition'] }),
  },
  {
    id: 'mean',
    header: 'Appreciation',
    type: 'percent',
    width: 90,
    get: (r) => r.appreciation.mean,
    set: (r, v) => ({ ...r, appreciation: { ...r.appreciation, mean: v as number } }),
  },
  {
    id: 'sd',
    header: 'Volatility',
    type: 'percent',
    width: 80,
    min: 0,
    get: (r) => r.appreciation.sd,
    set: (r, v) => ({ ...r, appreciation: { ...r.appreciation, sd: v as number } }),
  },
  {
    id: 'carry',
    header: 'Carrying costs / yr',
    type: 'currency',
    width: 120,
    min: 0,
    get: (r) => r.carryingCosts,
    set: (r, v) => ({ ...r, carryingCosts: v as number }),
  },
  {
    id: 'rent',
    header: 'Net rent / yr',
    type: 'currency',
    width: 100,
    min: 0,
    get: (r) => r.rentalIncome,
    set: (r, v) => ({ ...r, rentalIncome: v as number }),
  },
  {
    id: 'sale',
    header: 'Later sale',
    type: 'select',
    width: 100,
    options: [
      { value: 'none', label: 'Keep' },
      { value: 'planned', label: 'Planned' },
      { value: 'backstop', label: 'Backstop' },
    ],
    get: (r) => r.sale.mode,
    set: (r, v) => ({ ...r, sale: { ...r.sale, mode: v as RealEstateT['sale']['mode'] } }),
  },
  {
    id: 'date',
    header: 'Sale month',
    type: 'yearMonth',
    width: 90,
    optional: true,
    get: (r) => r.sale.date,
    set: (r, v) => ({ ...r, sale: { ...r.sale, date: v as string | undefined } }),
  },
  {
    id: 'floor',
    header: 'Backstop floor',
    type: 'currency',
    width: 100,
    min: 0,
    get: (r) => r.sale.liquidFloor,
    set: (r, v) => ({ ...r, sale: { ...r.sale, liquidFloor: v as number } }),
  },
  {
    id: 'cost',
    header: 'Selling costs',
    type: 'percent',
    width: 90,
    min: 0,
    max: 0.2,
    get: (r) => r.sale.sellingCostPct,
    set: (r, v) => ({ ...r, sale: { ...r.sale, sellingCostPct: v as number } }),
  },
]

/** Future inheritances [§3.9, FR-INH-1, FR-INH-7]. */
export function InheritancesPanel() {
  const s = useActiveScenario()
  const [sel, setSel] = useState(0)
  if (!s) return null
  const current = s.inheritances[Math.min(sel, s.inheritances.length - 1)]
  const idx = Math.min(sel, s.inheritances.length - 1)
  return (
    <Panel
      title="Inheritances"
      description="Amounts in today's dollars. Inherited IRAs follow the 10-year rule (with annual RMDs when the decedent had started them); non-IRA assets get a stepped-up basis. The recommendation is also shown without inheritances."
    >
      <DataGrid
        label="Inheritances"
        rows={s.inheritances}
        columns={columns}
        newRow={() => Inheritance.parse({ label: 'Inheritance', heir: 'primary', decedentBirthDate: '1940-01-01' })}
        onChange={(rows) =>
          updateScenario((d) => {
            d.inheritances = rows
          })
        }
      />
      {current && (
        <>
          <SelectField
            label="Real estate in"
            value={idx}
            options={s.inheritances.map((h, i) => ({ value: i, label: h.label }))}
            onChange={setSel}
            className="w-64"
          />
          <DataGrid
            label="Inherited real estate"
            rows={current.realEstate}
            columns={reColumns}
            newRow={() => InheritedRealEstate.parse({ label: 'Property', value: 0 })}
            onChange={(rows) =>
              updateScenario((d) => {
                d.inheritances[idx]!.realEstate = rows
              })
            }
          />
        </>
      )}
    </Panel>
  )
}
