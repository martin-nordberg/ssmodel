import { toast } from 'sonner'
import { create } from 'zustand'
import { commandKind, findById, inverse, type LedgerCommand, type LedgerEntity } from '@/ledger/compensation.ts'
import { getStoreClient, StoreError } from '@/state/storeClient.ts'
import type { CommandInput, CommandMethod } from '@/worker/storeProtocol.ts'

// Undo and redo of ledger changes within a session (plan P2.7): each change made through runLedgerCommand records
// its compensating commands (src/ledger/compensation.ts). Undo appends them to the change log; redo appends the
// original commands again. The stacks are cleared whenever a file is opened or closed.

interface UndoEntry {
  label: string
  forward: LedgerCommand[]
  backward: LedgerCommand[]
}

interface LedgerUndoState {
  undo: UndoEntry[]
  redo: UndoEntry[]
}

export const useLedgerUndo = create<LedgerUndoState>()(() => ({ undo: [], redo: [] }))

let subscribed = false
function ensureSubscribed() {
  if (subscribed) return
  subscribed = true
  getStoreClient().subscribe((n) => {
    if (n.kind === 'session') useLedgerUndo.setState({ undo: [], redo: [] })
  })
}

function describeError(err: unknown): string {
  return err instanceof StoreError || err instanceof Error ? err.message : String(err)
}

async function run(cmd: LedgerCommand): Promise<void> {
  await getStoreClient().request('command', { entity: cmd.entity, method: cmd.method, input: cmd.input })
}

const labels = { create: 'add', patch: 'change', delete: 'delete' } as const

/**
 * Sends a ledger command and records how to undo it. A refusal (a broken rule, a read-only window) is shown as a
 * message and resolves false.
 */
export async function runLedgerCommand<E extends LedgerEntity, M extends CommandMethod<E>>(
  entity: E,
  method: M,
  input: CommandInput<E, M>,
): Promise<boolean> {
  ensureSubscribed()
  const client = getStoreClient()
  const cmd: LedgerCommand = { entity, method, input: input as Record<string, unknown> }
  try {
    const prior =
      commandKind(cmd) === 'create'
        ? null
        : ((await client.request('query', {
            entity,
            method: findById[entity],
            args: [cmd.input.id],
          })) as Record<string, unknown> | null)
    await run(cmd)
    const entry = { label: labels[commandKind(cmd)], forward: [cmd], backward: inverse(cmd, prior) }
    useLedgerUndo.setState((s) => ({ undo: [...s.undo, entry].slice(-100), redo: [] }))
    return true
  } catch (err) {
    toast.error(describeError(err))
    return false
  }
}

async function replay(from: 'undo' | 'redo'): Promise<boolean> {
  const state = useLedgerUndo.getState()
  const entry = state[from].at(-1)
  if (!entry) return false
  try {
    for (const cmd of from === 'undo' ? entry.backward : entry.forward) await run(cmd)
  } catch (err) {
    // Something changed since (for example, the item is now in use): drop the entry rather than retry it.
    useLedgerUndo.setState((s) => ({ [from]: s[from].slice(0, -1) }) as Partial<LedgerUndoState>)
    toast.error(`Couldn’t ${from}: ${describeError(err)}`)
    return false
  }
  useLedgerUndo.setState((s) =>
    from === 'undo'
      ? { undo: s.undo.slice(0, -1), redo: [...s.redo, entry] }
      : { redo: s.redo.slice(0, -1), undo: [...s.undo, entry] },
  )
  return true
}

/** Undoes the last ledger change. */
export function undoLedger(): Promise<boolean> {
  return replay('undo')
}

/** Redoes the last undone ledger change. */
export function redoLedger(): Promise<boolean> {
  return replay('redo')
}
