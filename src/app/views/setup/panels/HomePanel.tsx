import { Field, FieldRow, Panel, SelectField, SwitchField } from '@/app/components/fields.tsx'
import { levelPayment, paymentsToPayoff } from '@/engine/accounts/mortgage.ts'
import { formatYM, parseYM, ymMonth, ymYear } from '@/engine/core/dates.ts'
import { Home, type ScenarioT } from '@/schema/model.ts'
import { updateScenario, useActiveScenario, useFile } from '@/state/scenario.ts'

type CostKey = keyof NonNullable<ScenarioT['home']>['costs']
const COSTS: { key: CostKey; label: string }[] = [
  { key: 'propertyTax', label: 'Property tax' },
  { key: 'insurance', label: 'Homeowners insurance' },
  { key: 'maintenance', label: 'Maintenance' },
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const money2 = (x: number) => `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Home [FR-ACC-7]: value, appreciation, the mortgage (from a statement), carrying costs, and an optional planned or
 * backstop sale, possibly downsizing to a replacement home with lower costs.
 */
export function HomePanel() {
  const s = useActiveScenario()
  const file = useFile()
  if (!s || !file) return null
  const h = s.home
  const mg = h?.mortgage
  const interest = mg ? (mg.balance * mg.rate) / 12 : 0
  const nPay = mg ? paymentsToPayoff(mg.balance, mg.rate / 12, mg.payment) : 0
  const mgBad = mg && !Number.isFinite(nPay)
  const payoff = mg && !mgBad ? parseYM(mg.asOf) + nPay : null
  return (
    <Panel
      title="Home"
      description="Home equity is not counted as liquid savings. It counts toward terminal wealth net of selling costs and any mortgage balance, and can be sold on a planned date or as a backstop when savings run low. Enter the mortgage, property tax, insurance and maintenance here, not under Expenses."
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
          </FieldRow>
          <h3 className="font-medium text-xs">Mortgage</h3>
          <FieldRow>
            <SwitchField
              label="We have a mortgage"
              checked={!!mg}
              onChange={(v) =>
                updateScenario((d) => {
                  const base = parseYM(file.household.baseDate)
                  d.home!.mortgage = v
                    ? {
                        balance: 200_000,
                        asOf: formatYM(base - 1),
                        rate: 0.065,
                        payment: Math.ceil(levelPayment(200_000, 0.065, 300) * 100) / 100,
                      }
                    : undefined
                })
              }
            />
            {mg && (
              <>
                <Field
                  label="Balance (from a statement)"
                  type="currency"
                  min={0}
                  value={mg.balance}
                  onCommit={(v) =>
                    updateScenario((d) => {
                      d.home!.mortgage!.balance = v as number
                    })
                  }
                />
                <Field
                  label="Balance as of (month)"
                  type="yearMonth"
                  value={mg.asOf}
                  hint="Balance after that month's payment"
                  onCommit={(v) =>
                    updateScenario((d) => {
                      d.home!.mortgage!.asOf = v as string
                    })
                  }
                />
                <Field
                  label="Interest rate"
                  type="percent"
                  min={0}
                  max={0.2}
                  value={mg.rate}
                  onCommit={(v) =>
                    updateScenario((d) => {
                      d.home!.mortgage!.rate = v as number
                    })
                  }
                />
                <Field
                  label="Monthly principal + interest"
                  type="currency"
                  min={0}
                  value={mg.payment}
                  hint="What you pay, without escrow"
                  onCommit={(v) =>
                    updateScenario((d) => {
                      d.home!.mortgage!.payment = v as number
                    })
                  }
                />
              </>
            )}
          </FieldRow>
          {mgBad && (
            <p className="text-destructive text-xs" role="alert">
              The payment must be more than the monthly interest ({money2(interest)}), or the loan never pays off.
            </p>
          )}
          {payoff !== null && (
            <p className="text-muted-foreground text-xs" data-testid="mortgage-note">
              Paid off in {MONTHS[ymMonth(payoff) - 1]} {ymYear(payoff)} ({nPay} more payments). Use the principal +
              interest from your statement, without escrow; if you regularly pay extra principal, include it. The
              payment is fixed in dollars and stops at payoff or a sale; the balance is paid from the sale proceeds.
              Interest is an itemized deduction (on up to $750,000 of debt).
            </p>
          )}
          <h3 className="font-medium text-xs">Annual costs (today's $, rise with inflation; end when sold)</h3>
          <FieldRow>
            {COSTS.map((c) => (
              <Field
                key={c.key}
                leverPath={`home.costs.${c.key}`}
                label={c.label}
                type="currency"
                min={0}
                value={h.costs[c.key]}
                hint={c.key === 'insurance' ? 'Escrowed or not' : undefined}
                onCommit={(v) =>
                  updateScenario((d) => {
                    d.home!.costs[c.key] = v as number
                  })
                }
              />
            ))}
          </FieldRow>
          <h3 className="font-medium text-xs">Sale</h3>
          <FieldRow>
            <SelectField
              label="Sale"
              value={h.sale.mode}
              options={[
                { value: 'none' as const, label: 'Keep' },
                { value: 'planned' as const, label: 'Planned date' },
                { value: 'backstop' as const, label: 'Backstop (low savings)' },
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
          {h.sale.replacementCost > 0 && (
            <>
              <h3 className="font-medium text-xs">Replacement home (bought with cash, no mortgage)</h3>
              <FieldRow>
                {COSTS.map((c) => (
                  <Field
                    key={c.key}
                    label={`${c.label} reduction`}
                    type="percent"
                    min={0}
                    max={1}
                    value={h.replacementCostCuts[c.key]}
                    hint={`${money2(h.costs[c.key] * (1 - h.replacementCostCuts[c.key])).replace(/\.00$/, '')}/yr after the move`}
                    onCommit={(v) =>
                      updateScenario((d) => {
                        d.home!.replacementCostCuts[c.key] = v as number
                      })
                    }
                  />
                ))}
              </FieldRow>
            </>
          )}
        </>
      )}
    </Panel>
  )
}
