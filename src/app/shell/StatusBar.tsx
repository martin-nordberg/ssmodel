import { usePlensFile } from '@/app/files/plensFile.ts'
import { federalRules, medicareRules, scRules, ssaRules } from '@/engine/rules/tables.ts'
import { useDocument } from '@/state/documentStore.ts'
import { WarningsBadge } from './WarningsBadge.tsx'

export function StatusBar() {
  const name = useDocument((s) => s.name)
  const dirty = useDocument((s) => s.dirty)
  const hasFile = useDocument((s) => s.file !== null)
  return (
    <footer className="flex h-6 items-center gap-4 border-t px-3 text-muted-foreground text-xs">
      <span data-testid="status-file">{hasFile ? `${name}${dirty ? ' • modified' : ''}` : 'No file'}</span>
      {hasFile && <WarningsBadge />}
      <PlensStatus />
      <span className="ml-auto">
        Educational planning tool — not financial, tax or legal advice. Rules: SSA {ssaRules.latestColaYear}, IRS{' '}
        {federalRules.latestYear}, Medicare {medicareRules.latestYear}, SC {scRules.latestYear}.
      </span>
    </footer>
  )
}

const autosaveText = { saved: 'Saved', pending: 'Unsaved changes', saving: 'Saving…', error: 'Save failed' } as const

/** The open .plens file and its autosave state [FR-STO-3]. */
function PlensStatus() {
  const file = usePlensFile((s) => s.file)
  const autosave = usePlensFile((s) => s.autosave)
  if (!file) return null
  return (
    <span data-testid="status-plens" title={autosave.error ?? undefined}>
      {file.name} • {autosaveText[autosave.state]}
      {file.encrypted ? '' : ' • not encrypted'}
    </span>
  )
}
