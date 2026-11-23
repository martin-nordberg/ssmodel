import { describe, expect, it } from 'bun:test'
import {
  advanceHLClock,
  getHLClock,
  type HLClock,
  hlcLength,
  hlcRegex,
  hlcSchema,
  mergeHLClock,
} from '@/ledger/core/HybridLogicalClock.ts'

const check = (hlc: string) => {
  expect(() => hlcSchema.parse(hlc)).not.toThrow()
}

/** Mirrors the internal makeHLC function to construct test clock values. */
const makeTestHLC = (ms: number, count: number, nodeId: string): HLClock =>
  hlcSchema.parse(
    ms.toString(16).padStart(10, '0').toUpperCase() + count.toString(16).padStart(3, '0').toUpperCase() + nodeId,
  )

describe('Hybrid Logical Clocks', () => {
  it('Should parse without error', () => {
    check('0123456789ABCDEF')
  })

  it('Should accept all zeros', () => {
    check('0000000000000000')
  })

  it('Should accept all Fs', () => {
    check('FFFFFFFFFFFFFFFF')
  })

  it('Should reject string shorter than 16 characters', () => {
    expect(() => hlcSchema.parse('0123456789ABCDE')).toThrow()
  })

  it('Should reject string longer than 16 characters', () => {
    expect(() => hlcSchema.parse('0123456789ABCDEF0')).toThrow()
  })

  it('Should reject empty string', () => {
    expect(() => hlcSchema.parse('')).toThrow()
  })

  it('Should reject lowercase hex characters', () => {
    expect(() => hlcSchema.parse('0123456789abcdef')).toThrow()
  })

  it('Should reject mixed case hex characters', () => {
    expect(() => hlcSchema.parse('0123456789ABCDEf')).toThrow()
  })

  it('Should reject non-hex characters', () => {
    expect(() => hlcSchema.parse('0123456789ABCXYZ')).toThrow()
  })

  it('Should reject strings with spaces', () => {
    expect(() => hlcSchema.parse('0123456789ABCD  ')).toThrow()
  })

  it('Should generate and advance an HLC', () => {
    const nodeId = '02F'
    const hlc0 = getHLClock(nodeId)

    expect(hlc0.endsWith(nodeId)).toBe(true)
    expect(hlc0.substring(10, 13)).toEqual('000')
    expect(hlc0.length).toBe(16)
    check(hlc0)

    const hlc1 = advanceHLClock(hlc0)
    expect(hlc1 > hlc0).toBeTrue()
    check(hlc1)

    const hlc2 = advanceHLClock(hlc1)
    expect(hlc2 > hlc1).toBeTrue()
    check(hlc2)

    const hlc3 = mergeHLClock(hlc0, hlc2)
    expect(hlc3 > hlc0).toBeTrue()
    expect(hlc3 > hlc2).toBeTrue()
    check(hlc3)

    let priorHlc = hlc0
    for (let i = 0; i < 100; i += 1) {
      const nextHlc = advanceHLClock(priorHlc)
      expect(nextHlc > priorHlc).toBeTrue()
      check(nextHlc)

      const mergedHlc = mergeHLClock(hlc0, nextHlc)
      expect(mergedHlc > hlc0).toBeTrue()
      expect(mergedHlc > nextHlc).toBeTrue()
      check(mergedHlc)

      priorHlc = mergedHlc
    }
  })
})

describe('advanceHLClock counter behavior', () => {
  it('resets counter to 0 and advances timestamp when wall clock is ahead', () => {
    // A clock with a very old timestamp — wall clock will always win
    const oldClock = makeTestHLC(0, 5, 'A01')
    const advanced = advanceHLClock(oldClock)

    // Timestamp must increase (wall clock wins)
    expect(advanced.substring(0, 10) > oldClock.substring(0, 10)).toBe(true)
    // Counter resets to 0 when timestamp advances
    expect(advanced.substring(10, 13)).toEqual('000')
    // Node ID preserved
    expect(advanced.substring(13, 16)).toEqual('A01')
  })

  it('increments counter and keeps timestamp when stored clock is ahead of wall clock', () => {
    // A clock with the maximum possible timestamp — far in the future
    const futureMs = 0xffffffffff
    const futureClock = makeTestHLC(futureMs, 5, 'A01')
    const advanced = advanceHLClock(futureClock)

    // Timestamp stays the same (wall clock is behind)
    expect(advanced.substring(0, 10)).toEqual('FFFFFFFFFF')
    // Counter increments from 5 to 6
    expect(advanced.substring(10, 13)).toEqual('006')
    // Node ID preserved
    expect(advanced.substring(13, 16)).toEqual('A01')
  })

  it('preserves node ID regardless of which path is taken', () => {
    const nodeId = 'F2E'
    const hlc = getHLClock(nodeId)
    const advanced = advanceHLClock(hlc)
    expect(advanced.substring(13, 16)).toEqual(nodeId)
  })
})

describe('mergeHLClock branch behavior', () => {
  it('resets counter to 0 when wall clock timestamp is largest', () => {
    // Both clocks have epoch-relative timestamp 0 (Jan 1, 2026 00:00:00)
    // nowMs is always larger since we are past that date
    const oldClock = makeTestHLC(0, 5, 'A01')
    const msgClock = makeTestHLC(1, 3, 'B02')
    const merged = mergeHLClock(oldClock, msgClock)

    // Counter resets to 0 when nowMs wins
    expect(merged.substring(10, 13)).toEqual('000')
    // Timestamp exceeds both stored clocks
    expect(merged.substring(0, 10) > oldClock.substring(0, 10)).toBe(true)
    expect(merged.substring(0, 10) > msgClock.substring(0, 10)).toBe(true)
    // Local node ID preserved
    expect(merged.substring(13, 16)).toEqual('A01')
  })

  it('increments oldCount when oldMs is the largest timestamp', () => {
    const futureMs = 0xffffffffff
    // oldClock has the far-future timestamp; msgClock has a high count but old timestamp
    const oldClock = makeTestHLC(futureMs, 5, 'A01')
    const msgClock = makeTestHLC(1, 999, 'B02')
    const merged = mergeHLClock(oldClock, msgClock)

    // oldMs wins; counter = oldCount + 1 = 6
    expect(merged.substring(0, 10)).toEqual('FFFFFFFFFF')
    expect(merged.substring(10, 13)).toEqual('006')
    // Local node ID preserved, not the message's
    expect(merged.substring(13, 16)).toEqual('A01')
  })

  it('increments msgCount when msgMs is the largest timestamp', () => {
    const futureMs = 0xffffffffff
    const oldClock = makeTestHLC(1, 10, 'A01')
    const msgClock = makeTestHLC(futureMs, 7, 'B02')
    const merged = mergeHLClock(oldClock, msgClock)

    // msgMs wins; counter = msgCount + 1 = 8
    expect(merged.substring(0, 10)).toEqual('FFFFFFFFFF')
    expect(merged.substring(10, 13)).toEqual('008')
    // Local node ID preserved, not the message's
    expect(merged.substring(13, 16)).toEqual('A01')
  })

  it('uses max(oldCount, msgCount) + 1 when all timestamps are equal', () => {
    const futureMs = 0xffffffffff
    // Both clocks have the same far-future timestamp; nowMs is smaller
    const oldClock = makeTestHLC(futureMs, 5, 'A01')
    const msgClock = makeTestHLC(futureMs, 10, 'B02')
    const merged = mergeHLClock(oldClock, msgClock)

    // All timestamps equal; count = max(5, 10) + 1 = 11 = 0xB
    expect(merged.substring(0, 10)).toEqual('FFFFFFFFFF')
    expect(merged.substring(10, 13)).toEqual('00B')
    // Local node ID preserved
    expect(merged.substring(13, 16)).toEqual('A01')
  })

  it('always preserves the local node ID, never the message node ID', () => {
    const futureMs = 0xffffffffff
    const localClock = makeTestHLC(1, 0, 'ABC')
    const remoteClock = makeTestHLC(futureMs, 0, 'DEF')
    const merged = mergeHLClock(localClock, remoteClock)

    expect(merged.substring(13, 16)).toEqual('ABC')
    expect(merged.substring(13, 16)).not.toEqual('DEF')
  })
})

describe('hlcLength and hlcRegex', () => {
  it('hlcLength is 16', () => {
    expect(hlcLength).toBe(16)
  })

  it('hlcRegex matches valid uppercase hex of 16 chars', () => {
    expect(hlcRegex.test('0123456789ABCDEF')).toBe(true)
    expect(hlcRegex.test('FFFFFFFFFFFFFFFF')).toBe(true)
    expect(hlcRegex.test('0000000000000000')).toBe(true)
  })

  it('hlcRegex rejects lowercase hex', () => {
    expect(hlcRegex.test('0123456789abcdef')).toBe(false)
  })

  it('hlcRegex rejects wrong length', () => {
    expect(hlcRegex.test('0123456789ABCDE')).toBe(false)
    expect(hlcRegex.test('0123456789ABCDEF0')).toBe(false)
  })

  it('hlcRegex rejects non-hex characters', () => {
    expect(hlcRegex.test('0123456789ABCXYZ')).toBe(false)
  })
})
