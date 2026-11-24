import { describe, expect, test } from 'bun:test'
import type { AccountCategory } from '@/ledger/accountCategories/AccountCategory.ts'
import { acctCtgIdAssets, acctCtgIdExpenses } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import {
  accountCategoryPath,
  accountFullPath,
  buildAccountTree,
  categoryAndDescendants,
  categoryOptions,
} from '@/ledger/accountCategories/accountTree.ts'
import type { Account } from '@/ledger/accounts/Account.ts'

// FR-LED-1: the account tree (from Checquery's buildAccountCategoryTree tests).

const ctg = (id: string, parentCtgId: string, name: string, acctType = 'ASSET') =>
  ({ id, parentCtgId, name, acctType, description: '', origId: 'o' }) as unknown as AccountCategory
const acct = (id: string, parentCtgId: string, name: string, acctType = 'ASSET') =>
  ({ id, parentCtgId, name, acctType, description: '', isPrimary: false, origId: 'o' }) as unknown as Account

const categories = [
  ctg('bank', acctCtgIdAssets, 'Bank'),
  ctg('cash', 'bank', 'Cash'),
  ctg('food', acctCtgIdExpenses, 'Food', 'EXPENSE'),
]
const accounts = [
  acct('checking', 'bank', 'Checking'),
  acct('brokerage', acctCtgIdAssets as string, 'Brokerage'),
  acct('wallet', 'cash', 'Wallet'),
  acct('groceries', 'food', 'Groceries', 'EXPENSE'),
]

describe('buildAccountTree', () => {
  test('nests one type under its root, interleaving categories and accounts by name', () => {
    const tree = buildAccountTree(categories, accounts, 'ASSET')
    const shape = (nodes: ReturnType<typeof buildAccountTree>): unknown[] =>
      nodes.map((n) => (n.kind === 'account' ? n.account.name : { [n.category.name]: shape(n.children) }))
    expect(shape(tree)).toEqual([{ Bank: [{ Cash: ['Wallet'] }, 'Checking'] }, 'Brokerage'])
    expect(buildAccountTree(categories, accounts, 'LIABILITY')).toEqual([])
  })
})

describe('paths and pickers', () => {
  test('full and category paths', () => {
    expect(accountFullPath(accounts[2]!, categories)).toBe('Assets : Bank : Cash : Wallet')
    expect(accountCategoryPath(accounts[2]!, categories)).toBe('Bank : Cash : Wallet')
    expect(accountFullPath(accounts[1]!, categories)).toBe('Assets : Brokerage')
  })

  test('a category and its descendants are excluded from its own parent picker', () => {
    const excluded = categoryAndDescendants(categories, 'bank')
    expect([...excluded].sort()).toEqual(['bank', 'cash'])
    expect(categoryOptions(categories, 'ASSET', excluded)).toEqual([{ id: acctCtgIdAssets, label: '(top of Assets)' }])
    expect(categoryOptions(categories, 'ASSET').map((o) => o.label)).toEqual(['(top of Assets)', 'Bank', 'Bank : Cash'])
  })
})
