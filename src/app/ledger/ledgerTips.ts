// Tooltips for the ledger pages' inputs and column headings [FR-UI-37], 5–40 words each (test/app/ledgerTips.test.ts).

export const LEDGER_TIPS = {
  'account.name':
    'The account’s name, unique within its category. Renaming it never changes any plan or budget result.',
  'account.description':
    'An optional note about the account, such as the bank or the last digits of the account number.',
  'account.parent':
    'The category the account is filed under. Moving it changes only where it appears in trees and reports.',
  'account.primary':
    'Primary accounts are the ones you use most, such as checking and credit cards. They get shortcuts on the Past pages.',
  'category.name': 'The category’s name, unique within its parent. Categories group accounts in trees and reports.',
  'category.description': 'An optional note about what belongs in this category.',
  'category.parent': 'The category this one is filed under. A category can’t be moved inside itself.',
  'new.account': 'The new account’s name. Press Enter to add it, or Escape to cancel.',
  'new.category': 'The new category’s name. Press Enter to add it, or Escape to cancel.',
  'vendor.name': 'Who you pay or who pays you, as it should appear in registers. Names are unique.',
  'vendor.description': 'An optional note about the vendor, such as what you usually buy there.',
  'vendor.defaultAccount':
    'The account a new transaction with this vendor is filed to, such as Groceries for a grocery store. You can change it on each transaction.',
  'vendor.active': 'Inactive vendors are hidden from suggestions when you enter transactions, but their history stays.',
  'txn.postDate':
    'The date the transaction happened, as on the receipt or statement. Shortcuts: t today, + and − a day, PageUp and PageDown a month.',
  'txn.clearedDate':
    'The date it cleared the bank, if different. The register orders and balances by this date when it is set.',
  'txn.code': 'An optional check number or reference code.',
  'txn.vendor': 'Who you paid or who paid you. Picking a vendor fills in its default account.',
  'txn.description': 'A note about the transaction. Needed when there is no vendor.',
  'txn.account': 'Where the money came from or went: an expense or income account, or another account for a transfer.',
  'txn.amount':
    'The amount. You can type arithmetic, such as 45.50 + 4.50, and it is worked out when you leave the field.',
  'txn.review': 'Marks the transaction to check later; it appears on the review list.',
  'split.account': 'The account this part of the amount belongs to.',
  'split.amount':
    'This line’s share of the amount. Use a negative amount for a part going the other way, such as taxes taken from a paycheck.',
} as const

export type LedgerTipKey = keyof typeof LEDGER_TIPS
