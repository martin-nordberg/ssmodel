import { type SectionId, sections } from '@/app/sections.ts'
import { PageHeader } from '../PageHeader.tsx'

// Sections whose pages aren't built yet say what will be there, rather than hiding the tab [FR-UI-19].
const coming: Partial<Record<SectionId, string>> = {
  thisYear:
    'This year’s budget compared with what has actually happened, a year-end forecast, cash flow and sinking funds. These pages come with budgets.',
  nextYear: 'The budget editor and budget summary for next year and the year after. These pages come with budgets.',
  goals: 'Every goal on one timeline, whatever phase it falls in, and a page for each goal.',
  building:
    'The Console set to the working years: wages and savings, debt payoff, rent vs. buy, and results. For now, the retirement model is under Retiring Years.',
}

export function SectionPlaceholder({ section }: { section: SectionId }) {
  const def = sections.find((s) => s.id === section)!
  return (
    <div className="p-4">
      <PageHeader title={def.label} />
      <p data-testid="section-placeholder" className="max-w-2xl text-muted-foreground text-sm">
        Not built yet. {coming[section]}
      </p>
    </div>
  )
}
