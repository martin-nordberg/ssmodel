import { Field, FieldRow, Panel, SelectField } from '@/app/components/fields.tsx'
import { updateFile, useFile } from '@/state/scenario.ts'

const sexes = [
  { value: 'male' as const, label: 'Male' },
  { value: 'female' as const, label: 'Female' },
]

export function HouseholdPanel() {
  const file = useFile()
  if (!file) return null
  const { household: h } = file
  const { primary: p, spouse: s } = h.people
  return (
    <Panel title="Household" description="Facts shared by every scenario.">
      <FieldRow>
        <Field
          label="Base date (month)"
          type="yearMonth"
          value={h.baseDate}
          onCommit={(v) =>
            updateFile((f) => {
              f.household.baseDate = (v as string) < '2027-01' ? '2027-01' : (v as string)
            })
          }
        />
        <Field label="State" type="text" value={h.state} onCommit={() => {}} hint="South Carolina (fixed)" />
      </FieldRow>
      <h3 className="font-medium text-xs">Primary</h3>
      <FieldRow>
        <Field
          label="Name"
          type="text"
          value={p.name}
          onCommit={(v) =>
            updateFile((f) => {
              f.household.people.primary.name = v as string
            })
          }
        />
        <Field
          label="Birth date"
          type="date"
          value={p.birthDate}
          onCommit={(v) =>
            updateFile((f) => {
              f.household.people.primary.birthDate = v as string
            })
          }
        />
        <SelectField
          label="Sex (for life tables)"
          value={p.sex}
          options={sexes}
          onChange={(v) =>
            updateFile((f) => {
              f.household.people.primary.sex = v
            })
          }
        />
      </FieldRow>
      <h3 className="font-medium text-xs">Spouse</h3>
      <FieldRow>
        <Field
          label="Name"
          type="text"
          value={s.name}
          onCommit={(v) =>
            updateFile((f) => {
              f.household.people.spouse.name = v as string
            })
          }
        />
        <Field
          label="Birth date"
          type="date"
          value={s.birthDate}
          onCommit={(v) =>
            updateFile((f) => {
              f.household.people.spouse.birthDate = v as string
            })
          }
        />
        <SelectField
          label="Sex (for life tables)"
          value={s.sex}
          options={sexes}
          onChange={(v) =>
            updateFile((f) => {
              f.household.people.spouse.sex = v
            })
          }
        />
      </FieldRow>
      <h3 className="font-medium text-xs">IRMAA lookback (actual MAGI before the model starts)</h3>
      <FieldRow>
        {[0, 1].map((k) => {
          const year = String(Number(h.baseDate.slice(0, 4)) - 2 + k)
          return (
            <Field
              key={year}
              label={`${year} MAGI`}
              type="currency"
              optional
              value={h.priorMagi[year]}
              onCommit={(v) =>
                updateFile((f) => {
                  if (v === undefined) delete f.household.priorMagi[year]
                  else f.household.priorMagi[year] = v as number
                })
              }
            />
          )
        })}
      </FieldRow>
    </Panel>
  )
}
