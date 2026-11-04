import { Field, FieldRow, Panel, SelectField, SwitchField } from '@/app/components/fields.tsx'
import { Home } from '@/schema/model.ts'
import { updateScenario, useActiveScenario } from '@/state/scenario.ts'

/** Home equity [FR-ACC-7]: value, appreciation, mortgage link, and an optional planned or backstop sale. */
export function HomePanel() {
  const s = useActiveScenario()
  if (!s) return null
  const h = s.home
  return (
    <Panel
      title="Home"
      description="Home equity is not counted as liquid savings. It counts toward terminal wealth net of selling costs, and can be sold on a planned date or as a backstop when savings run low."
    >
      <SwitchField
        label="We own a home"
        checked={!!h}
        onChange={(v) =>
          updateScenario((d) => {
            d.home = v ? Home.parse({ value: 400_000 }) : undefined
          })
        }
      />
      {h && (
        <>
          <FieldRow>
            <Field
              label="Value today"
              type="currency"
              min={0}
              value={h.value}
              onCommit={(v) =>
                updateScenario((d) => {
                  d.home!.value = v as number
                })
              }
            />
            <Field
              label="Cost basis"
              type="currency"
              min={0}
              value={h.basis}
              onCommit={(v) =>
                updateScenario((d) => {
                  d.home!.basis = v as number
                })
              }
            />
            <Field
              label="Appreciation (mean)"
              type="percent"
              min={-0.1}
              max={0.2}
              value={h.appreciation.mean}
              onCommit={(v) =>
                updateScenario((d) => {
                  d.home!.appreciation.mean = v as number
                })
              }
            />
            <Field
              label="Appreciation (volatility)"
              type="percent"
              min={0}
              max={0.5}
              value={h.appreciation.sd}
              onCommit={(v) =>
                updateScenario((d) => {
                  d.home!.appreciation.sd = v as number
                })
              }
            />
            <SelectField
              label="Mortgage expense (stops on sale)"
              value={h.mortgageExpense ?? ''}
              options={[
                { value: '', label: 'None' },
                ...s.expenses.items.filter((e) => !e.oneTime).map((e) => ({ value: e.label, label: e.label })),
              ]}
              onChange={(v) =>
                updateScenario((d) => {
                  d.home!.mortgageExpense = v || undefined
                })
              }
            />
          </FieldRow>
          <h3 className="font-medium text-xs">Sale</h3>
          <FieldRow>
            <SelectField
              label="Sale"
              value={h.sale.mode}
              options={[
                { value: 'none' as const, label: 'Keep' },
                { value: 'planned' as const, label: 'Planned date' },
                { value: 'backstop' as const, label: 'Backstop (sell if savings run low)' },
              ]}
              onChange={(v) =>
                updateScenario((d) => {
                  d.home!.sale.mode = v
                })
              }
            />
            {h.sale.mode === 'planned' && (
              <Field
                label="Sale month"
                type="yearMonth"
                optional
                value={h.sale.date}
                onCommit={(v) =>
                  updateScenario((d) => {
                    d.home!.sale.date = v as string | undefined
                  })
                }
              />
            )}
            {h.sale.mode === 'backstop' && (
              <Field
                label="Sell when savings fall below (today's $)"
                type="currency"
                min={0}
                value={h.sale.liquidFloor}
                onCommit={(v) =>
                  updateScenario((d) => {
                    d.home!.sale.liquidFloor = v as number
                  })
                }
              />
            )}
            <Field
              label="Selling costs"
              type="percent"
              min={0}
              max={0.2}
              value={h.sale.sellingCostPct}
              onCommit={(v) =>
                updateScenario((d) => {
                  d.home!.sale.sellingCostPct = v as number
                })
              }
            />
            <Field
              label="Replacement home cost (downsizing, today's $)"
              type="currency"
              min={0}
              value={h.sale.replacementCost}
              onCommit={(v) =>
                updateScenario((d) => {
                  d.home!.sale.replacementCost = v as number
                })
              }
            />
          </FieldRow>
        </>
      )}
    </Panel>
  )
}
