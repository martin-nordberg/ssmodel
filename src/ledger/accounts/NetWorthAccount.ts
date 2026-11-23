import { type AcctId, acctIdSchema } from '@/ledger/accounts/AcctId.ts'
import { type NameStr, nameSchema } from '@/ledger/core/Name.ts'

/**
 * Net Worth is the one predefined, uneditable EQUITY account -- a direct child of the Equity root category
 * (acctCtgIdEquity, see AcctCtgRoot.ts) and the only account ever allowed to sit directly under a root
 * category. Unlike the virtual root categories (never inserted as real rows), Net Worth must be a genuine,
 * insertable Account row: it's a real post-able account (e.g. an opening-balance entry might debit/credit
 * it directly), not just a structural placeholder. It is seeded once, when a new file is created -- see
 * bootstrapNetWorthAccount in packages/server/src/persistence/db.ts.
 */
export const acctIdNetWorth: AcctId = acctIdSchema.parse('acctnetworth0000000000000000')

/** Net Worth's fixed display name. */
export const netWorthAccountName: NameStr = nameSchema.parse('Net Worth')
