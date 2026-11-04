// Console charts [FR-OUT-2, FR-OUT-3, FR-UI-10, FR-UI-11] on Recharts. One y-axis per chart: estate and success
// probability are separate small multiples sharing the claim-age axis.
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatAge, type SsaAge, type YM } from '@/engine/core/dates.ts'
import type { FanPoint } from '@/engine/recommend/fan.ts'
import type { CandidateMetrics } from '@/engine/recommend/metrics.ts'
import type { YearRow } from '@/engine/sim/path.ts'
import { useUi } from '@/state/uiStore.ts'
import { ChartFrame, compactMoney, fullMoney } from './ChartFrame.tsx'

const AXIS = { fontSize: 11, fill: 'var(--muted-foreground)' }
const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
]

type HoverState = { activeLabel?: string | number }

function useHover() {
  const hoverYear = useUi((s) => s.hoverYear)
  const setHoverYear = useUi((s) => s.setHoverYear)
  return {
    hoverYear,
    handlers: {
      onMouseMove: (s: HoverState) => {
        const y = s?.activeLabel === undefined ? null : Number(s.activeLabel)
        if (y !== null && Number.isFinite(y) && y !== hoverYear) setHoverYear(y)
      },
      onMouseLeave: () => setHoverYear(null),
    },
  }
}

function TipBox({ title, items }: { title: string; items: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-sm">
      <div className="font-medium">{title}</div>
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2">
          {i.color && <span className="inline-block size-2 rounded-sm" style={{ background: i.color }} />}
          <span className="text-muted-foreground">{i.label}</span>
          <span className="ml-auto font-mono tabular-nums">{i.value}</span>
        </div>
      ))}
    </div>
  )
}

// ---------- claim-age curve ----------

export function ClaimCurveChart({
  metrics,
  age,
  recommended,
  shown,
  successFloor,
  baseline,
  onPick,
}: {
  metrics: CandidateMetrics[]
  age: SsaAge
  recommended: YM | null
  shown: YM | null
  successFloor: number
  baseline: CandidateMetrics[] | null
  onPick: (claim: YM) => void
}) {
  const base = new Map(baseline?.map((m) => [m.claim, m]) ?? [])
  const data = metrics.map((m) => ({
    claim: m.claim,
    x: age.ageAt(m.claim) / 12,
    label: formatAge(age.ageAt(m.claim)),
    band: [m.terminal.p10, m.terminal.p90] as [number, number],
    p50: m.terminal.p50,
    success: m.successProb * 100,
    baseP50: base.get(m.claim)?.terminal.p50,
    baseSuccess: base.has(m.claim) ? base.get(m.claim)!.successProb * 100 : undefined,
  }))
  const xOf = (c: YM | null) => (c === null ? undefined : age.ageAt(c) / 12)
  const pick = (s: { activeIndex?: number | string | null }) => {
    const i = Number(s?.activeIndex)
    const c = Number.isInteger(i) ? data[i]?.claim : undefined
    if (c !== undefined) onPick(c)
  }

  const xAxis = (
    <XAxis
      dataKey="x"
      type="number"
      domain={['dataMin', 'dataMax']}
      tick={AXIS}
      tickFormatter={(v: number) => `${Math.floor(v)}`}
      allowDecimals={false}
      stroke="var(--grid-line)"
    />
  )
  const refs = (
    <>
      {recommended !== null && <ReferenceLine x={xOf(recommended)} stroke="var(--foreground)" strokeDasharray="4 3" />}
      {shown !== null && shown !== recommended && <ReferenceLine x={xOf(shown)} stroke="var(--muted-foreground)" />}
    </>
  )
  const legend = [
    { label: 'Median estate', color: 'var(--band-line)' },
    { label: '10th–90th percentile', color: 'var(--band-outer)', band: true },
    ...(baseline ? [{ label: 'Baseline', color: 'var(--ghost)', dashed: true }] : []),
  ]
  return (
    <ChartFrame
      title="After-tax estate by claiming age (today's $)"
      legend={legend}
      table={{
        columns: ['Claim age', '10th pct', 'Median', '90th pct', 'Success'],
        rows: data.map((d) => [
          d.label,
          fullMoney(d.band[0]),
          fullMoney(d.p50),
          fullMoney(d.band[1]),
          `${d.success.toFixed(1)}%`,
        ]),
      }}
      note="Click a point to inspect that claiming date. Dashed line: recommended."
    >
      <div className="grid gap-1" data-testid="claim-curve">
        <ResponsiveContainer width="100%" height={170}>
          <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 4 }} onClick={pick} syncId="claim">
            <CartesianGrid vertical={false} stroke="var(--grid-line)" />
            {xAxis}
            <YAxis tick={AXIS} tickFormatter={compactMoney} width={56} stroke="var(--grid-line)" />
            <Tooltip
              content={({ active, payload }) => {
                const d = active ? payload?.[0]?.payload : null
                if (!d) return null
                return (
                  <TipBox
                    title={`Claim at ${d.label}`}
                    items={[
                      { label: 'Median estate', value: fullMoney(d.p50), color: 'var(--band-line)' },
                      { label: '10th–90th', value: `${compactMoney(d.band[0])} – ${compactMoney(d.band[1])}` },
                      { label: 'Success', value: `${d.success.toFixed(1)}%` },
                    ]}
                  />
                )
              }}
            />
            <Area dataKey="band" stroke="none" fill="var(--band-outer)" fillOpacity={0.8} isAnimationActive={false} />
            {baseline && (
              <Line
                dataKey="baseP50"
                stroke="var(--ghost)"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              dataKey="p50"
              stroke="var(--band-line)"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)', fill: 'var(--band-line)' }}
              activeDot={{ r: 6, stroke: 'var(--background)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {refs}
          </ComposedChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={100}>
          <ComposedChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }} onClick={pick} syncId="claim">
            <CartesianGrid vertical={false} stroke="var(--grid-line)" />
            {xAxis}
            <YAxis
              tick={AXIS}
              domain={[(min: number) => Math.max(0, Math.floor(min / 5) * 5 - 5), 100]}
              tickFormatter={(v: number) => `${v}%`}
              width={56}
              stroke="var(--grid-line)"
            />
            <Tooltip content={() => null} cursor={{ stroke: 'var(--muted-foreground)' }} />
            <ReferenceLine y={successFloor * 100} stroke="var(--muted-foreground)" strokeDasharray="2 3" />
            {baseline && (
              <Line
                dataKey="baseSuccess"
                stroke="var(--ghost)"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line dataKey="success" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            {refs}
          </ComposedChart>
        </ResponsiveContainer>
        <span className="text-[11px] text-muted-foreground">
          <span className="mr-1 inline-block h-0.5 w-3 bg-[var(--series-2)] align-middle" />
          Success probability (dotted line: floor)
        </span>
      </div>
    </ChartFrame>
  )
}

// ---------- balance fan ----------

export function FanChart({
  fan,
  baseline,
  stacked,
  accountLabels,
}: {
  fan: FanPoint[]
  baseline: FanPoint[] | null
  stacked: { year: number; values: number[] }[] | null
  accountLabels: string[]
}) {
  const { hoverYear, handlers } = useHover()
  if (stacked) {
    const data = stacked.map((s) => Object.fromEntries([['year', s.year], ...s.values.map((v, i) => [`a${i}`, v])]))
    const shownAccounts = accountLabels
      .map((l, i) => ({ l, i }))
      .filter(({ i }) => stacked.some((s) => (s.values[i] ?? 0) > 1))
    return (
      <ChartFrame
        title="Median balance by account (today's $)"
        legend={shownAccounts.map(({ l, i }) => ({ label: l, color: SERIES[i % SERIES.length]!, band: true }))}
        table={{
          columns: ['Year', ...shownAccounts.map(({ l }) => l)],
          rows: stacked.map((s) => [s.year, ...shownAccounts.map(({ i }) => fullMoney(s.values[i] ?? 0))]),
        }}
        note="Each account's median across paths; the medians do not add up to the median total."
      >
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 4 }} {...handlers}>
            <CartesianGrid vertical={false} stroke="var(--grid-line)" />
            <XAxis dataKey="year" tick={AXIS} stroke="var(--grid-line)" />
            <YAxis tick={AXIS} tickFormatter={compactMoney} width={56} stroke="var(--grid-line)" />
            <Tooltip formatter={(v) => fullMoney(Number(v))} contentStyle={{ fontSize: 11 }} />
            {shownAccounts.map(({ l, i }) => (
              <Area
                key={i}
                dataKey={`a${i}`}
                name={l}
                stackId="acc"
                stroke="var(--background)"
                strokeWidth={1}
                fill={SERIES[i % SERIES.length]}
                fillOpacity={0.85}
                isAnimationActive={false}
              />
            ))}
            {hoverYear !== null && <ReferenceLine x={hoverYear} stroke="var(--muted-foreground)" />}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
    )
  }
  const base = new Map(baseline?.map((p) => [p.year, p.p50]) ?? [])
  const data = fan.map((p) => ({ ...p, outer: [p.p10, p.p90], inner: [p.p25, p.p75], base: base.get(p.year) }))
  return (
    <ChartFrame
      title="Total liquid savings (today's $)"
      legend={[
        { label: 'Median', color: 'var(--band-line)' },
        { label: '25th–75th', color: 'var(--band-inner)', band: true },
        { label: '10th–90th', color: 'var(--band-outer)', band: true },
        ...(baseline ? [{ label: 'Baseline median', color: 'var(--ghost)', dashed: true }] : []),
      ]}
      table={{
        columns: ['Year', '10th', '25th', 'Median', '75th', '90th', 'Household alive'],
        rows: fan.map((p) => [
          p.year,
          fullMoney(p.p10),
          fullMoney(p.p25),
          fullMoney(p.p50),
          fullMoney(p.p75),
          fullMoney(p.p90),
          `${Math.round(p.alive * 100)}%`,
        ]),
      }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={data}
          margin={{ top: 6, right: 12, bottom: 0, left: 4 }}
          {...handlers}
          data-testid="fan-chart"
        >
          <CartesianGrid vertical={false} stroke="var(--grid-line)" />
          <XAxis dataKey="year" tick={AXIS} stroke="var(--grid-line)" />
          <YAxis tick={AXIS} tickFormatter={compactMoney} width={56} stroke="var(--grid-line)" />
          <Tooltip
            content={({ active, payload }) => {
              const d = active ? payload?.[0]?.payload : null
              if (!d) return null
              return (
                <TipBox
                  title={String(d.year)}
                  items={[
                    { label: '90th', value: fullMoney(d.p90) },
                    { label: '75th', value: fullMoney(d.p75) },
                    { label: 'Median', value: fullMoney(d.p50), color: 'var(--band-line)' },
                    { label: '25th', value: fullMoney(d.p25) },
                    { label: '10th', value: fullMoney(d.p10) },
                  ]}
                />
              )
            }}
          />
          <Area dataKey="outer" stroke="none" fill="var(--band-outer)" fillOpacity={0.9} isAnimationActive={false} />
          <Area dataKey="inner" stroke="none" fill="var(--band-inner)" fillOpacity={0.9} isAnimationActive={false} />
          {baseline && (
            <Line
              dataKey="base"
              stroke="var(--ghost)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line dataKey="p50" stroke="var(--band-line)" strokeWidth={2} dot={false} isAnimationActive={false} />
          {hoverYear !== null && <ReferenceLine x={hoverYear} stroke="var(--muted-foreground)" />}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

// ---------- income stack and taxes (median path) ----------

type StackSeries = { key: string; label: string; value: (r: YearRow) => number }

function StackedYears({
  title,
  rows,
  real,
  series,
  line,
}: {
  title: string
  rows: YearRow[]
  real: boolean
  series: StackSeries[]
  line?: StackSeries
}) {
  const { hoverYear, handlers } = useHover()
  const conv = (r: YearRow, v: number) => (real ? v / r.price : v)
  const data = rows.map((r) =>
    Object.fromEntries([
      ['year', r.year],
      ...series.map((s) => [s.key, conv(r, s.value(r))]),
      ...(line ? [[line.key, conv(r, line.value(r))]] : []),
    ]),
  )
  const all = line ? [...series, line] : series
  return (
    <ChartFrame
      title={title}
      legend={[
        ...series.map((s, i) => ({ label: s.label, color: SERIES[i]!, band: true })),
        ...(line ? [{ label: line.label, color: 'var(--foreground)', dashed: true }] : []),
      ]}
      table={{
        columns: ['Year', ...all.map((s) => s.label)],
        rows: data.map((d) => [d.year as number, ...all.map((s) => fullMoney(Number(d[s.key])))]),
      }}
      note="Median path (the path with the median after-tax estate)."
    >
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 4 }} {...handlers}>
          <CartesianGrid vertical={false} stroke="var(--grid-line)" />
          <XAxis dataKey="year" tick={AXIS} stroke="var(--grid-line)" />
          <YAxis tick={AXIS} tickFormatter={compactMoney} width={56} stroke="var(--grid-line)" />
          <Tooltip formatter={(v) => fullMoney(Number(v))} contentStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="s"
              fill={SERIES[i]}
              stroke="var(--background)"
              strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
          {line && (
            <Line
              dataKey={line.key}
              name={line.label}
              stroke="var(--foreground)"
              strokeDasharray="4 3"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {hoverYear !== null && <ReferenceLine x={hoverYear} stroke="var(--muted-foreground)" />}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export function IncomeChart({ rows, real }: { rows: YearRow[]; real: boolean }) {
  return (
    <StackedYears
      title={`Where the money comes from (${real ? "today's $" : 'nominal $'})`}
      rows={rows}
      real={real}
      series={[
        { key: 'ss', label: 'Social Security', value: (r) => r.ss[0] + r.ss[1] },
        { key: 'earn', label: 'Earnings + other', value: (r) => r.earnings + r.otherIncome + (r.inheritances ?? 0) },
        { key: 'req', label: 'RMDs + inherited IRA', value: (r) => r.rmd + r.inheritedDistributions },
        {
          key: 'wd',
          label: 'Other withdrawals',
          value: (r) => r.withdrawals.reduce((a, b) => a + b, 0) + r.hsaMedical,
        },
      ]}
      line={{ key: 'spend', label: 'Spending + tax', value: (r) => r.expenses + r.healthcare + r.totalTax }}
    />
  )
}

export function TaxChart({ rows, real }: { rows: YearRow[]; real: boolean }) {
  return (
    <StackedYears
      title={`Taxes and IRMAA (${real ? "today's $" : 'nominal $'})`}
      rows={rows}
      real={real}
      series={[
        { key: 'fed', label: 'Federal income tax', value: (r) => r.federalTax },
        { key: 'sc', label: 'SC tax', value: (r) => r.scTax },
        { key: 'pay', label: 'Payroll tax', value: (r) => r.payrollTax },
        { key: 'irmaa', label: 'IRMAA', value: (r) => r.irmaa },
      ]}
    />
  )
}
