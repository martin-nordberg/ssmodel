import type { GridColumn } from '@/app/components/grid/DataGrid.tsx'

/** Yes/No inclusion toggle for a row; an excluded row stays in the grid but is left out of the model. */
export function includedColumn<R extends { included: boolean }>(tip: string): GridColumn<R> {
  return {
    id: 'included',
    header: 'Included',
    tip,
    type: 'select',
    width: 90,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    get: (r) => (r.included ? 'yes' : 'no'),
    set: (r, v) => ({ ...r, included: v === 'yes' }),
  }
}

export const isExcluded = (r: { included: boolean }) => !r.included
