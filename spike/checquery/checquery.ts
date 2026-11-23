// Loads Checquery's own server and domain code from a local checkout, so the spike can compare against it.
// Dynamic imports keep Checquery's sources (and its path aliases) out of this repo's type-check.

export const checqueryDir = process.env.CHECQUERY_DIR ?? new URL('../../../checquery', import.meta.url).pathname

// biome-ignore lint/suspicious/noExplicitAny: Checquery's modules are loaded untyped on purpose (see above).
type Module = any

async function load(path: string): Promise<Module> {
  return import(`${checqueryDir}/packages/${path}`)
}

export async function checquery() {
  const [db, crypto, money, roots, acctId, ctgId, txnId, vndrId, asrtId] = await Promise.all([
    load('server/src/persistence/db.ts'),
    load('server/src/persistence/actionLog/encryption/crypto.ts'),
    load('shared/src/domain/core/CurrencyAmt.ts'),
    load('shared/src/domain/accountCategories/AcctCtgRoot.ts'),
    load('shared/src/domain/accounts/AcctId.ts'),
    load('shared/src/domain/accountCategories/AcctCtgId.ts'),
    load('shared/src/domain/transactions/TxnId.ts'),
    load('shared/src/domain/vendors/VndrId.ts'),
    load('shared/src/domain/balanceAssertions/AsrtId.ts'),
  ])
  const [account, category, transaction, vendor, assertion] = await Promise.all([
    load('shared/src/domain/accounts/Account.ts'),
    load('shared/src/domain/accountCategories/AccountCategory.ts'),
    load('shared/src/domain/transactions/Transaction.ts'),
    load('shared/src/domain/vendors/Vendor.ts'),
    load('shared/src/domain/balanceAssertions/BalanceAssertion.ts'),
  ])
  return {
    db,
    crypto,
    money,
    roots: {
      assets: roots.acctCtgIdAssets,
      liabilities: roots.acctCtgIdLiabilities,
      income: roots.acctCtgIdIncome,
      expenses: roots.acctCtgIdExpenses,
    },
    ids: {
      genAcctId: acctId.genAcctId,
      genAcctCtgId: ctgId.genAcctCtgId,
      genTxnId: txnId.genTxnId,
      genVndrId: vndrId.genVndrId,
      genAsrtId: asrtId.genAsrtId,
    },
    schemas: {
      accountCreationEventSchema: account.accountCreationEventSchema,
      accountPatchEventSchema: account.accountPatchEventSchema,
      accountDeletionEventSchema: account.accountDeletionEventSchema,
      accountCategoryCreationEventSchema: category.accountCategoryCreationEventSchema,
      transactionCreationEventSchema: transaction.transactionCreationEventSchema,
      transactionPatchEventSchema: transaction.transactionPatchEventSchema,
      transactionDeletionEventSchema: transaction.transactionDeletionEventSchema,
      vendorCreationEventSchema: vendor.vendorCreationEventSchema,
      balanceAssertionCreationEventSchema: assertion.balanceAssertionCreationEventSchema,
    },
  }
}
