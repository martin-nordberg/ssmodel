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
} as const

export type LedgerTipKey = keyof typeof LEDGER_TIPS
