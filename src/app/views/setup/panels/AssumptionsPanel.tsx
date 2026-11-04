import { Field, FieldRow, Panel, SelectField } from '@/app/components/fields.tsx'
import { updateScenario, useActiveScenario } from '@/state/scenario.ts'

export function AssumptionsPanel() {
  const s = useActiveScenario()
  if (!s) return null
  const a = s.assumptions
  return (
    <Panel title="Assumptions" description="Uncertain inputs. The Console's sliders override these temporarily.">
      <h3 className="font-medium text-xs">Inflation (AR(1))</h3>
      <FieldRow>
        <Field
          leverPath="assumptions.inflation.mean"
          label="Mean"
          type="percent"
          min={-0.05}
          max={0.2}
          value={a.inflation.mean}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.inflation.mean = v as number
            })
          }
        />
        <Field
          leverPath="assumptions.inflation.sd"
          label="Volatility"
          type="percent"
          min={0}
          max={0.2}
          value={a.inflation.sd}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.inflation.sd = v as number
            })
          }
        />
        <Field
          leverPath="assumptions.inflation.phi"
          label="Persistence (phi)"
          type="number"
          min={0}
          max={0.99}
          value={a.inflation.phi}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.inflation.phi = v as number
            })
          }
        />
        <Field
          leverPath="assumptions.realWageGrowth"
          label="Real wage growth"
          type="percent"
          min={-0.05}
          max={0.05}
          value={a.realWageGrowth}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.realWageGrowth = v as number
            })
          }
        />
      </FieldRow>
      <h3 className="font-medium text-xs">Returns</h3>
      <FieldRow>
        <SelectField
          label="Model"
          value={a.returns.model}
          options={[
            { value: 'parametric' as const, label: 'Parametric (lognormal)' },
            { value: 'bootstrap' as const, label: 'Historical bootstrap' },
            { value: 'deterministic' as const, label: 'Deterministic' },
          ]}
          onChange={(v) =>
            updateScenario((d) => {
              d.assumptions.returns.model = v
            })
          }
        />
        <Field
          leverPath="assumptions.returns.crossAccountCorrelation"
          label="Cross-account correlation"
          type="number"
          min={-1}
          max={1}
          value={a.returns.crossAccountCorrelation}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.returns.crossAccountCorrelation = v as number
            })
          }
        />
        <Field
          leverPath="assumptions.returns.inflationCorrelation"
          label="Correlation with inflation"
          type="number"
          min={-1}
          max={1}
          value={a.returns.inflationCorrelation}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.returns.inflationCorrelation = v as number
            })
          }
        />
        <Field
          leverPath="assumptions.returns.realReturnShift"
          label="Return shift (all accounts)"
          type="percent"
          min={-0.1}
          max={0.1}
          value={a.returns.realReturnShift}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.returns.realReturnShift = v as number
            })
          }
        />
        <Field
          leverPath="assumptions.returns.volatilityMultiplier"
          label="Volatility multiplier"
          type="number"
          min={0}
          max={3}
          value={a.returns.volatilityMultiplier}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.returns.volatilityMultiplier = v as number
            })
          }
        />
        <Field
          leverPath="assumptions.returns.blockLength"
          label="Bootstrap block (years)"
          type="integer"
          min={1}
          max={20}
          value={a.returns.blockLength}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.returns.blockLength = v as number
            })
          }
        />
      </FieldRow>
      <h3 className="font-medium text-xs">Longevity</h3>
      <FieldRow>
        <SelectField
          label="Mortality"
          value={a.mortality.mode}
          options={[
            { value: 'stochastic' as const, label: 'Stochastic (SSA life table)' },
            { value: 'fixed' as const, label: 'Fixed death ages' },
          ]}
          onChange={(v) =>
            updateScenario((d) => {
              d.assumptions.mortality.mode = v
            })
          }
        />
        {(['primary', 'spouse'] as const).map((who) => (
          <Field
            key={`d-${who}`}
            label={`Death age (${who}, fixed mode)`}
            type="number"
            min={60}
            max={110}
            value={a.mortality.deathAge[who]}
            onCommit={(v) =>
              updateScenario((d) => {
                d.assumptions.mortality.deathAge[who] = v as number
              })
            }
          />
        ))}
        {(['primary', 'spouse'] as const).map((who) => (
          <Field
            key={`o-${who}`}
            label={`Health age offset (${who})`}
            type="number"
            min={-15}
            max={15}
            value={a.mortality.ageOffset[who]}
            hint="+3 = mortality of someone 3 years older"
            onCommit={(v) =>
              updateScenario((d) => {
                d.assumptions.mortality.ageOffset[who] = v as number
              })
            }
          />
        ))}
      </FieldRow>
      <h3 className="font-medium text-xs">Other</h3>
      <FieldRow>
        <Field
          leverPath="assumptions.heirTaxRate"
          label="Heirs' tax rate on IRAs"
          type="percent"
          min={0}
          max={1}
          value={a.heirTaxRate}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.heirTaxRate = v as number
            })
          }
        />
        <Field
          leverPath="assumptions.expenseScale"
          label="Expense scale"
          type="number"
          min={0}
          max={3}
          value={a.expenseScale}
          onCommit={(v) =>
            updateScenario((d) => {
              d.assumptions.expenseScale = v as number
            })
          }
        />
      </FieldRow>
      <h3 className="font-medium text-xs">Simulation</h3>
      <FieldRow>
        <Field
          leverPath="simulation.paths"
          label="Paths"
          type="integer"
          min={100}
          max={100000}
          value={s.simulation.paths}
          onCommit={(v) =>
            updateScenario((d) => {
              d.simulation.paths = v as number
            })
          }
        />
        <Field
          leverPath="simulation.seed"
          label="Seed"
          type="integer"
          min={0}
          value={s.simulation.seed}
          onCommit={(v) =>
            updateScenario((d) => {
              d.simulation.seed = v as number
            })
          }
        />
        <Field
          leverPath="simulation.maxAge"
          label="Maximum age (younger spouse)"
          type="integer"
          min={85}
          max={120}
          value={s.simulation.maxAge}
          onCommit={(v) =>
            updateScenario((d) => {
              d.simulation.maxAge = v as number
            })
          }
        />
      </FieldRow>
    </Panel>
  )
}
