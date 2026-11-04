// Coarse→fine candidate grid [NFR-ARCH-6 work reduction]: yearly candidates first, then the quarterly
// candidates within a year of the best. With common random numbers both phases see the same paths.
import type { YM } from '../core/dates.ts'

export function coarseCandidates(all: YM[], fra: YM): YM[] {
  if (all.length <= 12) return all
  const pick = new Set<YM>()
  for (let i = 0; i < all.length; i += 4) pick.add(all[i]!)
  pick.add(all.at(-1)!)
  if (all.includes(fra)) pick.add(fra)
  return all.filter((c) => pick.has(c))
}

export function refineCandidates(all: YM[], evaluated: Set<YM>, best: YM): YM[] {
  const i = all.indexOf(best)
  if (i < 0) return []
  return all.slice(Math.max(0, i - 4), i + 5).filter((c) => !evaluated.has(c))
}
