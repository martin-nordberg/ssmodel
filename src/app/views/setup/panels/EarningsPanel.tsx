import { Field, FieldRow, Panel } from '@/app/components/fields.tsx'
import { DataGrid, type GridColumn } from '@/app/components/grid/DataGrid.tsx'
import { formatCurrency, formatPercent } from '@/app/components/grid/parse.ts'
import { ymYear } from '@/engine/core/dates.ts'
import { updateFile, useFile, usePrepared } from '@/state/scenario.ts'

type RecordRow = { year: number; amount: number }
type ProjRow = { year: number; wages: number; selfEmployment: number }

const recordColumns: GridColumn<RecordRow>[] = [
  {
    id: 'year',
    header: 'Year',
    type: 'integer',
    width: 70,
    min: 1937,
    max: 2100,
    get: (r) => r.year,
    set: (r, v) => ({ ...r, year: v as number }),
  },
  {
    id: 'amount',
    header: 'Taxed SS earnings',
    type: 'currency',
    width: 140,
    min: 0,
    get: (r) => r.amount,
    set: (r, v) => ({ ...r, amount: v as number }),
  },
]

const projColumns: GridColumn<ProjRow>[] = [
  {
    id: 'year',
    header: 'Year',
    type: 'integer',
    width: 70,
    min: 2000,
    max: 2100,
    get: (r) => r.year,
    set: (r, v) => ({ ...r, year: v as number }),
  },
  {
    id: 'wages',
    header: 'Wages',
    type: 'currency',
    width: 110,
    min: 0,
    get: (r) => r.wages,
    set: (r, v) => ({ ...r, wages: v as number }),
  },
  {
    id: 'se',
    header: 'Self-employment (net)',
    type: 'currency',
    width: 140,
    min: 0,
    get: (r) => r.selfEmployment,
    set: (r, v) => ({ ...r, selfEmployment: v as number }),
  },
]

export function EarningsPanel() {
  const file = useFile()
  const prep = usePrepared()
  if (!file) return null
  const p = file.household.people.primary
  const nextYear = (rows: { year: number }[], fallback: number) =>
    rows.length ? Math.max(...rows.map((r) => r.year)) + 1 : fallback
  const baseYear = Number(file.household.baseDate.slice(0, 4))
  const check = prep?.statementCheck
  return (
    <Panel
      title="Earnings"
      description="Paste the earnings table from your my Social Security statement (Year and Taxed Social Security Earnings columns), then add projected earnings."
    >
      <FieldRow>
        <Field
          label="SSA statement FRA estimate (monthly)"
          type="currency"
          optional
          value={p.ss.fraEstimateMonthly}
          onCommit={(v) =>
            updateFile((f) => {
              f.household.people.primary.ss.fraEstimateMonthly = v as number | undefined
            })
          }
        />
        <Field
          label="Statement date (month)"
          type="yearMonth"
          optional
          value={p.ss.estimateAsOf}
          onCommit={(v) =>
            updateFile((f) => {
              f.household.people.primary.ss.estimateAsOf = v as string | undefined
            })
          }
        />
      </FieldRow>
      {prep && (
        <div className="rounded-md border bg-muted/40 p-2 text-xs" data-testid="pia-summary">
          <div>
            Computed PIA (before COLAs, eligibility year {prep.primaryPia.eligibilityYear}):{' '}
            <strong>{formatCurrency(prep.primaryPia.basePia(ymYear(prep.baseYM) - 1))}</strong> — AIME{' '}
            {formatCurrency(prep.primaryPia.aime(ymYear(prep.baseYM) - 1))}
          </div>
          {check && (
            <div className={check.warn ? 'text-destructive' : 'text-muted-foreground'}>
              Statement cross-check: computed {formatCurrency(check.computed)} vs statement{' '}
              {formatCurrency(check.statement)} ({check.diffPct >= 0 ? '+' : ''}
              {formatPercent(check.diffPct, 1)}){check.warn ? ' — more than 2% apart; check the earnings record.' : ''}
            </div>
          )}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-1">
          <h3 className="font-medium text-xs">Earnings record — {p.name}</h3>
          <DataGrid
            label="Earnings record"
            rows={p.earningsRecord}
            columns={recordColumns}
            maxHeight={360}
            newRow={() => ({ year: nextYear(p.earningsRecord, baseYear - 1), amount: 0 })}
            onChange={(rows) =>
              updateFile((f) => {
                f.household.people.primary.earningsRecord = rows
              })
            }
          />
        </div>
        <div className="grid content-start gap-4">
          {(['primary', 'spouse'] as const).map((who) => {
            const rows = file.household.people[who].earnings
            return (
              <div key={who} className="grid gap-1">
                <h3 className="font-medium text-xs">Projected earnings — {file.household.people[who].name}</h3>
                <DataGrid
                  label={`Projected earnings ${who}`}
                  rows={rows}
                  columns={projColumns}
                  newRow={() => ({ year: nextYear(rows, baseYear), wages: 0, selfEmployment: 0 })}
                  onChange={(r) =>
                    updateFile((f) => {
                      f.household.people[who].earnings = r
                    })
                  }
                />
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}
