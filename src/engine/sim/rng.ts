// Seedable PRNG [NFR-ARCH-5]: xoshiro128** seeded through splitmix32. Streams are keyed by
// (seed, path, stream) so a path's draws never depend on how paths are sharded across workers [FR-MC-4].

export interface Rng {
  /** Uniform in (0, 1). */
  next(): number
  /** Standard normal. */
  normal(): number
}

/** Named random streams; one generator per (path, stream). Add new streams at the end. */
export const Stream = {
  inflation: 1,
  returns: 2,
  mortalityPrimary: 3,
  mortalitySpouse: 4,
  inheritance: 5,
  home: 6,
  bootstrap: 7,
  realEstate: 8,
} as const

function splitmix32(state: number): [number, number] {
  state = (state + 0x9e3779b9) | 0
  let z = state
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
  z ^= z >>> 16
  return [z >>> 0, state]
}

function mixKey(seed: number, path: number, stream: number): number {
  let h = seed | 0
  for (const v of [path, stream]) {
    h = Math.imul(h ^ v, 0x01000193) | 0
    h ^= h >>> 15
    h = Math.imul(h, 0x2c1b3c6d) | 0
    h ^= h >>> 12
  }
  return h
}

class Xoshiro128ss implements Rng {
  private a: number
  private b: number
  private c: number
  private d: number
  private spare: number | null = null

  constructor(seed: number) {
    let s = seed | 0
    let v: number
    ;[v, s] = splitmix32(s)
    this.a = v
    ;[v, s] = splitmix32(s)
    this.b = v
    ;[v, s] = splitmix32(s)
    this.c = v
    ;[v] = splitmix32(s)
    this.d = v
    if ((this.a | this.b | this.c | this.d) === 0) this.a = 1
  }

  private nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.b, 5), 7), 9) >>> 0
    const t = this.b << 9
    this.c ^= this.a
    this.d ^= this.b
    this.b ^= this.c
    this.a ^= this.d
    this.c ^= t
    this.d = rotl(this.d, 11)
    return result
  }

  next(): number {
    return (this.nextU32() + 0.5) / 4294967296
  }

  normal(): number {
    if (this.spare !== null) {
      const s = this.spare
      this.spare = null
      return s
    }
    // Marsaglia polar method.
    let u: number
    let v: number
    let q: number
    do {
      u = 2 * this.next() - 1
      v = 2 * this.next() - 1
      q = u * u + v * v
    } while (q >= 1 || q === 0)
    const f = Math.sqrt((-2 * Math.log(q)) / q)
    this.spare = v * f
    return u * f
  }
}

function rotl(x: number, k: number) {
  return (x << k) | (x >>> (32 - k))
}

export function createRng(seed: number, path = 0, stream = 0): Rng {
  return new Xoshiro128ss(mixKey(seed, path, stream))
}
