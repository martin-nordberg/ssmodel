import { AlertTriangle, Info } from 'lucide-react'
import { useMemo } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { runDeterministic } from '@/engine/sim/deterministic.ts'
import { collectWarnings } from '@/engine/warnings/warnings.ts'
import { shownClaim, useConsole } from '@/state/consoleStore.ts'
import { useEffectivePrepared } from '@/state/scenario.ts'

/** Status-bar warnings badge and panel [FR-UI-15]. */
export function WarningsBadge() {
  const prep = useEffectivePrepared()
  const result = useConsole((s) => s.result)
  const inspect = useConsole((s) => s.inspect)
  const warnings = useMemo(() => {
    if (!prep) return []
    const claim =
      shownClaim({ inspect, result }) ??
      prep.candidates.find((c) => c >= prep.people[0].age.fraMonth) ??
      prep.candidates.at(-1)
    const rows = claim === undefined ? [] : (runDeterministic(prep, claim).rows ?? [])
    return collectWarnings(prep, rows, result?.recommendation ?? null, result?.withoutInheritance)
  }, [prep, result, inspect])
  if (!prep) return null
  const n = warnings.filter((w) => w.level === 'warn').length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 hover:text-foreground"
          aria-label={`Warnings: ${warnings.length}`}
        >
          <AlertTriangle className={n > 0 ? 'size-3 text-amber-600' : 'size-3'} aria-hidden />
          {n > 0 ? `${n} warning${n > 1 ? 's' : ''}` : 'No warnings'}
          {warnings.length > n && <span>· {warnings.length - n} note(s)</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[28rem] text-xs" data-testid="warnings">
        <h3 className="mb-2 font-medium">Warnings and notes</h3>
        {warnings.length === 0 && <p className="text-muted-foreground">Nothing to report.</p>}
        <ul className="grid gap-1.5">
          {warnings.map((w) => (
            <li key={w.text} className="flex gap-2">
              {w.level === 'warn' ? (
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" aria-label="warning" />
              ) : (
                <Info className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-label="note" />
              )}
              <span>{w.text}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
