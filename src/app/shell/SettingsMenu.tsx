import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type Settings as S, useSettings } from '@/state/settingsStore.ts'

/** Per-user display settings [FR-UI-16], kept in the browser. */
export function SettingsMenu() {
  const s = useSettings()
  const group = <K extends keyof S>(key: K, label: string, options: [S[K], string][]) => (
    <>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={String(s[key])} onValueChange={(v) => s.set({ [key]: v } as Partial<S>)}>
        {options.map(([v, l]) => (
          <DropdownMenuRadioItem key={String(v)} value={String(v)} onSelect={(e) => e.preventDefault()}>
            {l}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Display settings">
          <Settings />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {group('dollars', 'Dollars', [
          ['real', "Today's dollars"],
          ['nominal', 'Nominal dollars'],
        ])}
        <DropdownMenuSeparator />
        {group('theme', 'Theme', [
          ['system', 'System'],
          ['light', 'Light'],
          ['dark', 'Dark'],
        ])}
        <DropdownMenuSeparator />
        {group('density', 'Density', [
          ['compact', 'Compact'],
          ['comfortable', 'Comfortable'],
        ])}
        <DropdownMenuSeparator />
        {group('numberFormat', 'Numbers', [
          ['full', '$1,234,567'],
          ['compact', '$1.23M'],
        ])}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
