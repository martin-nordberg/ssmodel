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
      <span className="ml-auto">Educational planning tool — not financial, tax or legal advice</span>
    </footer>
  )
}
