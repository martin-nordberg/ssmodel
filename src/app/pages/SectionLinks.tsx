import { Link } from '@tanstack/react-router'
import { type SectionId, sections } from '@/app/sections.ts'

/** A section main page's links to the section's other pages [FR-UI-21]. */
export function SectionLinks({ section }: { section: SectionId }) {
  const def = sections.find((s) => s.id === section)!
  const pages = def.pages.filter((p) => p.to !== def.to)
  if (pages.length === 0) return null
  return (
    <ul className="grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
      {pages.map((p) => (
        <li key={p.to}>
          <Link
            to={p.to as '/'}
            className="block rounded border p-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="font-medium">{p.label}</span>
            <span className="block text-muted-foreground text-xs">{p.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
