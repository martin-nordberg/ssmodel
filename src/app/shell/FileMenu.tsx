import { useEffect, useState } from 'react'
import { closePlens, newPlens, openPlens, openRecentPlens, savePlensCopy, usePlensFile } from '@/app/files/plensFile.ts'
import { listRecent, type RecentFile } from '@/app/files/recentFiles.ts'
import { useFileCommands } from '@/app/files/useFileCommands.ts'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDocument } from '@/state/documentStore.ts'

const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'

export function FileMenu() {
  const cmd = useFileCommands()
  const hasFile = useDocument((s) => s.file !== null)
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [recentPlens, setRecentPlens] = useState<RecentFile[]>([])
  const [open, setOpen] = useState(false)
  const hasPlens = usePlensFile((s) => s.file !== null)

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
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onSelect={cmd.newHousehold}>
          New household…<DropdownMenuShortcut>{mod}Alt+N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void cmd.open()}>
          Open…<DropdownMenuShortcut>{mod}O</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={recent.length === 0}>Open recent</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {recent.map((r) => (
              <DropdownMenuItem key={`${r.name}-${r.openedAt}`} onSelect={() => void cmd.openRecent(r)}>
                {r.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasFile} onSelect={() => void cmd.save()}>
          Save<DropdownMenuShortcut>{mod}S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasFile} onSelect={() => void cmd.saveAs()}>
          Save as…<DropdownMenuShortcut>{mod}Shift+S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasFile} onSelect={cmd.close}>
          Close
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* ProvisionLens files (FR-STO-1), until the new shell replaces this menu in P2. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>ProvisionLens file (preview)</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem onSelect={() => void newPlens()}>New ProvisionLens file…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void openPlens()}>Open ProvisionLens file…</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={recentPlens.length === 0}>Open recent</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {recentPlens.map((r) => (
                  <DropdownMenuItem key={`${r.name}-${r.openedAt}`} onSelect={() => void openRecentPlens(r)}>
                    {r.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem disabled={!hasPlens} onSelect={() => void savePlensCopy()}>
              Save a copy…
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasPlens} onSelect={() => void closePlens()}>
              Close ProvisionLens file
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
