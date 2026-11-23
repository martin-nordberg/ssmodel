import type { PayloadCodec } from '@/store/actionLog/encryption/PayloadCodec.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'

/**
 * Rewrites every stored amount from Checquery's `$#,###.##` strings to integer cents [D: OQ-LED-2, NFR-ARCH-12]:
 * transaction entries' `debit` and `credit`, and balance assertions' `balance`, in create and update actions.
 * Every rewritten payload is re-encrypted under a fresh IV, with all rows updated in one transaction, so a failure
 * leaves the log as it was. Like the schema migrations, this is frozen: it doesn't use the live domain schemas.
 */

const amountRegex = /^((\$\d{1,3}(,\d{3})*\.\d{2})|(\(\$\d{1,3}(,\d{3})*\.\d{2}\)))$/

/** Parses `$1,234.56` or `($1,234.56)` to cents. Numbers (already migrated) pass through. */
export function legacyAmountToCents(value: unknown, where: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value !== 'string' || !amountRegex.test(value.trim())) {
    throw new Error(`${where}: not a currency amount: ${JSON.stringify(value)}`)
  }
  const text = value.trim()
  const negative = text.startsWith('(')
  const cents = parseInt(text.replace(/[()$,.]/g, ''), 10)
  return negative && cents !== 0 ? -cents : cents
}

type Payload = Record<string, unknown>

/** The payload with its amounts in cents, or null when it has none to change. */
export function centsPayload(actionType: string, payload: Payload, where: string): Payload | null {
  if (actionType === 'create-transaction' || actionType === 'update-transaction') {
    if (!Array.isArray(payload.entries)) return null
    const entries = (payload.entries as Payload[]).map((entry, i) => {
      const out: Payload = { ...entry }
      for (const field of ['debit', 'credit'] as const) {
        if (field in entry) out[field] = legacyAmountToCents(entry[field], `${where} entry ${i} ${field}`)
      }
      return out
    })
    return { ...payload, entries }
  }
  if (actionType === 'create-balance-assertion' || actionType === 'update-balance-assertion') {
    if (!('balance' in payload)) return null
    return { ...payload, balance: legacyAmountToCents(payload.balance, `${where} balance`) }
  }
  return null
}

const actionTypes = ['create-transaction', 'update-transaction', 'create-balance-assertion', 'update-balance-assertion']

type Row = { id: string; action_type: string; hlc: string; iv: string; encrypted_payload: string }

/** Rewrites the rows; `inTransaction` runs the final sync step (the row updates) in the caller's transaction. */
export async function up(db: DbDriver, codec: PayloadCodec, inTransaction: (apply: () => void) => void): Promise<void> {
  const rows = db.all<Row>(
    `SELECT id, action_type, hlc, iv, encrypted_payload FROM actions
     WHERE action_type IN (${actionTypes.map(() => '?').join(', ')}) ORDER BY hlc`,
    actionTypes,
  )
  const updates: { id: string; iv: string; payload: string }[] = []
  for (const row of rows) {
    const where = `Action ${row.id} (hlc ${row.hlc})`
    const payload = JSON.parse(await codec.decode(row.iv, row.encrypted_payload)) as Payload
    const migrated = centsPayload(row.action_type, payload, where)
    if (migrated === null) continue
    const { iv, payload: encrypted } = await codec.encode(JSON.stringify(migrated))
    updates.push({ id: row.id, iv, payload: encrypted })
  }
  inTransaction(() => {
    for (const u of updates) {
      db.run(`UPDATE actions SET iv = ?, encrypted_payload = ? WHERE id = ?`, [u.iv, u.payload, u.id])
    }
  })
}
