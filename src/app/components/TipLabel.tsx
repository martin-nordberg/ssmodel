import { Label } from '@/components/ui/label'
import { TIP_TRIGGER, Tip } from './Tip.tsx'

/** An input label with its tooltip [FR-UI-37]: every input label carries a 5–40 word tip. */
export function TipLabel({ htmlFor, tip, children }: { htmlFor: string; tip: string; children: React.ReactNode }) {
  return (
    <Tip tip={tip}>
      <Label htmlFor={htmlFor} className={`${TIP_TRIGGER} w-fit text-xs`}>
        {children}
      </Label>
    </Tip>
  )
}
