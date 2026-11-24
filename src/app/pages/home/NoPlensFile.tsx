import { newPlens, openPlens } from '@/app/files/plensFile.ts'
import { Button } from '@/components/ui/button'

/** Shown where a page needs a ProvisionLens file and none is open. */
export function NoPlensFile() {
  return (
    <div className="flex max-w-xl flex-col gap-3 rounded border p-4">
      <p className="text-muted-foreground text-sm">
        Open your ProvisionLens file to see this page, or start a new one. Your file stays on this computer.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => void newPlens()}>New ProvisionLens file…</Button>
        <Button variant="outline" onClick={() => void openPlens()}>
          Open ProvisionLens file…
        </Button>
      </div>
    </div>
  )
}
