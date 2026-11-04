import { create } from 'zustand'

// Console panel visibility and order [FR-UI-17], stored in the browser (not the household file).
export type TileId = 'success' | 'median' | 'p10' | 'pvSs' | 'tax' | 'depleted'
export type ChartId = 'claimCurve' | 'fan' | 'income' | 'taxes'

export const TILE_LABELS: Record<TileId, string> = {
  success: 'Success probability',
  median: 'Median estate',
  p10: '10th-percentile estate',
  pvSs: 'PV of Social Security',
  tax: 'Lifetime tax + IRMAA',
  depleted: 'Lowest balance (median)',
}
export const CHART_LABELS: Record<ChartId, string> = {
  claimCurve: 'Claim-age curve',
  fan: 'Balance fan',
  income: 'Income stack',
  taxes: 'Taxes',
}

type Layout = { tiles: { id: TileId; visible: boolean }[]; charts: { id: ChartId; visible: boolean }[] }

const KEY = 'ssmodel.layout'
const defaults: Layout = {
  tiles: (Object.keys(TILE_LABELS) as TileId[]).map((id) => ({ id, visible: id !== 'depleted' })),
  charts: (Object.keys(CHART_LABELS) as ChartId[]).map((id) => ({ id, visible: true })),
}

function load(): Layout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Layout | null
    if (!v || !Array.isArray(v.tiles) || !Array.isArray(v.charts)) return defaults
    const known = <T extends string>(xs: { id: T; visible: boolean }[], all: T[]) => [
      ...xs.filter((x) => all.includes(x.id)),
      ...all.filter((id) => !xs.some((x) => x.id === id)).map((id) => ({ id, visible: true })),
    ]
    return {
      tiles: known(v.tiles, Object.keys(TILE_LABELS) as TileId[]),
      charts: known(v.charts, Object.keys(CHART_LABELS) as ChartId[]),
    }
  } catch {
    return defaults
  }
}

type LayoutState = Layout & {
  toggle(kind: 'tiles' | 'charts', id: string): void
  move(kind: 'tiles' | 'charts', id: string, delta: number): void
  reset(): void
}

function persist(l: Layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tiles: l.tiles, charts: l.charts }))
  } catch {}
}

export const useLayout = create<LayoutState>()((set, get) => ({
  ...(typeof localStorage === 'undefined' ? defaults : load()),
  toggle(kind, id) {
    const next = { ...get(), [kind]: get()[kind].map((x) => (x.id === id ? { ...x, visible: !x.visible } : x)) }
    set(next)
    persist(next)
  },
  move(kind, id, delta) {
    const xs = [...get()[kind]]
    const i = xs.findIndex((x) => x.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= xs.length) return
    ;[xs[i], xs[j]] = [xs[j]!, xs[i]!]
    const next = { ...get(), [kind]: xs }
    set(next)
    persist(next)
  },
  reset() {
    set(defaults)
    persist(defaults)
  },
}))
