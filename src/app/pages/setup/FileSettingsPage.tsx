import { FileSettingsPanel } from '@/app/files/FileSettingsPanel.tsx'
import { usePlensFile } from '@/app/files/plensFile.ts'
import { NoPlensFile } from '../home/NoPlensFile.tsx'
import { PageHeader } from '../PageHeader.tsx'

/** Setup › File settings [FR-UI-19, FR-STO-5, FR-STO-6]. */
export function FileSettingsPage() {
  const file = usePlensFile((s) => s.file)
  return (
    <div className="p-4">
      <PageHeader
        title="File settings"
        description={file ? `Encryption, recovery key and backups for ${file.name}.` : undefined}
      />
      {file ? <FileSettingsPanel /> : <NoPlensFile />}
    </div>
  )
}
