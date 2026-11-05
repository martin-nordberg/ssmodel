// Warnings [FR-UI-15, FR-DATA-2]: validation and modeling flags shown in the warnings panel.
import { formatYM } from '../core/dates.ts'
import type { Prepared } from '../model/prepare.ts'
import type { Recommendation } from '../recommend/recommend.ts'
import { federalRules, medicareRules, scRules, ssaRules } from '../rules/tables.ts'
import type { YearRow } from '../sim/path.ts'

export type Warning = { level: 'info' | 'warn'; text: string }

export function collectWarnings(
  prep: Prepared,
  rows: YearRow[],
  rec: Recommendation | null,
  withoutInheritance: Recommendation | null | undefined,
): Warning[] {
  const w: Warning[] = []
  const c = prep.statementCheck
  if (c?.warn) {
    w.push({
      level: 'warn',
      text: `Computed PIA (${Math.round(c.computed)}) differs from the SSA statement estimate (${Math.round(c.statement)}) by ${(c.diffPct * 100).toFixed(1)}%. Check the earnings record.`,
    })
  }
  if (!c && prep.scenario && prep.primaryPia.basePia(prep.baseYear - 1) === 0) {
    w.push({ level: 'warn', text: 'No earnings record: the Primary’s benefit is computed as zero.' })
  }
  // Projected rule tables [FR-DATA-2].
  const tables: [string, number][] = [
    ['IRS tax brackets', federalRules.latestYear],
    ['Medicare premiums and IRMAA', medicareRules.latestYear],
    ['South Carolina tax', scRules.latestYear],
    ['Social Security COLAs', ssaRules.latestColaYear],
    ['SSA earnings-test limits', ssaRules.latestEarningsTestYear],
  ]
  for (const [name, latest] of tables) {
    if (prep.baseYear > latest || prep.endYear > latest)
      w.push({
        level: 'info',
        text: `${name}: published through ${latest}; ${Math.max(prep.baseYear, latest + 1)} onward is projected with inflation.`,
      })
  }
  const irmaa = rows.filter((r) => r.irmaa > 0)
  if (irmaa.length > 0)
    w.push({
      level: 'warn',
      text: `IRMAA surcharges in ${irmaa.length} year(s), first in ${irmaa[0]!.year} (from income two years earlier).`,
    })
  // Itemized deductions [FR-TAX-6].
  const itemizing = rows.filter((r) => r.itemizing)
  if (itemizing.length > 0)
    w.push({
      level: 'info',
      text: `Itemizes deductions in ${itemizing.length} year(s), first in ${itemizing[0]!.year}; the standard deduction is used otherwise.`,
    })
  // Forced inherited-IRA lump sums at the 10-year deadline.
  for (const a of prep.accounts) {
    if (a.kind !== 'inherited_traditional') continue
    for (let i = 1; i < rows.length; i++) {
      const cur = (rows[i]!.required[a.index] ?? 0) + (rows[i]!.withdrawals[a.index] ?? 0)
      const prev = (rows[i - 1]!.required[a.index] ?? 0) + (rows[i - 1]!.withdrawals[a.index] ?? 0)
      if (cur > 25_000 && cur > 2 * prev + 1) {
        w.push({
          level: 'warn',
          text: `${a.label}: ${Math.round(cur).toLocaleString('en-US')} must come out in ${rows[i]!.year} (10-year deadline). Consider the Even or Bracket-aware schedule.`,
        })
        break
      }
    }
  }
  const depleted = rows.find((r) => r.shortfall > 1)
  if (depleted) w.push({ level: 'warn', text: `Savings run out in ${depleted.year} on the deterministic path.` })
  if (rec && !rec.floorsMet) w.push({ level: 'warn', text: 'No claiming date meets the success floor.' })
  if (rec && withoutInheritance && withoutInheritance.best.claim !== rec.best.claim)
    w.push({
      level: 'info',
      text: `The recommendation depends on the expected inheritances: without them it is ${formatYM(withoutInheritance.best.claim)} instead of ${formatYM(rec.best.claim)}.`,
    })
  return w
}
