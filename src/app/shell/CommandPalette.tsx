// Command palette [FR-UI-12]: Ctrl/Cmd+K opens a searchable list of file, view, scenario, Setup-panel, Console and
// display commands. Commands are built from the stores, so the list always matches the current document.
import { useFileCommands } from '@/app/files/useFileCommands.ts'
import { router } from '@/app/routes.tsx'
import { sections } from '@/app/sections.ts'
import { SECTIONS } from '@/app/views/setup/SetupView.tsx'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { pinBaseline, useConsole } from '@/state/consoleStore.ts'
import { useDocument } from '@/state/documentStore.ts'
import { redoLedger, undoLedger, useLedgerUndo } from '@/state/ledgerUndo.ts'
import { useSettings } from '@/state/settingsStore.ts'
import { useUi } from '@/state/uiStore.ts'

// A stable empty list: a selector that returns a new [] on each read re-renders forever.
const NO_SCENARIOS: never[] = []

type Cmd = { id: string; label: string; run: () => void; shortcut?: string; keywords?: string[] }

const go = (to: string) => void router.navigate({ to: to as '/' })

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const hasFile = useDocument((s) => s.file !== null)
  const groups = useGroups(hasFile)
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Search for a command">
      <Command>
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No matching command.</CommandEmpty>
          {groups
            .filter((g) => g.items.length > 0 && (hasFile || g.always))
            .map((g) => (
              <CommandGroup key={g.heading} heading={g.heading}>
                {g.items.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${g.heading} ${c.label}`}
                    keywords={c.keywords}
                    onSelect={() => {
                      setOpen(false)
                      c.run()
                    }}
                  >
                    {c.label}
                    {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

function useGroups(hasFile: boolean): { heading: string; items: Cmd[]; always?: boolean }[] {
  const cmd = useFileCommands()
  const scenarios = useDocument((s) => s.file?.scenarios ?? NO_SCENARIOS)
  const activeId = useDocument((s) => s.activeScenarioId)
  const hasOverrides = useDocument((s) => Object.keys(s.overrides[s.activeScenarioId ?? ''] ?? {}).length > 0)
  const canUndo = useDocument((s) => s.undoStack.length > 0)
  const canRedo = useDocument((s) => s.redoStack.length > 0)
  const canPin = useConsole((s) => !!s.result && !s.result.preview)
  const hasBaseline = useConsole((s) => s.baseline !== null)
  const dollars = useSettings((s) => s.dollars)
  const ui = useUi.getState
  const doc = useDocument.getState
  const active = scenarios.find((s) => s.id === activeId)

  const canUndoLedger = useLedgerUndo((s) => s.undo.length > 0)
  const canRedoLedger = useLedgerUndo((s) => s.redo.length > 0)
  const ledger: Cmd[] = []
  if (canUndoLedger) ledger.push({ id: 'undo-ledger', label: 'Undo ledger change', run: () => void undoLedger() })
  if (canRedoLedger) ledger.push({ id: 'redo-ledger', label: 'Redo ledger change', run: () => void redoLedger() })

  const edit: Cmd[] = []
  if (canUndo) edit.push({ id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', run: () => doc().undo() })
  if (canRedo) edit.push({ id: 'redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', run: () => doc().redo() })

  const consoleCmds: Cmd[] = []
  if (canPin && active)
    consoleCmds.push({ id: 'pin', label: 'Pin baseline', run: () => pinBaseline(active.name), keywords: ['ghost'] })
  if (hasBaseline)
    consoleCmds.push({ id: 'unpin', label: 'Clear baseline', run: () => useConsole.getState().set({ baseline: null }) })
  if (hasOverrides)
    consoleCmds.push({
      id: 'reset',
      label: 'Reset levers',
      run: () => doc().resetOverrides(),
      keywords: ['what-if', 'overrides'],
    })

  return [
    {
      heading: 'File',
      always: true,
      items: [
        { id: 'new', label: 'New household…', shortcut: 'Ctrl+Alt+N', run: cmd.newHousehold },
        { id: 'open', label: 'Open…', shortcut: 'Ctrl+O', run: () => void cmd.open() },
        ...(hasFile
          ? [
              { id: 'save', label: 'Save', shortcut: 'Ctrl+S', run: () => void cmd.save() },
              { id: 'saveAs', label: 'Save as…', shortcut: 'Ctrl+Shift+S', run: () => void cmd.saveAs() },
              { id: 'close', label: 'Close', run: cmd.close },
            ]
          : []),
      ],
    },
    {
      // Every page of every section [FR-UI-21].
      heading: 'Go to',
      always: true,
      items: sections.flatMap((section) =>
        section.pages.map((page) => ({
          id: `page-${page.to}`,
          label:
            page.to === section.to && section.pages.length === 1 ? section.label : `${section.label}: ${page.label}`,
          run: () => go(page.to),
          keywords: [page.description],
        })),
      ),
    },
    {
      heading: 'Retirement setup',
      items: SECTIONS.map((s) => ({
        id: `setup-${s.id}`,
        label: s.label,
        run: () => {
          ui().setSetupSection(s.id)
          go('/retiring/setup')
        },
      })),
    },
    {
      heading: 'Scenario',
      items: scenarios
        .filter((s) => s.id !== activeId)
        .map((s) => ({
          id: `scenario-${s.id}`,
          label: `Switch to ${s.name}`,
          run: () => doc().setActiveScenario(s.id),
        })),
    },
    { heading: 'Console', items: consoleCmds },
    { heading: 'Edit', items: edit },
    { heading: 'Ledger', items: ledger, always: true },
    {
      heading: 'Display',
      always: true,
      items: [
        {
          id: 'dollars',
          label: dollars === 'real' ? 'Show nominal dollars' : "Show today's dollars",
          run: () => useSettings.getState().set({ dollars: dollars === 'real' ? 'nominal' : 'real' }),
          keywords: ['real', 'nominal', 'toggle'],
        },
        { id: 'light', label: 'Light theme', run: () => useSettings.getState().set({ theme: 'light' }) },
        { id: 'dark', label: 'Dark theme', run: () => useSettings.getState().set({ theme: 'dark' }) },
        { id: 'system', label: 'System theme', run: () => useSettings.getState().set({ theme: 'system' }) },
      ],
    },
  ]
}
