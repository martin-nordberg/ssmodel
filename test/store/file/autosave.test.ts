import { describe, expect, test } from 'bun:test'
import { Autosaver, type AutosaveState } from '@/store/file/autosave.ts'

// FR-STO-3: autosave after a pause in editing, on demand, and with retries.

function harness(save: () => Promise<void> = async () => {}) {
  let now = 0
  const timers: { fn: () => void; at: number; id: number }[] = []
  let nextId = 1
  const saves: number[] = []
  const states: AutosaveState[] = []
  const autosaver = new Autosaver({
    save: async () => {
      saves.push(now)
      await save()
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { fn, at: now + ms, id: nextId++ }
      timers.push(t)
      return t.id
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id)
      if (i >= 0) timers.splice(i, 1)
    },
  })
  autosaver.subscribe((s) => states.push(s.state))
  /** Advances the clock, firing due timers, and lets saves settle. */
  const advance = async (ms: number) => {
    const end = now + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const next = timers[0]
      if (!next || next.at > end) break
      timers.shift()
      now = next.at
      next.fn()
      for (let i = 0; i < 10; i++) await Promise.resolve()
    }
    now = end
  }
  return { autosaver, saves, states, advance, setNow: (t: number) => (now = t) }
}

describe('Autosaver', () => {
  test('saves 5 s after the last change', async () => {
    const h = harness()
    h.autosaver.noteChange()
    await h.advance(3000)
    h.autosaver.noteChange()
    await h.advance(4999)
    expect(h.saves).toEqual([])
    await h.advance(1)
    expect(h.saves).toEqual([8000])
    expect(h.autosaver.current.state).toBe('saved')
    expect(h.states).toEqual(['pending', 'pending', 'saving', 'saved'])
  })

  test('saves at least once a minute during continuous editing', async () => {
    const h = harness()
    for (let t = 0; t < 70_000; t += 1000) {
      h.autosaver.noteChange()
      await h.advance(1000)
    }
    expect(h.saves[0]).toBe(60_000)
  })

  test('flush saves at once, and does nothing when there is nothing to save', async () => {
    const h = harness()
    expect(await h.autosaver.flush()).toBe(true)
    expect(h.saves).toEqual([])
    h.autosaver.noteChange()
    expect(await h.autosaver.flush()).toBe(true)
    expect(h.saves).toEqual([0])
    await h.advance(10_000)
    expect(h.saves).toEqual([0])
  })

  test('a change during a save is saved afterwards', async () => {
    let release: () => void = () => {}
    const h = harness(() => new Promise<void>((r) => (release = r)))
    h.autosaver.noteChange()
    const flushed = h.autosaver.flush()
    await Promise.resolve()
    h.autosaver.noteChange()
    release()
    expect(await flushed).toBe(false)
    expect(h.autosaver.current.state).toBe('pending')
    await h.advance(5000)
    release()
    await h.advance(0)
    expect(h.saves).toHaveLength(2)
  })

  test('a failed save stays pending, reports the error, and is retried', async () => {
    let fail = true
    const h = harness(async () => {
      if (fail) throw new Error('disk full')
    })
    h.autosaver.noteChange()
    expect(await h.autosaver.flush()).toBe(false)
    expect(h.autosaver.current).toMatchObject({ state: 'error', error: 'disk full' })
    fail = false
    await h.advance(30_000)
    expect(h.autosaver.current.state).toBe('saved')
    expect(h.saves).toEqual([0, 30_000])
  })
})
