import type { YM } from '@/engine/core/dates.ts'
import type { Prepared } from '@/engine/model/prepare.ts'
import { cn } from '@/lib/utils'

/** Main chart area; charts are added in T2.7. */
export function ChartArea({ dim }: { prep: Prepared; claim: YM | null; dim: boolean }) {
  return (
    <section
      aria-label="Charts"
      className={cn('rounded-lg border p-3 text-muted-foreground text-xs', dim && 'opacity-60')}
    />
  )
}
