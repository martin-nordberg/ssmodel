import { usePlensFile } from '@/app/files/plensFile.ts'
import type { AccountCategory } from '@/ledger/accountCategories/AccountCategory.ts'
import type { Account } from '@/ledger/accounts/Account.ts'
import type { Vendor } from '@/ledger/vendors/Vendor.ts'
import { runLedgerCommand } from '@/state/ledgerUndo.ts'
import { getStoreClient, useStoreQuery } from '@/state/storeClient.ts'
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
 * Sends a command that can be undone (plan P2.7); a refusal (a broken rule, a read-only window) is shown as a message
 * and resolves false. The worker stamps the origin.
 */
export function runCommand<E extends Exclude<Entity, 'origins'>, M extends CommandMethod<E>>(
  entity: E,
  method: M,
  input: CommandInput<E, M>,
): Promise<boolean> {
  return runLedgerCommand(entity, method, input)
}
