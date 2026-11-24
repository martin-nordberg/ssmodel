// Compensating actions for undo and redo of ledger changes within a session (plan P2.7). The change log is
// append-only, so undoing a change appends its inverse:
// - a create is undone by deleting the item;
// - a delete is undone by creating it again with the same id and its prior attributes (the store restores it);
// - a patch is undone by patching back the fields it changed to their prior values.
// Pure functions: the caller supplies the item's state before the change.

export type LedgerEntity = 'accounts' | 'accountCategories' | 'vendors' | 'transactions' | 'balanceAssertions'

export interface LedgerCommand {
  entity: LedgerEntity
  method: string
  input: Record<string, unknown>
}

const methods: Record<LedgerEntity, { create: string; patch: string; delete: string }> = {
  accounts: { create: 'createAccount', patch: 'patchAccount', delete: 'deleteAccount' },
  accountCategories: {
    create: 'createAccountCategory',
    patch: 'patchAccountCategory',
    delete: 'deleteAccountCategory',
  },
  vendors: { create: 'createVendor', patch: 'patchVendor', delete: 'deleteVendor' },
  transactions: { create: 'createTransaction', patch: 'patchTransaction', delete: 'deleteTransaction' },
  balanceAssertions: {
    create: 'createBalanceAssertion',
    patch: 'patchBalanceAssertion',
    delete: 'deleteBalanceAssertion',
  },
}

export function commandKind(cmd: Pick<LedgerCommand, 'method'>): 'create' | 'patch' | 'delete' {
  return cmd.method.startsWith('create') ? 'create' : cmd.method.startsWith('patch') ? 'patch' : 'delete'
}

/** Fields a patch can set to null to clear them (others can't be cleared by a patch). */
const clearable = new Set(['clearedDate', 'vndrId'])

/** A read item as a creation input: everything but the origin (the store stamps the session's own). */
function asCreation(item: Record<string, unknown>): Record<string, unknown> {
  const { origId: _origId, ...rest } = item
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
}

/**
 * The commands that undo `cmd`, given the item's state before it (null for a create). Throws if a patch or delete
 * has no prior state.
 */
export function inverse(cmd: LedgerCommand, prior: Record<string, unknown> | null): LedgerCommand[] {
  const m = methods[cmd.entity]
  const id = cmd.input.id
  switch (commandKind(cmd)) {
    case 'create':
      return [{ entity: cmd.entity, method: m.delete, input: { id } }]
    case 'delete':
      if (!prior) throw new Error(`No prior state to undo ${cmd.method}`)
      return [{ entity: cmd.entity, method: m.create, input: asCreation(prior) }]
    case 'patch': {
      if (!prior) throw new Error(`No prior state to undo ${cmd.method}`)
      const back: Record<string, unknown> = { id }
      for (const key of Object.keys(cmd.input)) {
        if (key === 'id' || key === 'origId') continue
        const before = prior[key]
        if (before !== undefined) back[key] = before
        else if (clearable.has(key)) back[key] = null
      }
      return [{ entity: cmd.entity, method: m.patch, input: back }]
    }
  }
}

/** The query that reads an item's current state, for `inverse`. */
export const findById: Record<LedgerEntity, string> = {
  accounts: 'findAccountById',
  accountCategories: 'findAccountCategoryById',
  vendors: 'findVendorById',
  transactions: 'findTransactionById',
  balanceAssertions: 'findBalanceAssertionById',
}
