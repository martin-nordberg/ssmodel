import { PageHeader } from '../PageHeader.tsx'

export function AboutPage() {
  return (
    <div className="flex flex-col gap-2 p-4">
      <PageHeader title="About ProvisionLens" />
      <p className="max-w-2xl text-sm">
        ProvisionLens keeps your household’s ledger, budget and long-range plan in one file on your computer. It makes
        no network requests with your data.
      </p>
      <p className="text-muted-foreground text-sm">Educational planning tool — not financial, tax or legal advice.</p>
    </div>
  )
}
