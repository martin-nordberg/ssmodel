// Generates synthetic encrypted .checquery files with Checquery's own server code, plus reference output from
// that same code, for the P0 spike. Run with Bun: `bun spike/checquery/makeFixture.ts`. Needs a Checquery
// checkout (CHECQUERY_DIR, default ../checquery). Synthetic data only.

import { Database } from 'bun:sqlite'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { checquery } from './checquery.ts'

export const fixturePassword = 'spike-fixture-password'
const outDir = new URL('../.out/', import.meta.url).pathname

/** Small deterministic PRNG (mulberry32), so fixtures are reproducible. */
function prng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface FixtureSpec {
  name: string
  firstMonth: string // YYYY-MM
  months: number
  seed: number
}

export const fixtures: FixtureSpec[] = [
  { name: 'small', firstMonth: '2025-07', months: 4, seed: 7 },
  // About the size of the household's real file: ~1,100 transactions.
  { name: 'large', firstMonth: '2019-01', months: 94, seed: 11 },
]

async function makeFixture(spec: FixtureSpec): Promise<void> {
  const cq = await checquery()
  const path = `${outDir}${spec.name}.checquery`
  rmSync(path, { force: true })
  const created = await cq.db.createNewFile(outDir, spec.name, fixturePassword, 'enabled', {
    name: 'spike-fixture',
    ipAddress: '127.0.0.1',
  })
  if (!created.ok) throw new Error(created.error)
  const svcs = created.store.svcs
  const origId = created.origId
  const rand = prng(spec.seed)
  const amt = (cents: number) => cq.money.fromCents(cents)

  const ctg = async (parentCtgId: string, acctType: string, name: string) => {
    const id = cq.ids.genAcctCtgId()
    await svcs.accountCategories.createAccountCategory(
      cq.schemas.accountCategoryCreationEventSchema.parse({ id, origId, parentCtgId, acctType, name }),
    )
    return id
  }
  const acct = async (parentCtgId: string, acctType: string, name: string) => {
    const id = cq.ids.genAcctId()
    await svcs.accounts.createAccount(
      cq.schemas.accountCreationEventSchema.parse({ id, origId, parentCtgId, acctType, name }),
    )
    return id
  }

  const roots = cq.roots
  const bank = await ctg(roots.assets, 'ASSET', 'Bank')
  const cards = await ctg(roots.liabilities, 'LIABILITY', 'Cards')
  const work = await ctg(roots.income, 'INCOME', 'Work')
  const household = await ctg(roots.expenses, 'EXPENSE', 'Household')
  const fun = await ctg(roots.expenses, 'EXPENSE', 'Fun')

  const checking = await acct(bank, 'ASSET', 'Checking')
  const savings = await acct(bank, 'ASSET', 'Savings')
  const unused = await acct(bank, 'ASSET', 'Old account')
  const visa = await acct(cards, 'LIABILITY', 'Visa')
  const salary = await acct(work, 'INCOME', 'Salary')
  const interest = await acct(work, 'INCOME', 'Interest')
  const groceries = await acct(household, 'EXPENSE', 'Groceries')
  const utilities = await acct(household, 'EXPENSE', 'Utilities')
  const dining = await acct(fun, 'EXPENSE', 'Dining')

  // Account patch and delete, so replay sees both.
  await svcs.accounts.patchAccount(
    cq.schemas.accountPatchEventSchema.parse({ id: savings, origId, name: 'High-yield savings' }),
  )
  await svcs.accounts.deleteAccount(cq.schemas.accountDeletionEventSchema.parse({ id: unused, origId }))

  const grocer = cq.ids.genVndrId()
  await svcs.vendors.createVendor(
    cq.schemas.vendorCreationEventSchema.parse({ id: grocer, origId, name: 'Corner Grocer', defaultAcctId: groceries }),
  )

  const txnIds: string[] = []
  const txn = async (
    postDate: string,
    description: string,
    from: string,
    to: string,
    cents: number,
    vndrId?: string,
  ) => {
    const id = cq.ids.genTxnId()
    await svcs.transactions.createTransaction(
      cq.schemas.transactionCreationEventSchema.parse({
        id,
        origId,
        postDate,
        description,
        vndrId,
        entries: [
          { acctId: to, debit: amt(cents) },
          { acctId: from, credit: amt(cents) },
        ],
      }),
    )
    txnIds.push(id)
    return id
  }

  const [y0, m0] = spec.firstMonth.split('-').map(Number) as [number, number]
  for (let i = 0; i < spec.months; i++) {
    const y = y0 + Math.floor((m0 - 1 + i) / 12)
    const m = ((m0 - 1 + i) % 12) + 1
    const d = (day: number) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    await txn(d(1), 'Paycheck', salary, checking, 310_000 + Math.round(rand() * 5_000))
    await txn(d(15), 'Paycheck', salary, checking, 310_000 + Math.round(rand() * 5_000))
    for (const day of [3, 10, 17, 24])
      await txn(d(day), 'Groceries', visa, groceries, Math.round(8_000 + rand() * 9_000), grocer)
    for (const day of [6, 20, 27]) await txn(d(day), 'Dinner out', visa, dining, Math.round(2_500 + rand() * 6_000))
    await txn(d(12), 'Electric and water', checking, utilities, Math.round(14_000 + rand() * 9_000))
    await txn(d(18), 'Card payment', checking, visa, Math.round(70_000 + rand() * 20_000))
    await txn(d(25), 'To savings', checking, savings, 50_000)
    await txn(d(28), 'Interest', interest, savings, Math.round(rand() * 4_000) + 100)
  }

  // Patches (amount or date) and deletes spread through the log.
  for (let i = 0; i < txnIds.length; i += 1) {
    const id = txnIds[i] as string
    if (i % 23 === 5) {
      await svcs.transactions.patchTransaction(
        cq.schemas.transactionPatchEventSchema.parse({
          id,
          origId,
          entries: [
            { acctId: dining, debit: amt(4_321 + i) },
            { acctId: visa, credit: amt(4_321 + i) },
          ],
        }),
      )
    } else if (i % 31 === 7) {
      await svcs.transactions.patchTransaction(
        cq.schemas.transactionPatchEventSchema.parse({ id, origId, description: 'Edited', needsReview: true }),
      )
    } else if (i % 47 === 9) {
      await svcs.transactions.deleteTransaction(cq.schemas.transactionDeletionEventSchema.parse({ id, origId }))
    }
  }
  await svcs.balanceAssertions.createBalanceAssertion(
    cq.schemas.balanceAssertionCreationEventSchema.parse({
      id: cq.ids.genAsrtId(),
      origId,
      acctId: checking,
      assertionDate: `${y0}-${String(m0).padStart(2, '0')}-28`,
      balance: amt(123_456),
    }),
  )
  cq.db.closeCurrentFile()

  // Reference: every payload decrypted by Checquery's node:crypto code.
  const raw = new Database(path, { readonly: true })
  const meta = Object.fromEntries(
    (raw.query('SELECT key, value FROM _checquery_meta').all() as { key: string; value: string }[]).map((r) => [
      r.key,
      r.value,
    ]),
  )
  const key = cq.crypto.verifyPassword(fixturePassword, {
    kdfSalt: meta.kdf_salt,
    kdfParams: JSON.parse(meta.kdf_params as string),
    verifyIv: meta.verify_iv,
    verifyCiphertext: meta.verify_ciphertext,
  })
  if (!key) throw new Error('Checquery could not verify its own password')
  const rows = raw.query('SELECT id, iv, encrypted_payload FROM actions ORDER BY hlc').all() as {
    id: string
    iv: string
    encrypted_payload: string
  }[]
  const plaintexts = Object.fromEntries(
    rows.map((r) => [r.id, cq.crypto.decryptPayload(key, r.iv, r.encrypted_payload)]),
  )
  raw.close()
  writeFileSync(
    `${outDir}${spec.name}.reference.json`,
    `${JSON.stringify({ password: fixturePassword, actions: rows.length, plaintexts }, null, 1)}\n`,
  )
  console.log(`${spec.name}: ${rows.length} actions, ${txnIds.length} transactions`)
}

if (import.meta.main) {
  mkdirSync(outDir, { recursive: true })
  for (const spec of fixtures) await makeFixture(spec)
}
