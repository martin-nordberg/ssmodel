import { usePlensFile } from '@/app/files/plensFile.ts'
import { NoPlensFile } from '../home/NoPlensFile.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { SectionLinks } from '../SectionLinks.tsx'

/** Past: registers and reports of what has happened [FR-UI-19]. */
export function PastPage() {
  const file = usePlensFile((s) => s.file)
  return (
    <div className="p-4">
      <PageHeader title="Past" description="Registers and reports of what has happened." />
      {file ? <SectionLinks section="past" /> : <NoPlensFile />}
    </div>
  )
}
