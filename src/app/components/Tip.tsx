// Hover tooltip for a data-input label or grid column heading. The dotted underline marks labels that have one.
import type { ReactElement } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const TIP_TRIGGER = 'cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-2'

export function Tip({ tip, children }: { tip: string | undefined; children: ReactElement }) {
  if (!tip) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-pretty">
        {tip}
      </TooltipContent>
    </Tooltip>
  )
}
