import { useMemo, useState } from 'react'
import { TipLabel } from '@/app/components/TipLabel.tsx'
import { ListTreeTemplate } from '@/app/components/templates/templates.tsx'
import { usePlensFile } from '@/app/files/plensFile.ts'
import { runCommand, useAccounts, useCategories, useEditable, useVendors } from '@/app/ledger/ledgerData.ts'
import { LEDGER_TIPS } from '@/app/ledger/ledgerTips.ts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { AccountCategory } from '@/ledger/accountCategories/AccountCategory.ts'
import { accountFullPath } from '@/ledger/accountCategories/accountTree.ts'
import type { Account } from '@/ledger/accounts/Account.ts'
import type { Vendor } from '@/ledger/vendors/Vendor.ts'
import { genVndrId } from '@/ledger/vendors/VndrId.ts'
import { cn } from '@/lib/utils'
import { NoPlensFile } from '../../home/NoPlensFile.tsx'
import { PageHeader } from '../../PageHeader.tsx'

// Setup › Vendors [FR-LED-1, FR-LED-3]: who you pay and who pays you, each with an optional default account that
// new transactions with the vendor are filed to (List or tree template).

export function VendorsPage() {
  const file = usePlensFile((s) => s.file)
  return (
    <div className="flex h-full flex-col p-4">
      <PageHeader title="Vendors" description="Who you pay and who pays you, with each one’s default account." />
      {file ? <VendorsEditor /> : <NoPlensFile />}
    </div>
  )
}

/** Accounts a vendor's transactions are usually filed to, with path labels: expenses and income first. */
function useAccountOptions(accounts: Account[], categories: AccountCategory[]) {
  return useMemo(() => {
    const order = { EXPENSE: 0, INCOME: 1, LIABILITY: 2, ASSET: 3, EQUITY: 4 }
    return accounts
      .filter((a) => a.acctType !== 'EQUITY')
      .map((a) => ({ id: a.id as string, label: accountFullPath(a, categories), type: a.acctType }))
      .sort((a, b) => order[a.type] - order[b.type] || a.label.localeCompare(b.label))
  }, [accounts, categories])
}

function VendorsEditor() {
  const vendors = useVendors()
  const accounts = useAccounts()
  const categories = useCategories()
  const editable = useEditable()
  const options = useAccountOptions(accounts, categories)
  const [selected, setSelected] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDefault, setNewDefault] = useState('')
  const accountLabel = (id: string | undefined) => options.find((o) => o.id === id)?.label ?? ''
  const sorted = useMemo(() => [...vendors].sort((a, b) => a.name.localeCompare(b.name)), [vendors])

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    const ok = await runCommand('vendors', 'createVendor', {
      id: genVndrId(),
      name,
      ...(newDefault ? { defaultAcctId: newDefault } : {}),
    })
    if (ok) {
      setNewName('')
      setNewDefault('')
    }
  }

  const vendor = sorted.find((v) => v.id === selected)
  return (
    <ListTreeTemplate
      label="Vendors"
      toolbar={
        <form
          aria-label="Add a vendor"
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <div className="grid gap-1">
            <TipLabel htmlFor="new-vendor-name" tip={LEDGER_TIPS['vendor.name']}>
              New vendor
            </TipLabel>
            <Input
              id="new-vendor-name"
              className="h-8 w-56"
              disabled={!editable}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <TipLabel htmlFor="new-vendor-default" tip={LEDGER_TIPS['vendor.defaultAccount']}>
              Default account
            </TipLabel>
            <AccountSelect
              id="new-vendor-default"
              options={options}
              value={newDefault}
              onChange={setNewDefault}
              disabled={!editable}
            />
          </div>
          <Button type="submit" size="sm" disabled={!editable || !newName.trim()}>
            Add vendor
          </Button>
        </form>
      }
      list={
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground text-xs">
            <tr>
              <th className="py-1 font-normal">Name</th>
              <th className="py-1 font-normal">Default account</th>
              <th className="py-1 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => (
              <tr
                key={v.id}
                aria-selected={v.id === selected}
                className={cn('border-t', v.id === selected && 'bg-accent', !v.isActive && 'text-muted-foreground')}
              >
                <td className="py-1">
                  <button type="button" className="text-left hover:underline" onClick={() => setSelected(v.id)}>
                    {v.name}
                  </button>
                </td>
                <td className="py-1">{accountLabel(v.defaultAcctId)}</td>
                <td className="py-1">{v.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-muted-foreground">
                  No vendors yet. Add the stores, employers and people you pay or get paid by.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      }
      detail={
        vendor && (
          <VendorDetail
            key={vendor.id}
            vendor={vendor}
            options={options}
            editable={editable}
            onDeleted={() => setSelected(null)}
          />
        )
      }
    />
  )
}

function AccountSelect({
  id,
  options,
  value,
  onChange,
  disabled,
}: {
  id: string
  options: { id: string; label: string }[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <select
      id={id}
      disabled={disabled}
      className="h-8 max-w-80 rounded-md border bg-background px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">(none)</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function VendorDetail({
  vendor,
  options,
  editable,
  onDeleted,
}: {
  vendor: Vendor
  options: { id: string; label: string }[]
  editable: boolean
  onDeleted: () => void
}) {
  const [name, setName] = useState<string>(vendor.name)
  const [description, setDescription] = useState<string>(vendor.description)
  const [defaultAcctId, setDefaultAcctId] = useState<string>(vendor.defaultAcctId ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [active, setActive] = useState(vendor.isActive)
  const changed =
    name.trim() !== vendor.name || description !== vendor.description || defaultAcctId !== (vendor.defaultAcctId ?? '')

  const save = () =>
    runCommand('vendors', 'patchVendor', {
      id: vendor.id,
      ...(name.trim() !== vendor.name ? { name: name.trim() } : {}),
      ...(description !== vendor.description ? { description } : {}),
      ...(defaultAcctId && defaultAcctId !== vendor.defaultAcctId ? { defaultAcctId } : {}),
    })
  const remove = async () => {
    if (await runCommand('vendors', 'deleteVendor', { id: vendor.id })) onDeleted()
    else setConfirmDelete(false)
  }

  return (
    <form
      aria-label="Vendor details"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <h3 className="font-medium">Vendor</h3>
      <div className="grid gap-1">
        <TipLabel htmlFor="vendor-name" tip={LEDGER_TIPS['vendor.name']}>
          Name
        </TipLabel>
        <Input id="vendor-name" disabled={!editable} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <TipLabel htmlFor="vendor-description" tip={LEDGER_TIPS['vendor.description']}>
          Description
        </TipLabel>
        <Input
          id="vendor-description"
          disabled={!editable}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <TipLabel htmlFor="vendor-default" tip={LEDGER_TIPS['vendor.defaultAccount']}>
          Default account
        </TipLabel>
        <AccountSelect
          id="vendor-default"
          options={options}
          value={defaultAcctId}
          onChange={setDefaultAcctId}
          disabled={!editable}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="vendor-active"
          disabled={!editable}
          checked={active}
          onCheckedChange={(v) => {
            const next = v === true
            setActive(next)
            void runCommand('vendors', 'patchVendor', { id: vendor.id, isActive: next }).then(
              (ok) => ok || setActive(!next),
            )
          }}
        />
        <TipLabel htmlFor="vendor-active" tip={LEDGER_TIPS['vendor.active']}>
          Active
        </TipLabel>
      </div>
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
            Delete {vendor.name}?
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
