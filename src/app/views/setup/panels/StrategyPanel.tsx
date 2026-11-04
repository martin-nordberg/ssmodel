import { Field, FieldRow, Panel, SelectField, SwitchField } from '@/app/components/fields.tsx'
import type { BracketT } from '@/schema/model.ts'
import { updateScenario, useActiveScenario } from '@/state/scenario.ts'

const brackets: { value: BracketT; label: string }[] = [
  { value: 0.1, label: '10%' },
  { value: 0.12, label: '12%' },
  { value: 0.22, label: '22%' },
  { value: 0.24, label: '24%' },
  { value: 0.32, label: '32%' },
]
const tiers = [0, 1, 2, 3, 4, 5].map((t) => ({
  value: t,
  label: t === 0 ? 'No surcharge (tier 0)' : t === 5 ? 'No cap' : `Tier ${t}`,
}))
const schedules = [
  { value: 'even' as const, label: 'Even' },
  { value: 'back_loaded' as const, label: 'Back-loaded' },
  { value: 'bracket_aware' as const, label: 'Bracket-aware' },
]

export function StrategyPanel() {
  const s = useActiveScenario()
  if (!s) return null
  const st = s.strategy
  return (
    <Panel title="Strategy" description="How withdrawals are chosen each year, and what the recommendation optimizes.">
      <FieldRow>
        <SelectField
          label="Withdrawal strategy"
          value={st.withdrawal}
          options={[
            { value: 'bracket_fill' as const, label: 'Bracket-fill' },
            { value: 'conventional' as const, label: 'Conventional' },
            { value: 'proportional' as const, label: 'Proportional' },
            { value: 'custom' as const, label: 'Custom order' },
          ]}
          onChange={(v) =>
            updateScenario((d) => {
              d.strategy.withdrawal = v
            })
          }
        />
        <SelectField
          label="Target bracket"
          value={st.targetBracket}
          options={brackets}
          onChange={(v) =>
            updateScenario((d) => {
              d.strategy.targetBracket = v
            })
          }
        />
        <SelectField
          label="IRMAA cap"
          value={st.irmaaCapTier}
          options={tiers}
          onChange={(v) =>
            updateScenario((d) => {
              d.strategy.irmaaCapTier = v
            })
          }
        />
        <SelectField
          label="Inherited traditional schedule"
          value={st.inheritedIraSchedule.traditional}
          options={schedules}
          onChange={(v) =>
            updateScenario((d) => {
              d.strategy.inheritedIraSchedule.traditional = v
            })
          }
        />
        <SelectField
          label="Inherited Roth schedule"
          value={st.inheritedIraSchedule.roth}
          options={schedules}
          onChange={(v) =>
            updateScenario((d) => {
              d.strategy.inheritedIraSchedule.roth = v
            })
          }
        />
      </FieldRow>
      <h3 className="font-medium text-xs">Roth conversions</h3>
      <FieldRow>
        <SwitchField
          label="Convert in low-income years"
          checked={st.rothConversions.enabled}
          onChange={(v) =>
            updateScenario((d) => {
              d.strategy.rothConversions.enabled = v
            })
          }
        />
        <SelectField
          label="Up to bracket"
          value={st.rothConversions.upToBracket}
          options={brackets}
          onChange={(v) =>
            updateScenario((d) => {
              d.strategy.rothConversions.upToBracket = v
            })
          }
        />
        <SelectField
          label="IRMAA cap"
          value={st.rothConversions.irmaaCapTier}
          options={tiers}
          onChange={(v) =>
            updateScenario((d) => {
              d.strategy.rothConversions.irmaaCapTier = v
            })
          }
        />
        <Field
          label="Start year"
          type="integer"
          optional
          value={st.rothConversions.startYear}
          onCommit={(v) =>
            updateScenario((d) => {
              d.strategy.rothConversions.startYear = v as number | undefined
            })
          }
        />
        <SelectField
          label="Until"
          value={typeof st.rothConversions.until === 'number' ? 'year' : st.rothConversions.until}
          options={[
            { value: 'claim', label: 'Social Security claim' },
            { value: 'rmd', label: 'RMD age' },
            { value: 'year', label: 'A year' },
          ]}
          onChange={(v) =>
            updateScenario((d) => {
              d.strategy.rothConversions.until = v === 'year' ? 2035 : (v as 'claim' | 'rmd')
            })
          }
        />
        {typeof st.rothConversions.until === 'number' && (
          <Field
            leverPath="strategy.rothConversions.until"
            label="Until year"
            type="integer"
            value={st.rothConversions.until}
            onCommit={(v) =>
              updateScenario((d) => {
                d.strategy.rothConversions.until = v as number
              })
            }
          />
        )}
      </FieldRow>
      <h3 className="font-medium text-xs">Recommendation</h3>
      <FieldRow>
        <Field
          leverPath="objective.successFloor"
          label="Success floor"
          type="percent"
          min={0}
          max={1}
          value={s.objective.successFloor}
          onCommit={(v) =>
            updateScenario((d) => {
              d.objective.successFloor = v as number
            })
          }
        />
        <Field
          leverPath="objective.bequestFloor"
          label="Bequest floor"
          type="percent"
          min={0}
          max={1}
          value={s.objective.bequestFloor}
          onCommit={(v) =>
            updateScenario((d) => {
              d.objective.bequestFloor = v as number
            })
          }
        />
        <Field
          leverPath="objective.runnerUpTolerance"
          label="Runner-up tolerance"
          type="percent"
          min={0}
          max={1}
          value={s.objective.runnerUpTolerance}
          onCommit={(v) =>
            updateScenario((d) => {
              d.objective.runnerUpTolerance = v as number
            })
          }
        />
      </FieldRow>
    </Panel>
  )
}
