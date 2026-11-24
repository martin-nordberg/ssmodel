import { PageHeader } from '../PageHeader.tsx'
import { SectionLinks } from '../SectionLinks.tsx'

/** Help [FR-UI-19]; the help pages themselves come in P10. */
export function HelpPage() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <PageHeader title="Help" />
      <p className="max-w-2xl text-muted-foreground text-sm">
        Every input has a tooltip: hover over its label, or focus it and wait a moment. Press Ctrl+K for the command
        palette, which lists every page and command. Help pages and a glossary are coming.
      </p>
      <SectionLinks section="help" />
    </div>
  )
}
