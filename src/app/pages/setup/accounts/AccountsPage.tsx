import { Link, useSearch } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, Folder, FolderPlus, Plus, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TipLabel } from '@/app/components/TipLabel.tsx'
import { ListTreeTemplate } from '@/app/components/templates/templates.tsx'
import { usePlensFile } from '@/app/files/plensFile.ts'
import { runCommand, useAccounts, useCategories, useEditable } from '@/app/ledger/ledgerData.ts'
import { LEDGER_TIPS } from '@/app/ledger/ledgerTips.ts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { AccountCategory } from '@/ledger/accountCategories/AccountCategory.ts'
import { genAcctCtgId } from '@/ledger/accountCategories/AcctCtgId.ts'
import { acctCtgRootId, acctCtgRootName } from '@/ledger/accountCategories/AcctCtgRoot.ts'
import {
  type AccountTreeNode,
  buildAccountTree,
  categoryAndDescendants,
  categoryOptions,
} from '@/ledger/accountCategories/accountTree.ts'
import type { Account } from '@/ledger/accounts/Account.ts'
import { genAcctId } from '@/ledger/accounts/AcctId.ts'
import type { AcctTypeStr } from '@/ledger/accounts/AcctType.ts'
import { cn } from '@/lib/utils'
import { NoPlensFile } from '../../home/NoPlensFile.tsx'
import { PageHeader } from '../../PageHeader.tsx'

// Setup › Accounts and categories [FR-LED-1, FR-LED-3, D: OQ-UI-12]: a tree per account type, with inline add, and
// a side panel to rename, describe, move, mark primary or delete the selected item (List or tree template).

export const editableTypes = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE'] as const
export type EditableType = (typeof editableTypes)[number]

type Selection = { kind: 'category' | 'account'; id: string } | null
type Adding = { parentId: string; kind: 'category' | 'account' } | null

export function AccountsPage() {
  const file = usePlensFile((s) => s.file)
  return (
    <div className="flex h-full flex-col p-4">
      <PageHeader title="Accounts and categories" description="Every account, filed in categories, by type." />
      {file ? <AccountsEditorForType /> : <NoPlensFile />}
    </div>
  )
}

/** One editor per type, so switching types starts with nothing selected. */
function AccountsEditorForType() {
  const { type } = useSearch({ from: '/setup/accounts' })
  return <AccountsEditor key={type} type={type} />
}

function AccountsEditor({ type }: { type: EditableType }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const editable = useEditable()
  const [selection, setSelection] = useState<Selection>(null)
  const [adding, setAdding] = useState<Adding>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const tree = useMemo(() => buildAccountTree(categories, accounts, type), [categories, accounts, type])

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <ListTreeTemplate
      label={`${acctCtgRootName[type]} tree`}
      toolbar={
        <>
          <nav aria-label="Account type" className="flex rounded-md border p-0.5">
            {editableTypes.map((t) => (
              <Link
                key={t}
                to="/setup/accounts"
                search={{ type: t }}
                aria-current={t === type ? 'page' : undefined}
                className={cn(
                  'rounded px-2 py-0.5 text-sm',
                  t === type ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {acctCtgRootName[t]}
              </Link>
            ))}
          </nav>
          <Button
            size="sm"
            variant="outline"
            disabled={!editable}
            onClick={() => setAdding({ parentId: acctCtgRootId[type], kind: 'category' })}
          >
            <FolderPlus className="size-4" /> New category
          </Button>
        </>
      }
      list={
        <ul aria-label={`${acctCtgRootName[type]} accounts and categories`} className="text-sm">
          {adding?.parentId === acctCtgRootId[type] && (
            <NewItemRow type={type} adding={adding} depth={0} onDone={() => setAdding(null)} />
          )}
          {tree.map((node) => (
            <TreeRow
              key={node.kind === 'category' ? node.category.id : node.account.id}
              node={node}
              depth={0}
              type={type}
              selection={selection}
              onSelect={setSelection}
              adding={adding}
              setAdding={setAdding}
              collapsed={collapsed}
              toggle={toggle}
              editable={editable}
            />
          ))}
          {tree.length === 0 && !adding && (
            <li className="p-2 text-muted-foreground">
              No {acctCtgRootName[type].toLowerCase()} yet. Start with a category, such as “Bank” or “Household”.
            </li>
          )}
        </ul>
      }
      detail={
        selection && (
          <DetailPanel
            key={`${selection.kind}-${selection.id}`}
            selection={selection}
            type={type}
            accounts={accounts}
            categories={categories}
            editable={editable}
            onDeleted={() => setSelection(null)}
          />
        )
      }
    />
  )
}

function TreeRow(props: {
  node: AccountTreeNode
  depth: number
  type: EditableType
  selection: Selection
  onSelect: (s: Selection) => void
  adding: Adding
  setAdding: (a: Adding) => void
  collapsed: Set<string>
  toggle: (id: string) => void
  editable: boolean
}) {
  const { node, depth, selection, onSelect, adding, setAdding, collapsed, toggle, editable, type } = props
  const pad = { paddingLeft: `${depth * 1.25 + 0.25}rem` }
  if (node.kind === 'account') {
    const a = node.account
    const selected = selection?.kind === 'account' && selection.id === a.id
    return (
      <li aria-label={a.name} data-selected={selected || undefined}>
        <div className={cn('flex items-center gap-1 rounded py-0.5 pr-1', selected && 'bg-accent')} style={pad}>
          <span className="w-4" />
          <button
            type="button"
            className="flex-1 truncate text-left hover:underline"
            onClick={() => onSelect({ kind: 'account', id: a.id })}
          >
            {a.name}
          </button>
          {a.isPrimary && <Star className="size-3.5 fill-current text-warning" aria-label="Primary" />}
          <Link
            to="/past/register/$acctId"
            params={{ acctId: a.id }}
            aria-label={`${a.name} register`}
            className="text-muted-foreground text-xs hover:text-foreground hover:underline"
          >
            Register
          </Link>
        </div>
      </li>
    )
  }
  const c = node.category
  const open = !collapsed.has(c.id)
  const selected = selection?.kind === 'category' && selection.id === c.id
  return (
    <li aria-label={c.name} data-selected={selected || undefined}>
      <div className={cn('group flex items-center gap-1 rounded py-0.5 pr-1', selected && 'bg-accent')} style={pad}>
        <button
          type="button"
          aria-label={open ? `Collapse ${c.name}` : `Expand ${c.name}`}
          onClick={() => toggle(c.id)}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <Folder className="size-3.5 text-muted-foreground" aria-hidden />
        <button
          type="button"
          className="flex-1 truncate text-left font-medium hover:underline"
          onClick={() => onSelect({ kind: 'category', id: c.id })}
        >
          {c.name}
        </button>
        {editable && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={`Add account to ${c.name}`}
              onClick={() => setAdding({ parentId: c.id, kind: 'account' })}
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={`Add category to ${c.name}`}
              onClick={() => setAdding({ parentId: c.id, kind: 'category' })}
            >
              <FolderPlus className="size-3.5" />
            </Button>
          </>
        )}
      </div>
      {(open || adding?.parentId === c.id) && (
        <ul>
          {adding?.parentId === c.id && (
            <NewItemRow type={type} adding={adding} depth={depth + 1} onDone={() => setAdding(null)} />
          )}
          {open &&
            node.children.map((child) => (
              <TreeRow
                key={child.kind === 'category' ? child.category.id : child.account.id}
                {...props}
                node={child}
                depth={depth + 1}
              />
            ))}
        </ul>
      )}
    </li>
  )
}

function NewItemRow({
  type,
  adding,
  depth,
  onDone,
}: {
  type: AcctTypeStr
  adding: NonNullable<Adding>
  depth: number
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const id = `new-${adding.kind}`
  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return onDone()
    const ok =
      adding.kind === 'account'
        ? await runCommand('accounts', 'createAccount', {
            id: genAcctId(),
            parentCtgId: adding.parentId,
            acctType: type,
            name: trimmed,
          })
        : await runCommand('accountCategories', 'createAccountCategory', {
            id: genAcctCtgId(),
            parentCtgId: adding.parentId,
            acctType: type,
            name: trimmed,
          })
    if (ok) onDone()
  }
  return (
    <li className="flex items-center gap-2 py-0.5" style={{ paddingLeft: `${depth * 1.25 + 1.5}rem` }}>
      <TipLabel htmlFor={id} tip={LEDGER_TIPS[adding.kind === 'account' ? 'new.account' : 'new.category']}>
        {adding.kind === 'account' ? 'New account' : 'New category'}
      </TipLabel>
      <Input
        id={id}
        autoFocus
        className="h-7 max-w-64"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') onDone()
        }}
        onBlur={() => !name.trim() && onDone()}
      />
    </li>
  )
}

function DetailPanel({
  selection,
  type,
  accounts,
  categories,
  editable,
  onDeleted,
}: {
  selection: NonNullable<Selection>
  type: EditableType
  accounts: Account[]
  categories: AccountCategory[]
  editable: boolean
  onDeleted: () => void
}) {
  const account = selection.kind === 'account' ? accounts.find((a) => a.id === selection.id) : undefined
  const category = selection.kind === 'category' ? categories.find((c) => c.id === selection.id) : undefined
  const item = account ?? category
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [parent, setParent] = useState(item?.parentCtgId ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Shown at once, then confirmed by the store (or rolled back if refused).
  const [primary, setPrimary] = useState(account?.isPrimary ?? false)
  if (!item) return <p className="text-muted-foreground text-sm">That item no longer exists.</p>

  const kind = selection.kind
  const options = categoryOptions(
    categories,
    type,
    category ? categoryAndDescendants(categories, category.id) : new Set(),
  )
  const changed = name.trim() !== item.name || description !== item.description || parent !== item.parentCtgId

  const save = async () => {
    const patch = {
      id: item.id,
      ...(name.trim() !== item.name ? { name: name.trim() } : {}),
      ...(description !== item.description ? { description } : {}),
      ...(parent !== item.parentCtgId ? { parentCtgId: parent } : {}),
    }
    if (kind === 'account') await runCommand('accounts', 'patchAccount', patch)
    else await runCommand('accountCategories', 'patchAccountCategory', patch)
  }
  const remove = async () => {
    const ok =
      kind === 'account'
        ? await runCommand('accounts', 'deleteAccount', { id: item.id })
        : await runCommand('accountCategories', 'deleteAccountCategory', { id: item.id })
    if (ok) onDeleted()
    else setConfirmDelete(false)
  }

  return (
    <form
      className="flex flex-col gap-3"
      aria-label={`${kind === 'account' ? 'Account' : 'Category'} details`}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <h3 className="font-medium">{kind === 'account' ? 'Account' : 'Category'}</h3>
      <div className="grid gap-1">
        <TipLabel htmlFor="detail-name" tip={LEDGER_TIPS[`${kind}.name`]}>
          Name
        </TipLabel>
        <Input id="detail-name" disabled={!editable} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <TipLabel htmlFor="detail-description" tip={LEDGER_TIPS[`${kind}.description`]}>
          Description
        </TipLabel>
        <Input
          id="detail-description"
          disabled={!editable}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <TipLabel htmlFor="detail-parent" tip={LEDGER_TIPS[`${kind}.parent`]}>
          Category
        </TipLabel>
        <select
          id="detail-parent"
          disabled={!editable}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={parent}
          onChange={(e) => setParent(e.target.value)}
        >
          {options
            .filter((o) => kind === 'category' || o.id !== acctCtgRootId[type])
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </select>
      </div>
      {account && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="detail-primary"
            disabled={!editable}
            checked={primary}
            onCheckedChange={(v) => {
              const next = v === true
              setPrimary(next)
              void runCommand('accounts', 'patchAccount', { id: account.id, isPrimary: next }).then(
                (ok) => ok || setPrimary(!next),
              )
            }}
          />
          <TipLabel htmlFor="detail-primary" tip={LEDGER_TIPS['account.primary']}>
            Primary account
          </TipLabel>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!editable || !changed || !name.trim()}>
          Save
        </Button>
        {!confirmDelete ? (
          <Button type="button" size="sm" variant="outline" disabled={!editable} onClick={() => setConfirmDelete(true)}>
            Delete…
          </Button>
        ) : (
          <span className="flex items-center gap-1 text-sm">
            Delete {item.name}?
            <Button type="button" size="sm" variant="destructive" onClick={() => void remove()}>
              Delete
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </span>
        )}
      </div>
    </form>
  )
}
