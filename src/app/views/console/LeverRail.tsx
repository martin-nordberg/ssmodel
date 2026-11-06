import { RotateCcw, Save } from 'lucide-react'
import { Lever, SegmentedLever } from '@/app/components/lever/Lever.tsx'
import { TIPS, tipForPath } from '@/app/tips.ts'
import { Button } from '@/components/ui/button'
import { formatAge, formatYM } from '@/engine/core/dates.ts'
import type { Prepared } from '@/engine/model/prepare.ts'
import type { ScenarioT } from '@/schema/model.ts'
import { shownClaim, useConsole } from '@/state/consoleStore.ts'
import { getPath, useDocument } from '@/state/documentStore.ts'
import { DEFAULT_LEVERS, humanizePath, promotedFormat } from './levers.ts'

/** Left rail of levers [FR-UI-6, FR-UI-7, FR-UI-7a, FR-UI-8]. */
export function LeverRail({ saved, effective, prep }: { saved: ScenarioT; effective: ScenarioT; prep: Prepared }) {
  const doc = useDocument.getState
  const nOverrides = useDocument((s) => Object.keys(s.overrides[saved.id] ?? {}).length)
  const setConsole = useConsole((s) => s.set)
  const inspect = useConsole((s) => s.inspect)
  const result = useConsole((s) => s.result)
  const claim = shownClaim({ inspect, result })
  const recommended = result?.recommendation?.best.claim ?? null
  const cands = prep.candidates

  const commit = (entries: [string, unknown][]) => {
    for (const [path, value] of entries) {
      if (JSON.stringify(getPath(saved, path)) === JSON.stringify(value)) doc().clearOverride(path)
      else doc().setOverride(path, value)
    }
    setConsole({ draft: null })
  }
  const reset = (entries: [string, unknown][]) => {
    for (const [path] of entries) doc().clearOverride(path)
  }

  return (
    <aside
      aria-label="Levers"
      className="grid w-80 shrink-0 content-start gap-3 overflow-y-auto overflow-x-hidden border-r p-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-xs uppercase tracking-wide">Levers</h2>
        {nOverrides > 0 && <span className="text-[10px] text-muted-foreground">{nOverrides} what-if(s)</span>}
      </div>
      {cands.length > 0 && claim !== null && (
        <Lever
          label="Claim age (inspect)"
          tip={TIPS['lever.claim']}
          value={Math.max(0, cands.indexOf(claim))}
          saved={recommended !== null ? Math.max(0, cands.indexOf(recommended)) : 0}
          min={0}
          max={cands.length - 1}
          step={1}
          format={(i) => {
            const c = cands[Math.round(i)]
            return c === undefined ? '' : formatAge(prep.people[0].age.ageAt(c))
          }}
          parse={(t) => {
            const m = /^(\d+)\s*y?\s*(\d+)?\s*m?$/.exec(t.trim())
            if (!m) return null
            const months = Number(m[1]) * 12 + Number(m[2] ?? 0)
            const i = cands.findIndex((c) => prep.people[0].age.ageAt(c) >= months)
            return i < 0 ? cands.length - 1 : i
          }}
          onDrag={(i) => setConsole({ inspect: cands[Math.round(i)] ?? null })}
          onCommit={(i) => setConsole({ inspect: cands[Math.round(i)] ?? null })}
          onReset={() => setConsole({ inspect: null })}
        />
      )}
      {claim !== null && (
        <p className="-mt-2 text-[10px] text-muted-foreground">
          Showing {formatYM(claim)}
          {recommended !== null && claim !== recommended
            ? ' — recommended date is marked by the tick'
            : ' (recommended)'}
        </p>
      )}
      {DEFAULT_LEVERS.filter((l) => !l.show || l.show(effective)).map((l) =>
        l.kind === 'slider' ? (
          <Lever
            key={l.id}
            label={l.label}
            tip={l.tip}
            value={l.get(effective)}
            saved={l.get(saved)}
            min={l.min}
            max={l.max}
            step={l.step}
            format={l.format}
            parse={l.parse}
            onDrag={(v) => {
              const [entry] = l.set(v, effective)
              if (entry) setConsole({ draft: { path: entry[0], value: entry[1] } })
            }}
            onCommit={(v) => commit(l.set(v, effective))}
            onReset={() => reset(l.set(l.get(saved), saved))}
          />
        ) : (
          <SegmentedLever
            key={l.id}
            label={l.label}
            tip={l.tip}
            value={l.get(effective)}
            saved={l.get(saved)}
            options={l.options}
            onChange={(v) => commit(l.set(v, effective))}
            onReset={() => reset(l.set(l.get(saved), saved))}
          />
        ),
      )}
      {saved.consoleLevers.length > 0 && <h3 className="mt-1 font-medium text-[11px]">Added from Setup</h3>}
      {saved.consoleLevers.map((p) => {
        const f = promotedFormat(p.min, p.max)
        const cur = Number(getPath(effective, p.path) ?? p.min)
        return (
          <Lever
            key={p.path}
            label={p.label ?? humanizePath(p.path)}
            tip={tipForPath(p.path)}
            value={cur}
            saved={Number(getPath(saved, p.path) ?? p.min)}
            min={p.min}
            max={p.max}
            step={p.step}
            format={f.format}
            parse={f.parse}
            onDrag={(v) => setConsole({ draft: { path: p.path, value: v } })}
            onCommit={(v) => commit([[p.path, v]])}
            onReset={() => doc().clearOverride(p.path)}
            onRemove={() =>
              doc().update((d) => {
                const s = d.scenarios.find((x) => x.id === saved.id)
                if (s) s.consoleLevers = s.consoleLevers.filter((x) => x.path !== p.path)
              }, 'remove lever')
            }
          />
        )
      })}
      <div className="mt-2 grid gap-1 border-t pt-2">
        <Button size="sm" variant="outline" disabled={nOverrides === 0} onClick={() => doc().applyOverrides()}>
          <Save /> Apply to scenario
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={nOverrides === 0}
          onClick={() => {
            const name = window.prompt('Name for the new scenario', `${saved.name} (what-if)`)
            if (name) doc().saveOverridesAsScenario(name)
          }}
        >
          Save as new scenario
        </Button>
        <Button size="sm" variant="ghost" disabled={nOverrides === 0} onClick={() => doc().resetOverrides()}>
          <RotateCcw /> Reset all
        </Button>
      </div>
    </aside>
  )
}
