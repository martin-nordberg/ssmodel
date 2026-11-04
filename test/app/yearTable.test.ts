import { expect, test } from 'bun:test'
import { toCsv, yearColumns } from '@/app/views/results/yearTable.ts'
import { prepare } from '@/engine/model/prepare.ts'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import { parseHouseholdYaml } from '@/schema/yamlio.ts'

test('CSV export has one line per year and converts to real dollars on request', async () => {
  const r = parseHouseholdYaml(await Bun.file(new URL('../fixtures/full.yaml', import.meta.url)).text())
  if (!r.ok) throw new Error('fixture')
  const prep = prepare(r.value)
  const res = runDeterministic(prep, prep.people[0].age.fraMonth)
  const cols = yearColumns(prep.accounts)
  const nominal = toCsv(res.rows!, cols, false).trim().split('\n')
  const real = toCsv(res.rows!, cols, true).trim().split('\n')
  expect(nominal.length).toBe(res.rows!.length + 1)
  expect(nominal[0]).toStartWith('Year,Ages,SS primary')
  const liquidIdx = cols.findIndex((c) => c.id === 'liquid')
  const last = res.rows!.at(-1)!
  expect(Number(nominal.at(-1)!.split(',')[liquidIdx])).toBe(Math.round(last.liquid))
  expect(Number(real.at(-1)!.split(',')[liquidIdx])).toBe(Math.round(last.liquid / last.price))
})
