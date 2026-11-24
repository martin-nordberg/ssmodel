import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { sectionOf, sections } from '@/app/sections.ts'
import { phaseHue } from '@/app/theme/tokens.ts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// Top tabs, one per section [FR-UI-20, D: OQ-UI-5, D: OQ-UI-14]. Clicking a tab opens the section's main page; its
// arrow opens a menu of the section's pages.

export function SectionTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const current = sectionOf(pathname)
  return (
    <nav aria-label="Sections" className="flex items-center gap-0.5">
      {sections.map((section) => {
        const active = section.id === current.id
        return (
          <div
            key={section.id}
            className={cn(
              'flex items-center rounded-md border-b-2',
              active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            // The timeline phases carry a quiet hue [FR-UI-29, D: OQ-UI-9].
            style={{ borderBottomColor: phaseHue[section.id] ?? 'transparent' }}
          >
            <Link
              to={section.to as '/'}
              aria-current={active ? 'page' : undefined}
              data-section={section.id}
              className="rounded-l-md px-2 py-1 font-medium text-sm focus-visible:outline-2 focus-visible:outline-ring"
            >
              {section.label}
            </Link>
            {section.pages.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`${section.label} pages`}
                  className="rounded-r-md py-1 pr-1 pl-0.5 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <ChevronDown className="size-3.5" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {section.pages.map((page) => (
                    <DropdownMenuItem key={page.to} asChild>
                      <Link to={page.to as '/'}>{page.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      })}
    </nav>
  )
}
