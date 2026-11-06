import { Field, FieldRow, Panel } from '@/app/components/fields.tsx'
import { TIPS } from '@/app/tips.ts'
import { updateScenario, useActiveScenario, useFile } from '@/state/scenario.ts'

export function HealthcarePanel() {
  const s = useActiveScenario()
  const file = useFile()
  if (!s || !file) return null
  const h = s.healthcare
  return (
    <Panel
      title="Healthcare"
      description="Before 65: COBRA at a fixed premium, assumed to last until 65. From 65: Medicare Part B and D premiums (with IRMAA) come from the rule tables. Amounts are in base-date dollars and grow with medical inflation."
    >
      <FieldRow>
        <Field
          leverPath="healthcare.medicalInflationSpread"
          label="Medical inflation above CPI"
          tip={TIPS['healthcare.medicalInflationSpread']}
          type="percent"
          min={-0.05}
          max={0.1}
          value={h.medicalInflationSpread}
          onCommit={(v) =>
            updateScenario((d) => {
              d.healthcare.medicalInflationSpread = v as number
            })
          }
        />
      </FieldRow>
      {(['primary', 'spouse'] as const).map((who) => (
        <div key={who} className="grid gap-2">
          <h3 className="font-medium text-xs">Before Medicare — {file.household.people[who].name}</h3>
          <FieldRow>
            <Field
              label="COBRA premium (monthly)"
              tip={TIPS['healthcare.pre65.cobraMonthly']}
              type="currency"
              min={0}
              value={h.pre65[who].cobraMonthly}
              onCommit={(v) =>
                updateScenario((d) => {
                  d.healthcare.pre65[who].cobraMonthly = v as number
                })
              }
            />
            <Field
              label="COBRA starts (month)"
              tip={TIPS['healthcare.pre65.start']}
              type="yearMonth"
              optional
              value={h.pre65[who].start}
              hint="Blank = from the base date"
              onCommit={(v) =>
                updateScenario((d) => {
                  d.healthcare.pre65[who].start = v as string | undefined
                })
              }
            />
            <Field
              label="Out-of-pocket (annual)"
              tip={TIPS['healthcare.pre65.outOfPocket']}
              type="currency"
              min={0}
              value={h.pre65[who].outOfPocket}
              onCommit={(v) =>
                updateScenario((d) => {
                  d.healthcare.pre65[who].outOfPocket = v as number
                })
              }
            />
          </FieldRow>
        </div>
      ))}
      <h3 className="font-medium text-xs">Medicare (per person)</h3>
      <FieldRow>
        <Field
          leverPath="healthcare.medicare.medigapAnnual"
          label="Medigap / Advantage premium (annual)"
          tip={TIPS['healthcare.medicare.medigapAnnual']}
          type="currency"
          min={0}
          value={h.medicare.medigapAnnual}
          onCommit={(v) =>
            updateScenario((d) => {
              d.healthcare.medicare.medigapAnnual = v as number
            })
          }
        />
        <Field
          leverPath="healthcare.medicare.outOfPocket"
          label="Out-of-pocket (annual)"
          tip={TIPS['healthcare.medicare.outOfPocket']}
          type="currency"
          min={0}
          value={h.medicare.outOfPocket}
          onCommit={(v) =>
            updateScenario((d) => {
              d.healthcare.medicare.outOfPocket = v as number
            })
          }
        />
      </FieldRow>
    </Panel>
  )
}
