import type { AccountCategory } from '@/ledger/accountCategories/AccountCategory.ts'
import { acctCtgRootId, acctCtgRootName } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import type { Account } from '@/ledger/accounts/Account.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'

// The account and category tree for one account type, and account path labels. From Checquery's
// buildAccountCategoryTree, accountFullPathLabel and accountCategoryDescendants.

export type AccountTreeNode =
  | { kind: 'category'; category: AccountCategory; children: AccountTreeNode[] }
  | { kind: 'account'; account: Account }

const nodeName = (node: AccountTreeNode): string => (node.kind === 'category' ? node.category.name : node.account.name)

/**
 * The tree under one type's root category (the root itself is not a node). Categories and accounts share one
 * namespace per parent, so they're interleaved alphabetically, like folders and files.
 */
export function buildAccountTree(
  categories: readonly AccountCategory[],
  accounts: readonly Account[],
  acctType: AcctTypeStr,
): AccountTreeNode[] {
  const categoriesByParent = new Map<string, AccountCategory[]>()
  for (const c of categories) {
    if (c.acctType !== acctType || c.parentCtgId === undefined) continue
    categoriesByParent.set(c.parentCtgId, [...(categoriesByParent.get(c.parentCtgId) ?? []), c])
  }
  const accountsByParent = new Map<string, Account[]>()
  for (const a of accounts) {
    if (a.acctType !== acctType) continue
    accountsByParent.set(a.parentCtgId, [...(accountsByParent.get(a.parentCtgId) ?? []), a])
  }
  const build = (parentId: string): AccountTreeNode[] =>
    [
      ...(categoriesByParent.get(parentId) ?? []).map(
        (category): AccountTreeNode => ({ kind: 'category', category, children: build(category.id) }),
      ),
      ...(accountsByParent.get(parentId) ?? []).map((account): AccountTreeNode => ({ kind: 'account', account })),
    ].sort((a, b) => nodeName(a).localeCompare(nodeName(b)))
  return build(acctCtgRootId[acctType])
}

/** The names of the categories above an account (or category), top-down, without the root. */
export function categoryChain(parentCtgId: string, categories: readonly AccountCategory[]): string[] {
  const byId = new Map(categories.map((c) => [c.id as string, c]))
  const names: string[] = []
  for (let id: string | undefined = parentCtgId; id !== undefined; ) {
    const c = byId.get(id)
    if (!c || c.parentCtgId === undefined) break
    names.unshift(c.name)
    id = c.parentCtgId
  }
  return names
}

/** "Assets : Bank : Checking", for pickers. */
export function accountFullPath(account: Account, categories: readonly AccountCategory[]): string {
  return [acctCtgRootName[account.acctType], ...categoryChain(account.parentCtgId, categories), account.name].join(
    ' : ',
  )
}

/** "Bank : Checking", without the root, where the type is already shown. */
export function accountCategoryPath(account: Account, categories: readonly AccountCategory[]): string {
  return [...categoryChain(account.parentCtgId, categories), account.name].join(' : ')
}

/** A category and all its descendants: the categories it can't be moved under. */
export function categoryAndDescendants(categories: readonly AccountCategory[], id: string): Set<string> {
  const result = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const c of categories) {
      if (c.parentCtgId !== undefined && result.has(c.parentCtgId) && !result.has(c.id)) {
        result.add(c.id)
        grew = true
      }
    }
  }
  return result
}

/** The categories an item of a type can be placed under, with their path labels, root first. */
export function categoryOptions(
  categories: readonly AccountCategory[],
  acctType: AcctTypeStr,
  exclude: ReadonlySet<string> = new Set(),
): { id: string; label: string }[] {
  const rootId = acctCtgRootId[acctType]
  const options = categories
    .filter((c) => c.acctType === acctType && c.parentCtgId !== undefined && !exclude.has(c.id))
    .map((c) => ({ id: c.id as string, label: [...categoryChain(c.parentCtgId!, categories), c.name].join(' : ') }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return exclude.has(rootId) ? options : [{ id: rootId, label: `(top of ${acctCtgRootName[acctType]})` }, ...options]
}
