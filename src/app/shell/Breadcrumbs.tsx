import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

// Breadcrumbs only as a trail for drill-downs, e.g. "Past › Income Statement 2026 › Groceries › Register"
// [FR-UI-22, D: OQ-UI-7]. A page that was drilled into receives the trail in its `trail` search param.

export interface Crumb {
  label: string
  /** A hash route, e.g. "/past/income-statement?year=2026". */
  href: string
}

export function Breadcrumbs({ trail, current }: { trail: Crumb[]; current: string }) {
  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumbs" className="mb-0.5 text-muted-foreground text-xs">
      <ol className="flex flex-wrap items-center gap-1">
        {trail.map((c) => (
          <li key={c.href} className="flex items-center gap-1">
            <Link to={c.href as '/'} className="hover:text-foreground hover:underline">
              {c.label}
            </Link>
            <ChevronRight className="size-3" aria-hidden />
          </li>
        ))}
        <li aria-current="page" className="text-foreground">
          {current}
        </li>
      </ol>
    </nav>
  )
}
