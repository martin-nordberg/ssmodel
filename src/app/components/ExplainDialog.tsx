// Explain-a-number dialog [FR-UI-14]: the breakdown of a year-table or detail-strip value.
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type ExplainLine, type Explanation, formatNote } from '@/engine/explain/explain.ts'
import { cn } from '@/lib/utils'

export type ExplainState = { explanation: Explanation; price: number; source: string } | null

export function ExplainDialog({ state, real, onClose }: { state: ExplainState; real: boolean; onClose: () => void }) {
  const e = state?.explanation
  const dollars = (x: number) => {
    const v = real && state ? x / state.price : x
    const s = `$${Math.round(Math.abs(v)).toLocaleString('en-US')}`
    return v < -0.5 ? `−${s}` : s
  }
  const fmt = (l: ExplainLine) =>
    l.unit === 'none' ? '' : l.unit === 'count' ? String(Math.round(l.value * 100) / 100) : dollars(l.value)
  const note = (n: string) => formatNote(n, dollars)
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl" aria-describedby="explain-desc">
        {e && state && (
          <>
            <DialogHeader>
              <DialogTitle>
                {e.title}: {fmt({ label: '', value: e.value })}
              </DialogTitle>
              <DialogDescription id="explain-desc">
                {state.source}, {real ? "today's dollars" : 'nominal dollars'}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4" data-testid="explanation-breakdown">
              {e.sections.map((s, i) => (
                <table key={s.title} className="w-full font-mono text-xs tabular-nums" aria-label={s.title}>
                  <caption className={cn('pb-1 text-left font-sans font-medium', i > 0 && 'text-muted-foreground')}>
                    {s.title}
                  </caption>
                  <tbody>
                    {s.lines.map((l, j) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: a static list; labels (e.g. expense names) may repeat
                      <tr key={`${j}-${l.label}`} className="border-t">
                        <th scope="row" className="py-0.5 pr-2 text-left font-sans font-normal">
                          {l.label}
                          {l.note && <span className="ml-1 text-muted-foreground">({note(l.note)})</span>}
                        </th>
                        <td className="py-0.5 text-right">{fmt(l)}</td>
                      </tr>
                    ))}
                    <tr className="border-foreground/40 border-t font-semibold">
                      <th scope="row" className="py-0.5 pr-2 text-left font-sans">
                        {s.additive ? '= ' : ''}
                        {s.total.label}
                        {s.total.note && (
                          <span className="ml-1 font-normal text-muted-foreground">({note(s.total.note)})</span>
                        )}
                      </th>
                      <td className="py-0.5 text-right" data-testid={i === 0 ? 'explanation-total' : undefined}>
                        {fmt(s.total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
