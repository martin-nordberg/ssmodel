import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { closePlens, newPlens, openPlens, openRecentPlens, savePlensCopy, usePlensFile } from '@/app/files/plensFile.ts'
import { listRecent, type RecentFile } from '@/app/files/recentFiles.ts'
import { useFileCommands } from '@/app/files/useFileCommands.ts'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDocument } from '@/state/documentStore.ts'

const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'

function RecentItems({ files, open }: { files: RecentFile[]; open: (r: RecentFile) => void }) {
  return files.map((r) => (
    <DropdownMenuItem key={`${r.name}-${r.openedAt}`} onSelect={() => open(r)}>
      {r.name}
    </DropdownMenuItem>
  ))
}

/**
 * File commands [FR-STO-1]: the ProvisionLens file first, then the retirement model's household YAML file
 * [FR-FILE-1], which the Retiring Years pages use until the plan moves into the ProvisionLens file (P6).
 */
export function FileMenu() {
  const cmd = useFileCommands()
  const navigate = useNavigate()
  const hasFile = useDocument((s) => s.file !== null)
  const hasPlens = usePlensFile((s) => s.file !== null)
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [recentPlens, setRecentPlens] = useState<RecentFile[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) {
      void listRecent().then(setRecent)
      void listRecent('plens').then(setRecentPlens)
    }
  }, [open])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          File
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={() => void newPlens()}>New ProvisionLens file…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void openPlens()}>Open ProvisionLens file…</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={recentPlens.length === 0}>Open recent</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <RecentItems files={recentPlens} open={(r) => void openRecentPlens(r)} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem disabled={!hasPlens} onSelect={() => void savePlensCopy()}>
          Save a copy…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasPlens} onSelect={() => void navigate({ to: '/setup/file' })}>
          File settings…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasPlens} onSelect={() => void closePlens()}>
          Close ProvisionLens file
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          Retirement model (household YAML)
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={cmd.newHousehold}>
          New household…<DropdownMenuShortcut>{mod}Alt+N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void cmd.open()}>
          Open…<DropdownMenuShortcut>{mod}O</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={recent.length === 0}>Open recent household</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <RecentItems files={recent} open={(r) => void cmd.openRecent(r)} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem disabled={!hasFile} onSelect={() => void cmd.save()}>
          Save<DropdownMenuShortcut>{mod}S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasFile} onSelect={() => void cmd.saveAs()}>
          Save as…<DropdownMenuShortcut>{mod}Shift+S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasFile} onSelect={cmd.close}>
          Close
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
