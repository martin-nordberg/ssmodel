import { describe, expect, test } from 'bun:test'
import { createRng, Stream } from '@/engine/sim/rng.ts'

describe('rng', () => {
  test('same key gives the same sequence', () => {
    const a = createRng(42, 7, Stream.returns)
    const b = createRng(42, 7, Stream.returns)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  test('different paths and streams differ', () => {
    const x = createRng(42, 7, Stream.returns).next()
    expect(createRng(42, 8, Stream.returns).next()).not.toBe(x)
    expect(createRng(42, 7, Stream.inflation).next()).not.toBe(x)
    expect(createRng(43, 7, Stream.returns).next()).not.toBe(x)
  })

  test('uniforms are in (0,1) with mean 1/2', () => {
    const r = createRng(1)
    let sum = 0
    const n = 200_000
    for (let i = 0; i < n; i++) {
      const u = r.next()
      expect(u > 0 && u < 1).toBe(true)
      sum += u
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.003)
  })

  test('normals have mean 0 and sd 1', () => {
    const r = createRng(2)
    const n = 200_000
    let s = 0
    let s2 = 0
    for (let i = 0; i < n; i++) {
      const z = r.normal()
      s += z
      s2 += z * z
    }
    const mean = s / n
    expect(Math.abs(mean)).toBeLessThan(0.01)
    expect(Math.abs(Math.sqrt(s2 / n - mean * mean) - 1)).toBeLessThan(0.01)
  })
})
