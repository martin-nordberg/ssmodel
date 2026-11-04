// Dev CLI: run the deterministic engine on a household file and print the year table.
// Usage: bun scripts/deterministic.ts <file.yaml> [claim YYYY-MM] [scenarioId]
import { formatAge, formatYM, parseYM } from '../src/engine/core/dates.ts'
import { prepare } from '../src/engine/model/prepare.ts'
import { runDeterministic } from '../src/engine/sim/deterministic.ts'
import { parseHouseholdYaml } from '../src/schema/yamlio.ts'

const [file, claimArg, scenarioId] = process.argv.slice(2)
if (!file) throw new Error('usage: bun scripts/deterministic.ts <file.yaml> [claim YYYY-MM] [scenarioId]')
const parsed = parseHouseholdYaml(await Bun.file(file).text())
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors, null, 2))
const prep = prepare(parsed.value, scenarioId)
const claim = claimArg ? parseYM(claimArg) : prep.people[0].age.fraMonth
const r = runDeterministic(prep, claim)
const k = (n: number) => (Math.round(n / 100) / 10).toFixed(1).padStart(7)
console.log(
  `claim ${formatYM(claim)} (${formatAge(prep.people[0].age.ageAt(claim))}); candidates ${prep.candidates.length}`,
)
if (prep.statementCheck) console.log('statement check', prep.statementCheck)
console.log(' year  ages    ssP    ssS   earn    rmd   inh   wdrw   exp  hlth  irmaa    fed     sc  short liquid')
for (const row of r.rows ?? []) {
  const w = row.withdrawals.reduce((a, b) => a + b, 0)
  console.log(
    `${row.year} ${row.ages.join('/')} ${k(row.ss[0])}${k(row.ss[1])}${k(row.earnings)}${k(row.rmd)}${k(row.inheritedDistributions)}${k(w)}${k(row.expenses)}${k(row.healthcare)}${k(row.irmaa)}${k(row.federalTax)}${k(row.scTax)}${k(row.shortfall)}${k(row.liquid)}`,
  )
}
console.log(r.summary)
