// A lever [FR-UI-6]: slider + numeric field, snapping to steps, with a tick at the scenario's saved value,
// double-click or the reset button to return to it, and keyboard steps (arrows = 1 step, PgUp/PgDn = 10).
import { RotateCcw } from 'lucide-react'
import { Slider as SliderPrimitive } from 'radix-ui'
import { useEffect, useId, useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { TIP_TRIGGER, Tip } from '../Tip.tsx'

export type LeverProps = {
  label: string
  /** Tooltip on the label (5–40 words). */
  tip?: string
  value: number
  saved: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  parse: (text: string) => number | null
  /** Called continuously while dragging. */
  onDrag?: (v: number) => void
  /** Called on release, Enter in the field, or keyboard steps. */
  onCommit: (v: number) => void
  onReset: () => void
  /** Optional remove button (promoted levers). */
  onRemove?: () => void
}

const snap = (v: number, min: number, max: number, step: number) =>
  Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min))

export function Lever({
  label,
  tip,
  value,
  saved,
  min,
  max,
  step,
  format,
  parse,
  onDrag,
  onCommit,
  onReset,
  onRemove,
}: LeverProps) {
  const id = useId()
  const [local, setLocal] = useState(value)
  const [text, setText] = useState(format(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    setLocal(value)
    if (!editing) setText(format(value))
  }, [value, editing, format])

  const overridden = Math.abs(value - saved) > step / 1000
  const tick = ((Math.min(max, Math.max(min, saved)) - min) / (max - min)) * 100
  const commitText = () => {
    const v = parse(text)
    setEditing(false)
    if (v === null || !Number.isFinite(v)) {
      setText(format(value))
      return
    }
    const s = snap(v, min, max, step)
    setText(format(s))
    if (s !== value) onCommit(s)
  }

  return (
    <div className="grid min-w-0 gap-1" data-lever={label}>
      <div className="flex items-center gap-1">
        <label htmlFor={`${id}-field`} className={cn('min-w-0 flex-1 truncate text-xs', overridden && 'font-medium')}>
          <Tip tip={tip}>
            <span className={tip ? TIP_TRIGGER : undefined}>{label}</span>
          </Tip>
          {overridden && (
            <span
              className="ml-1 rounded bg-secondary px-1 text-[10px] text-secondary-foreground"
              title={`Saved: ${format(saved)}`}
            >
              what-if
            </span>
          )}
        </label>
        {overridden && (
          <button
            type="button"
            aria-label={`Reset ${label}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={onReset}
          >
            <RotateCcw className="size-3" />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${label} from Console`}
            className="text-muted-foreground text-xs hover:text-destructive"
            onClick={onRemove}
          >
            ×
          </button>
        )}
        <input
          id={`${id}-field`}
          value={text}
          className="h-6 w-20 shrink-0 rounded border bg-background px-1 text-right font-mono text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onFocus={() => setEditing(true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setText(format(value))
              setEditing(false)
            }
          }}
        />
      </div>
      <div className="relative">
        <SliderPrimitive.Root
          className="relative flex h-4 w-full touch-none items-center select-none"
          min={min}
          max={max}
          step={step}
          value={[local]}
          onValueChange={([v]) => {
            if (v === undefined) return
            setLocal(v)
            setText(format(v))
            onDrag?.(v)
          }}
          onValueCommit={([v]) => {
            if (v !== undefined && v !== value) onCommit(v)
          }}
        >
          <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-brand-track">
            <SliderPrimitive.Range className="absolute h-full bg-brand-range" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label={label}
            onDoubleClick={onReset}
            className="block size-3 rounded-full border-2 border-brand-active bg-background shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </SliderPrimitive.Root>
        <span
          aria-hidden
          title={`Saved value ${format(saved)}`}
          className="pointer-events-none absolute top-0 h-4 w-px bg-foreground/40"
          style={{ left: `calc(${tick}% )` }}
        />
      </div>
    </div>
  )
}

type Option<T extends string> = { value: T; label: string }

/** Discrete lever as a segmented control. */
export function SegmentedLever<T extends string>({
  label,
  tip,
  value,
  saved,
  options,
  onChange,
  onReset,
}: {
  label: string
  tip?: string
  value: T
  saved: T
  options: Option<T>[]
  onChange: (v: T) => void
  onReset: () => void
}) {
  const overridden = value !== saved
  return (
    <div className="grid min-w-0 gap-1" data-lever={label}>
      <div className="flex items-center gap-1 text-xs">
        <span className={cn('flex-1 text-brand', overridden && 'font-medium')}>
          <Tip tip={tip}>
            <span className={tip ? TIP_TRIGGER : undefined}>{label}</span>
          </Tip>
          {overridden && <span className="ml-1 rounded bg-secondary px-1 text-[10px]">what-if</span>}
        </span>
        {overridden && (
          <button
            type="button"
            aria-label={`Reset ${label}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={onReset}
          >
            <RotateCcw className="size-3" />
          </button>
        )}
      </div>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        aria-label={label}
        value={value}
        onValueChange={(v) => v && onChange(v as T)}
        className="w-full"
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            className={cn(
              'flex-1 px-1 text-[11px] data-[state=on]:border-brand-active data-[state=on]:bg-brand-track data-[state=on]:text-foreground data-[state=on]:hover:bg-brand-track/80 data-[state=on]:hover:text-foreground',
              o.value === saved && o.value !== value && 'underline decoration-dotted',
            )}
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
