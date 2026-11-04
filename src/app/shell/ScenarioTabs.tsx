import { ArrowLeft, ArrowRight, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useDocument } from '@/state/documentStore.ts'

/** Scenario tabs [FR-UI-1]: new, clone, rename (double-click), delete, drag to reorder; what-if chip [FR-UI-8]. */
export function ScenarioTabs() {
  const scenarios = useDocument((s) => s.file?.scenarios ?? [])
  const active = useDocument((s) => s.activeScenarioId)
  const overrides = useDocument((s) => s.overrides)
  const doc = useDocument.getState
  const [editing, setEditing] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  return (
    <div role="tablist" aria-label="Scenarios" className="flex h-9 items-center gap-1 overflow-x-auto border-b px-2">
      {scenarios.map((s, i) => {
        const n = Object.keys(overrides[s.id] ?? {}).length
        const isActive = s.id === active
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: drag-to-reorder; keyboard users have Move left/right
          <div
            key={s.id}
            draggable={editing !== s.id}
            onDragStart={() => setDragId(s.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId && dragId !== s.id) doc().moveScenario(dragId, i)
              setDragId(null)
            }}
            className={cn(
              'flex items-center rounded-md border text-xs',
              isActive ? 'border-primary bg-background' : 'border-transparent bg-muted/50',
            )}
          >
            {editing === s.id ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: rename starts with the field focused
                autoFocus
                aria-label="Scenario name"
                defaultValue={s.name}
                className="h-7 w-36 bg-transparent px-2 outline-none"
                onBlur={(e) => {
                  doc().renameScenario(s.id, e.target.value)
                  setEditing(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="flex h-7 items-center gap-1 px-2"
                onClick={() => doc().setActiveScenario(s.id)}
                onDoubleClick={() => setEditing(s.id)}
              >
                {s.name}
                {n > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]" title="Unsaved what-if overrides">
                    {n} what-if{n > 1 ? 's' : ''}
                  </Badge>
                )}
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`${s.name} actions`}
                  className="px-1 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => doc().cloneScenario(s.id)}>
                  <Copy /> Clone
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setEditing(s.id)}>
                  <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem disabled={i === 0} onSelect={() => doc().moveScenario(s.id, i - 1)}>
                  <ArrowLeft /> Move left
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={i === scenarios.length - 1}
                  onSelect={() => doc().moveScenario(s.id, i + 1)}
                >
                  <ArrowRight /> Move right
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={scenarios.length <= 1}
                  onSelect={() => {
                    if (window.confirm(`Delete scenario "${s.name}"?`)) doc().deleteScenario(s.id)
                  }}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}
      <Button variant="ghost" size="icon-xs" aria-label="New scenario" onClick={() => doc().addScenario()}>
        <Plus />
      </Button>
    </div>
  )
}
