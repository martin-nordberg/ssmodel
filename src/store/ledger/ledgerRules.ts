import { acctCtgRootId, isRootAcctCtgId } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import { acctIdNetWorth } from '@/ledger/accounts/NetWorthAccount.ts'
import type { LedgerStore } from '@/store/ledger/LedgerStore.ts'

// The ledger's structural rules [FR-LED-1], checked by the store session before each command, so every client gets
// them (Checquery checked them in its pages):
// - accounts and categories sit under a category of their own type, and categories never form a cycle;
// - names are unique among a parent's children (accounts and categories share one namespace, like files and
//   folders), and among vendors, ignoring case;
// - something in use (an account with entries or a vendor default, a category with children, a vendor with
//   transactions) can't be deleted;
// - references (a vendor's default account, a transaction's accounts and vendor) point at live records;
// - Net Worth can't be changed or deleted;
// - balance checks are for asset and liability accounts, at most one per account and date.

/** A command that breaks a ledger rule. The message is shown to the user. */
export class LedgerRuleError extends Error {}

type Event = Record<string, unknown>

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

async function snapshot(store: LedgerStore) {
  const [categories, accounts] = await Promise.all([
    store.svcs.accountCategories.findAccountCategoriesAll(),
    store.svcs.accounts.findAccountsAll(),
  ])
  return { categories, accounts }
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>

/** The account type of a category id (a root or a live category), or null if there's no such category. */
function categoryType(s: Snapshot, id: string): string | null {
  if (isRootAcctCtgId(id as never)) {
    return Object.entries(acctCtgRootId).find(([, rootId]) => rootId === id)![0]
  }
  return s.categories.find((c) => c.id === id)?.acctType ?? null
}

function checkParent(s: Snapshot, parentCtgId: string, acctType: string): void {
  const type = categoryType(s, parentCtgId)
  if (type === null) throw new LedgerRuleError('That category no longer exists.')
  if (type !== acctType) throw new LedgerRuleError('An item can only be moved under a category of the same type.')
}

function checkSiblingName(s: Snapshot, parentCtgId: string, name: string, selfId: string): void {
  const taken =
    s.categories.some((c) => c.parentCtgId === parentCtgId && c.id !== selfId && same(c.name, name)) ||
    s.accounts.some((a) => a.parentCtgId === parentCtgId && a.id !== selfId && same(a.name, name))
  if (taken) throw new LedgerRuleError(`There is already an account or category named “${name}” here.`)
}

export async function checkLedgerRules(store: LedgerStore, command: string, event: Event): Promise<void> {
  const id = event.id as string
  switch (command) {
    case 'accountCategories.createAccountCategory': {
      const s = await snapshot(store)
      checkParent(s, event.parentCtgId as string, event.acctType as string)
      checkSiblingName(s, event.parentCtgId as string, event.name as string, id)
      return
    }
    case 'accountCategories.patchAccountCategory': {
      const s = await snapshot(store)
      const current = s.categories.find((c) => c.id === id)
      if (!current || current.parentCtgId === undefined) throw new LedgerRuleError('That category can’t be changed.')
      const parentCtgId = (event.parentCtgId as string | undefined) ?? current.parentCtgId
      if (event.parentCtgId !== undefined) {
        checkParent(s, parentCtgId, current.acctType)
        // No cycles: the new parent can't be this category or one of its descendants.
        for (let p: string | undefined = parentCtgId; p !== undefined; ) {
          if (p === id) throw new LedgerRuleError('A category can’t be moved inside itself.')
          p = s.categories.find((c) => c.id === p)?.parentCtgId
        }
      }
      checkSiblingName(s, parentCtgId, (event.name as string | undefined) ?? current.name, id)
      return
    }
    case 'accountCategories.deleteAccountCategory':
      if (await store.svcs.accountCategories.isAccountCategoryInUse(id as never)) {
        throw new LedgerRuleError('This category still has accounts or categories in it. Move or delete them first.')
      }
      return
    case 'accounts.createAccount': {
      const s = await snapshot(store)
      checkParent(s, event.parentCtgId as string, event.acctType as string)
      checkSiblingName(s, event.parentCtgId as string, event.name as string, id)
      return
    }
    case 'accounts.patchAccount': {
      if (id === acctIdNetWorth) throw new LedgerRuleError('Net Worth can’t be changed.')
      const s = await snapshot(store)
      const current = s.accounts.find((a) => a.id === id)
      if (!current) throw new LedgerRuleError('That account no longer exists.')
      const parentCtgId = (event.parentCtgId as string | undefined) ?? current.parentCtgId
      if (event.parentCtgId !== undefined) checkParent(s, parentCtgId, current.acctType)
      checkSiblingName(s, parentCtgId, (event.name as string | undefined) ?? current.name, id)
      return
    }
    case 'accounts.deleteAccount':
      if (id === acctIdNetWorth) throw new LedgerRuleError('Net Worth can’t be deleted.')
      if (await store.svcs.accounts.isAccountInUse(id as never)) {
        throw new LedgerRuleError(
          'This account has transactions or is a vendor’s default account, so it can’t be deleted.',
        )
      }
      return
    case 'vendors.createVendor':
    case 'vendors.patchVendor': {
      const [vendors, accounts] = await Promise.all([
        store.svcs.vendors.findVendorsAll(),
        store.svcs.accounts.findAccountsAll(),
      ])
      if (typeof event.name === 'string' && vendors.some((v) => v.id !== id && same(v.name, event.name as string))) {
        throw new LedgerRuleError(`There is already a vendor named “${event.name}”.`)
      }
      if (event.defaultAcctId !== undefined && !accounts.some((a) => a.id === event.defaultAcctId)) {
        throw new LedgerRuleError('That default account no longer exists.')
      }
      if (command === 'vendors.patchVendor' && !vendors.some((v) => v.id === id)) {
        throw new LedgerRuleError('That vendor no longer exists.')
      }
      return
    }
    case 'vendors.deleteVendor':
      if (await store.svcs.vendors.isVendorInUse(id as never)) {
        throw new LedgerRuleError('This vendor has transactions, so it can’t be deleted. You can make it inactive.')
      }
      return
    case 'transactions.createTransaction':
    case 'transactions.patchTransaction': {
      const entries = event.entries as { acctId: string }[] | undefined
      if (entries) {
        const live = new Set((await store.svcs.accounts.findAccountsAll()).map((a) => a.id as string))
        if (entries.some((e) => !live.has(e.acctId))) throw new LedgerRuleError('An entry’s account no longer exists.')
      }
      if (typeof event.vndrId === 'string') {
        const vendors = await store.svcs.vendors.findVendorsAll()
        if (!vendors.some((v) => v.id === event.vndrId)) throw new LedgerRuleError('That vendor no longer exists.')
      }
      if (command === 'transactions.patchTransaction') {
        // After the patch, the transaction still needs a vendor or a description (FR-LED-1).
        const current = await store.svcs.transactions.findTransactionById(id as never)
        if (!current) throw new LedgerRuleError('That transaction no longer exists.')
        const vndrId = event.vndrId === null ? undefined : (event.vndrId ?? current.vndrId)
        const description = (event.description as string | undefined) ?? current.description
        if (vndrId === undefined && description.trim() === '') {
          throw new LedgerRuleError('A transaction needs a vendor or a description.')
        }
      }
      return
    }
    case 'balanceAssertions.createBalanceAssertion':
    case 'balanceAssertions.patchBalanceAssertion': {
      const all = await store.svcs.balanceAssertions.findBalanceAssertionsAll()
      const current = all.find((a) => a.id === id)
      if (command === 'balanceAssertions.patchBalanceAssertion' && !current) {
        throw new LedgerRuleError('That balance check no longer exists.')
      }
      const acctId = (event.acctId as string | undefined) ?? current!.acctId
      const date = (event.assertionDate as string | undefined) ?? current!.assertionDate
      const account = (await store.svcs.accounts.findAccountsAll()).find((a) => a.id === acctId)
      if (!account) throw new LedgerRuleError('That account no longer exists.')
      if (account.acctType !== 'ASSET' && account.acctType !== 'LIABILITY') {
        throw new LedgerRuleError('Balance checks are for asset and liability accounts, which have statements.')
      }
      if (all.some((a) => a.id !== id && a.acctId === acctId && a.assertionDate === date)) {
        throw new LedgerRuleError('This account already has a balance check for that date.')
      }
      return
    }
    default:
      return
  }
}
