import { z } from 'zod'

// Known limitation (not fixed, intentionally accepted): if the system clock
// is ever set before this epoch, nowMs goes negative and makeHLC's hex
// encoding throws. Low risk for this app's realistic clock range.
const hlcStartMs = new Date(2026, 0, 1).getTime()

/** Schema for a Checquery hybrid logical clock. */
export const hlcLength = 16

export const hlcRegex = /^[0-9A-F]{16}$/

export const hlcSchema = z
  .string()
  .trim()
  .length(hlcLength, `Hybrid logical clock must be ${hlcLength} characters in length.`)
  .regex(hlcRegex, 'Hybrid logical clock must be an upper case hexadecimal integer.')
  .brand('HLClock')

export type HLClock = z.infer<typeof hlcSchema>

/** Initializes a new clock. */
export function getHLClock(nodeId: string): HLClock {
  const nowMs = Date.now() - hlcStartMs
  return makeHLC(nowMs, 0, nodeId)
}

/** Advances a clock value for sending or storing a new value. */
export function advanceHLClock(oldClock: HLClock): HLClock {
  const oldMs = parseMs(oldClock)
  const nodeId = parseNodeId(oldClock)

  const nowMs = Date.now() - hlcStartMs

  if (nowMs > oldMs) {
    return makeHLC(nowMs, 0, nodeId)
  }

  const newCount = parseCount(oldClock) + 1
  return makeHLC(oldMs, newCount, nodeId)
}

/** Advances a clock after receiving a clock value from another node in a message. */
export function mergeHLClock(oldClock: HLClock, msgClock: HLClock): HLClock {
  const oldMs = parseMs(oldClock)
  const nodeId = parseNodeId(oldClock)

  const msgMs = parseMs(msgClock)

  const nowMs = Date.now() - hlcStartMs

  const newMs = Math.max(oldMs, msgMs, nowMs)

  if (newMs === oldMs && newMs === msgMs) {
    const oldCount = parseCount(oldClock)
    const msgCount = parseCount(msgClock)
    const newCount = Math.max(oldCount, msgCount) + 1
    return makeHLC(newMs, newCount, nodeId)
  } else if (newMs === oldMs) {
    const newCount = parseCount(oldClock) + 1
    return makeHLC(newMs, newCount, nodeId)
  } else if (newMs === msgMs) {
    const newCount = parseCount(msgClock) + 1
    return makeHLC(newMs, newCount, nodeId)
  }

  return makeHLC(newMs, 0, nodeId)
}

/**
 * Constructs an HLClock string from time, count, and node ID.
 *
 * Known limitation (not fixed, intentionally accepted): the counter is 3 hex
 * digits (max 4095/ms). Exceeding that within one millisecond produces an
 * overlong string and hlcSchema.parse throws below — no overflow guard or
 * rollover. Low risk for this app's realistic workload.
 */
function makeHLC(ms: number, count: number, nodeId: string): HLClock {
  return hlcSchema.parse(
    ms.toString(16).padStart(10, '0').toUpperCase() + count.toString(16).padStart(3, '0').toUpperCase() + nodeId,
  )
}

function parseMs(clock: HLClock): number {
  return parseInt(clock.substring(0, 10), 16)
}

function parseCount(clock: HLClock): number {
  return parseInt(clock.substring(10, 13), 16)
}

function parseNodeId(clock: HLClock): string {
  return clock.substring(13, 16)
}
