import { usePlensFile } from '@/app/files/plensFile.ts'
import { useFileCommands } from '@/app/files/useFileCommands.ts'
import { Button } from '@/components/ui/button'
import { PageHeader } from '../PageHeader.tsx'
import { SectionLinks } from '../SectionLinks.tsx'
import { NoPlensFile } from './NoPlensFile.tsx'

/** Home [FR-UI-19, FR-UI-34]: the dashboard once a file is open; otherwise how to start. */
export function HomePage() {
  const file = usePlensFile((s) => s.file)
  const cmd = useFileCommands()
  return (
    <div className="flex flex-col gap-6 p-4">
      <PageHeader title="Home" description={file ? file.name : 'Plan and track your household’s finances.'} />
      {file ? (
        <section aria-label="Dashboard" className="grid gap-2">
          <p className="text-muted-foreground text-sm">The dashboard tiles come with the ledger reports.</p>
          <SectionLinks section="past" />
        </section>
      ) : (
        <NoPlensFile />
      )}
      {/* The retirement model still uses its own household file until the plan moves into the ProvisionLens file. */}
      <section aria-labelledby="home-retirement" className="flex max-w-xl flex-col gap-2 rounded border p-4">
        <h3 id="home-retirement" className="font-medium">
          Retirement model
        </h3>
        <p className="text-muted-foreground text-sm">
          Model when to start Social Security, using your savings, taxes, expected expenses and uncertainty.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cmd.newHousehold}>
            New household…
          </Button>
          <Button variant="outline" onClick={() => void cmd.open()}>
            Open…
          </Button>
        </div>
      </section>
    </div>
  )
}
