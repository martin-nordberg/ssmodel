import { describe, expect, test } from 'bun:test'
import { parseHouseholdYaml, serializeHouseholdYaml } from '@/schema/yamlio.ts'

const fixture = (name: string) => Bun.file(new URL(`../fixtures/${name}`, import.meta.url)).text()

function mustParse(text: string) {
  const r = parseHouseholdYaml(text)
  if (!r.ok) throw new Error(JSON.stringify(r.errors, null, 2))
  return r
}

describe('parseHouseholdYaml', () => {
  test('minimal fixture parses with defaults filled', async () => {
    const r = mustParse(await fixture('minimal.yaml'))
    expect(r.value.household.baseDate).toBe('2027-01')
    expect(r.value.household.state).toBe('SC')
    const s = r.value.scenarios[0]!
    expect(s.strategy.withdrawal).toBe('bracket_fill')
    expect(s.expenses.survivorFraction).toBe(0.75)
    expect(s.simulation.paths).toBe(5000)
    expect(s.assumptions.mortality.mode).toBe('stochastic')
    expect(s.trustFund.preset).toBe('trustees_2026_oasi')
  })

  test('full fixture parses every section', async () => {
    const r = mustParse(await fixture('full.yaml'))
    const s = r.value.scenarios[0]!
    expect(s.accounts.map((a) => a.type)).toEqual([
      'roth_ira',
      'traditional_ira',
      'traditional_401k',
      'inherited_ira',
      'hsa',
      'taxable',
      'cash',
    ])
    expect(s.inheritances[0]!.realEstate[0]!.disposition).toBe('keep')
    expect(r.value.household.people.primary.earningsRecord.length).toBe(43)
    const roth = s.accounts[0]!
    expect(roth.type === 'roth_ira' && roth.return.preset).toBe('aggressive')
  })

  test('reports located validation errors', () => {
    const text = [
      'schemaVersion: 1',
      'household:',
      '  people:',
      '    primary:',
      '      birthDate: 1961-13-14',
      '    spouse:',
      '      birthDate: 1963-02-02',
      '      ss: { currentMonthly: -5, claimedDate: 2025-03 }',
      'scenarios:',
      '  - { id: base, name: Base }',
    ].join('\n')
    const r = parseHouseholdYaml(text)
    expect(r.ok).toBe(false)
    if (r.ok) return
    const byPath = Object.fromEntries(r.errors.map((e) => [e.path, e]))
    expect(byPath['household.people.primary.birthDate']?.line).toBe(5)
    expect(byPath['household.people.spouse.ss.currentMonthly']?.line).toBe(8)
  })

  test('missing required key reports the parent line', () => {
    const r = parseHouseholdYaml('schemaVersion: 1\nhousehold:\n  people:\n    primary: {}\nscenarios: []\n')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.find((e) => e.path === 'household.people.primary.birthDate')?.line).toBe(4)
    expect(r.errors.some((e) => e.path === 'scenarios')).toBe(true)
  })

  test('YAML syntax errors carry a line', () => {
    const r = parseHouseholdYaml('schemaVersion: 1\nhousehold: [\n')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.line).toBeGreaterThan(0)
  })

  test('refuses newer schema versions', () => {
    const r = parseHouseholdYaml('schemaVersion: 99\n')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/update the app/)
  })

  test('rejects base date before 2027-01', async () => {
    const text = (await fixture('minimal.yaml')).replace('household:\n', 'household:\n  baseDate: 2026-06\n')
    expect(parseHouseholdYaml(text).ok).toBe(false)
  })
})

describe('migration from schema version 1', () => {
  const v1 = async () =>
    (await fixture('full.yaml'))
      .replace('schemaVersion: 2', 'schemaVersion: 1 # old format')
      .replace(
        / {6}mortgage: .*\n {6}costs: .*\n {6}replacementCostCuts: .*\n/,
        '      mortgageExpense: Mortgage # linked row\n',
      )

  test('drops the mortgage-expense link with a note and marks the file migrated', async () => {
    const r = mustParse(await v1())
    expect(r.migrated).toBe(true)
    expect(r.value.schemaVersion).toBe(2)
    const home = r.value.scenarios[0]!.home!
    expect(home.mortgage).toBeUndefined()
    expect(home.costs).toEqual({ propertyTax: 0, insurance: 0, maintenance: 0 })
    expect('mortgageExpense' in home).toBe(false)
    expect(r.notes.length).toBe(1)
    expect(r.notes[0]).toMatch(/Base case.*"Mortgage"/)
  })

  test('saving a migrated file keeps its comments and writes the new version', async () => {
    const r = mustParse(await v1())
    const out = serializeHouseholdYaml(r.value, r.doc)
    expect(out).toMatch(/^schemaVersion: 2/m)
    expect(out).not.toMatch(/mortgageExpense/)
    expect(out).toMatch(/# from SSA statement/)
    expect(mustParse(out).migrated).toBe(false)
  })

  test('a current file is not migrated', async () => {
    const r = mustParse(await fixture('full.yaml'))
    expect(r.migrated).toBe(false)
    expect(r.notes).toEqual([])
    expect(r.value.scenarios[0]!.home!.mortgage!.balance).toBe(92340)
  })

  test('payoff must follow the balance date', async () => {
    const text = (await fixture('full.yaml')).replace('payoff: 2031-08', 'payoff: 2026-06')
    const r = parseHouseholdYaml(text)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]!.path).toBe('scenarios[0].home.mortgage.payoff')
  })
})

describe('serializeHouseholdYaml', () => {
  test('full fixture round-trips with comments kept', async () => {
    const text = await fixture('full.yaml')
    const r = mustParse(text)
    const out = serializeHouseholdYaml(r.value, r.doc)
    expect(out).toContain('# from SSA statement')
    expect(out).toContain('# IRMAA lookback')
    const again = mustParse(out)
    expect(again.value).toEqual(r.value)
    // Stable on the second pass.
    expect(serializeHouseholdYaml(again.value, again.doc)).toBe(out)
  })

  test('edits are merged without losing other comments', async () => {
    const r = mustParse(await fixture('full.yaml'))
    const v = structuredClone(r.value)
    v.household.people.spouse.ss.currentMonthly = 1500
    v.scenarios[0]!.expenses.items.pop()
    const out = serializeHouseholdYaml(v, r.doc)
    expect(out).toContain('# PIA derived from these')
    const again = mustParse(out)
    expect(again.value.household.people.spouse.ss.currentMonthly).toBe(1500)
    expect(again.value.scenarios[0]!.expenses.items.length).toBe(1)
  })

  test('serializes without a source document', async () => {
    const r = mustParse(await fixture('minimal.yaml'))
    const out = serializeHouseholdYaml(r.value)
    expect(mustParse(out).value).toEqual(r.value)
  })
})
