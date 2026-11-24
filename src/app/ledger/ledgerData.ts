import { toast } from 'sonner'
import { usePlensFile } from '@/app/files/plensFile.ts'
import type { AccountCategory } from '@/ledger/accountCategories/AccountCategory.ts'
import type { Account } from '@/ledger/accounts/Account.ts'
import type { Vendor } from '@/ledger/vendors/Vendor.ts'
import { getStoreClient, StoreError, useStoreQuery } from '@/state/storeClient.ts'
import type { CommandInput, CommandMethod, Entity } from '@/worker/storeProtocol.ts'

// Ledger data for pages: queries that refresh on every change (useStoreQuery), and commands that report failures
// to the user. Pages never touch SQLite [NFR-ARCH-8].

const NONE: never[] = []

export function useAccounts(): Account[] {
  return useStoreQuery(getStoreClient(), 'accounts', 'findAccountsAll').data ?? NONE
}

export function useCategories(): AccountCategory[] {
  return useStoreQuery(getStoreClient(), 'accountCategories', 'findAccountCategoriesAll').data ?? NONE
}

export function useVendors(): Vendor[] {
  return useStoreQuery(getStoreClient(), 'vendors', 'findVendorsAll').data ?? NONE
}

/** True when the open file can be edited here (not read-only in a second window, FR-STO-4). */
export function useEditable(): boolean {
  return usePlensFile((s) => s.file !== null && !s.file.readOnly)
}

/**
 * Sends a command; a refusal (a broken rule, a read-only window) is shown as a message and resolves false. The
 * worker stamps the origin.
 */
export async function runCommand<E extends Entity, M extends CommandMethod<E>>(
  entity: E,
  method: M,
  input: CommandInput<E, M>,
): Promise<boolean> {
  try {
    await getStoreClient().command(entity, method, input)
    return true
  } catch (err) {
    toast.error(err instanceof StoreError || err instanceof Error ? err.message : String(err))
    return false
  }
}
