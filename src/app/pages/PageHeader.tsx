import { Breadcrumbs, type Crumb } from '@/app/shell/Breadcrumbs.tsx'

/** A page's title row, with the drill-down trail above it when there is one [FR-UI-22]. */
export function PageHeader({
  title,
  description,
  trail,
  actions,
}: {
  title: string
  description?: string
  trail?: Crumb[]
  actions?: React.ReactNode
}) {
  return (
    <header className="mb-3 flex flex-wrap items-end gap-3">
      <div className="min-w-0">
        {trail && trail.length > 0 && <Breadcrumbs trail={trail} current={title} />}
        <h2 className="font-semibold text-base">{title}</h2>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  )
}
