import type { Page } from '@playwright/test'
import { store } from './plensHelpers.ts'

// A small ledger for e2e tests, set up through the store worker: Bank : Checking (primary), Work : Salary,
// Food : Groceries, Taxes : Federal, and the vendor Corner Grocer (default Groceries).

/** A CUID2-shaped id: prefix plus 24 lowercase letters or digits. */
export const id = (prefix: string, name: string) =>
  `${prefix}${name
    .replace(/[^a-z0-9]/g, '')
    .padEnd(24, '0')
    .slice(0, 24)}`
export const ids = {
  bank: id('actg', 'bank'),
  work: id('actg', 'work'),
  food: id('actg', 'food'),
  taxes: id('actg', 'taxes'),
  checking: id('acct', 'checking'),
  salary: id('acct', 'salary'),
  groceries: id('acct', 'groceries'),
  federal: id('acct', 'federal'),
  grocer: id('vndr', 'grocer'),
}

/** Accounts and a vendor, set up through the store worker. */
export async function seed(page: Page) {
  const c = (entity: string, method: string, input: object) => store(page, 'command', entity, method, input)
  await c('accountCategories', 'createAccountCategory', {
    id: ids.bank,
    parentCtgId: 'actgassets000000000000000000',
    acctType: 'ASSET',
    name: 'Bank',
  })
  await c('accountCategories', 'createAccountCategory', {
    id: ids.work,
    parentCtgId: 'actgincome000000000000000000',
    acctType: 'INCOME',
    name: 'Work',
  })
  await c('accountCategories', 'createAccountCategory', {
    id: ids.food,
    parentCtgId: 'actgexpenses0000000000000000',
    acctType: 'EXPENSE',
    name: 'Food',
  })
  await c('accountCategories', 'createAccountCategory', {
    id: ids.taxes,
    parentCtgId: 'actgexpenses0000000000000000',
    acctType: 'EXPENSE',
    name: 'Taxes',
  })
  await c('accounts', 'createAccount', {
    id: ids.checking,
    parentCtgId: ids.bank,
    acctType: 'ASSET',
    name: 'Checking',
    isPrimary: true,
  })
  await c('accounts', 'createAccount', { id: ids.salary, parentCtgId: ids.work, acctType: 'INCOME', name: 'Salary' })
  await c('accounts', 'createAccount', {
    id: ids.groceries,
    parentCtgId: ids.food,
    acctType: 'EXPENSE',
    name: 'Groceries',
  })
  await c('accounts', 'createAccount', {
    id: ids.federal,
    parentCtgId: ids.taxes,
    acctType: 'EXPENSE',
    name: 'Federal',
  })
  await c('vendors', 'createVendor', { id: ids.grocer, name: 'Corner Grocer', defaultAcctId: ids.groceries })
}

/** Two transactions in Checking: a $3,000 split paycheck on Jan 1 and a $50 grocery purchase on Jan 5. */
export async function seedTransactions(page: Page) {
  const c = (input: object) => store(page, 'command', 'transactions', 'createTransaction', input)
  await c({
    id: id('trxn', 'paycheck'),
    postDate: '2026-01-01',
    description: 'Paycheck',
    entries: [
      { acctId: ids.checking, debit: 300000 },
      { acctId: ids.salary, credit: 400000 },
      { acctId: ids.federal, debit: 100000 },
    ],
  })
  await c({
    id: id('trxn', 'groceries'),
    postDate: '2026-01-05',
    vndrId: ids.grocer,
    entries: [
      { acctId: ids.groceries, debit: 5000 },
      { acctId: ids.checking, credit: 5000 },
    ],
  })
}
