import { Field, FieldRow, Panel, SelectField } from '@/app/components/fields.tsx'
import { DataGrid, type GridColumn } from '@/app/components/grid/DataGrid.tsx'
import { formatCurrency } from '@/app/components/grid/parse.ts'
import { formatAge, formatYM } from '@/engine/core/dates.ts'
import { updateFile, updateScenario, useActiveScenario, useFile, usePrepared } from '@/state/scenario.ts'

type Step = { effective: string; payablePercent: number }
const stepColumns: GridColumn<Step>[] = [
  {
    id: 'effective',
    header: 'From (month)',
    type: 'yearMonth',
    width: 110,
    get: (r) => r.effective,
    set: (r, v) => ({ ...r, effective: v as string }),
  },
  {
    id: 'pct',
    header: 'Payable %',
    type: 'number',
    width: 90,
    min: 0,
    max: 100,
    get: (r) => r.payablePercent,
    set: (r, v) => ({ ...r, payablePercent: v as number }),
  },
]

const presets = [
  { value: 'none' as const, label: 'No cut' },
  { value: 'trustees_2026_oasi' as const, label: 'Trustees 2026 OASI (78% from 2033)' },
  { value: 'trustees_2026_oasdi' as const, label: 'Trustees 2026 OASDI (83% from mid-2034)' },
  { value: 'custom' as const, label: 'Custom' },
]

export function SocialSecurityPanel() {
  const file = useFile()
  const s = useActiveScenario()
  const prep = usePrepared()
  if (!file || !s) return null
  const sp = file.household.people.spouse
  return (
    <Panel
      title="Social Security"
      description="The Spouse is already collecting on her own record; her PIA is derived from her current benefit."
    >
      <h3 className="font-medium text-xs">Spouse</h3>
      <FieldRow>
        <Field
          label="Current monthly benefit"
          type="currency"
          min={0}
          value={sp.ss.currentMonthly}
          onCommit={(v) =>
            updateFile((f) => {
              f.household.people.spouse.ss.currentMonthly = v as number
            })
          }
        />
        <Field
          label="Month her benefit started"
          type="yearMonth"
          value={sp.ss.claimedDate}
          onCommit={(v) =>
            updateFile((f) => {
              f.household.people.spouse.ss.claimedDate = v as string
            })
          }
        />
      </FieldRow>
      {prep && (
        <div className="rounded-md border bg-muted/40 p-2 text-xs" data-testid="ss-summary">
          <div>
            Primary: FRA {formatAge(prep.people[0].age.fraMonths)} in {formatYM(prep.people[0].age.fraMonth)}; claiming
            candidates{' '}
            {prep.candidates.length > 0
              ? `${formatYM(prep.candidates[0]!)} to ${formatYM(prep.candidates.at(-1)!)}`
              : 'none (past 70)'}
            .
          </div>
          <div>
            Spouse: derived PIA {formatCurrency(prep.spouse.pia)}; FRA {formatYM(prep.people[1].age.fraMonth)}.
          </div>
        </div>
      )}
      <h3 className="font-medium text-xs">Trust fund</h3>
      <FieldRow>
        <SelectField
          label="Benefit cut"
          value={s.trustFund.preset}
          options={presets}
          onChange={(v) =>
            updateScenario((d) => {
              d.trustFund.preset = v
            })
          }
          className="col-span-2"
        />
      </FieldRow>
      {s.trustFund.preset === 'custom' && (
        <DataGrid
          label="Trust fund steps"
          rows={s.trustFund.steps}
          columns={stepColumns}
          newRow={() => ({ effective: '2033-01', payablePercent: 80 })}
          onChange={(rows) =>
            updateScenario((d) => {
              d.trustFund.steps = rows
            })
          }
        />
      )}
    </Panel>
  )
}
