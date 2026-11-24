import { PageHeader } from '../PageHeader.tsx'
import { SectionLinks } from '../SectionLinks.tsx'

/** Setup [FR-UI-19]: what describes the household and the file. */
export function SetupPage() {
  return (
    <div className="p-4">
      <PageHeader title="Setup" description="Everything that describes the household and the file." />
      <SectionLinks section="setup" />
    </div>
  )
}
