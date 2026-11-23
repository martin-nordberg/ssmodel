import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getStoreClient } from '@/state/storeClient.ts'
import { listRollingBackups, type RollingBackup } from '@/store/file/backup.ts'
import type { EncryptionInfo } from '@/worker/storeProtocol.ts'
import {
  backupFolderName,
  changePlensPassword,
  chooseBackupFolder,
  openPlensSettings,
  replacePlensRecoveryKey,
  saveRollingBackupAs,
  setPlensEncryption,
  stopBackupFolder,
  usePlensFile,
} from './plensFile.ts'

// File settings for the open .plens file: encryption, password, recovery key [FR-STO-5] and backups [FR-STO-6].
// A dialog until the Setup › File page exists (P2).

export function PlensSettingsDialog() {
  const open = usePlensFile((s) => s.settingsOpen)
  const file = usePlensFile((s) => s.file)
  const busy = usePlensFile((s) => s.prompt !== null)
  const [info, setInfo] = useState<EncryptionInfo | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [backups, setBackups] = useState<RollingBackup[]>([])

  useEffect(() => {
    if (!open || !file || busy) return
    void getStoreClient().request('encryptionInfo', {}).then(setInfo)
    void backupFolderName().then(setFolder)
    void listRollingBackups(file.fileId).then(setBackups)
  }, [open, file, busy])

  if (!file) return null
  const editable = !file.readOnly
  return (
    <Dialog open={open && !busy} onOpenChange={(o) => openPlensSettings(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>File settings: {file.name}</DialogTitle>
          <DialogDescription>Encryption, recovery key and backups for this file.</DialogDescription>
        </DialogHeader>

        <section className="grid gap-2" aria-labelledby="plens-settings-encryption">
          <h3 id="plens-settings-encryption" className="font-medium">
            Encryption
          </h3>
          <p data-testid="settings-encryption" className="text-muted-foreground text-sm">
            {info === null
              ? '…'
              : info.encrypted
                ? `Encrypted with a password${info.hasRecoveryKey ? ', with a recovery key.' : '. No recovery key yet.'}`
                : 'Not encrypted: anyone with the file can read it.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {info?.encrypted ? (
              <>
                <Button size="sm" variant="outline" disabled={!editable} onClick={() => void changePlensPassword()}>
                  Change password…
                </Button>
                <Button size="sm" variant="outline" disabled={!editable} onClick={() => void replacePlensRecoveryKey()}>
                  {info.hasRecoveryKey ? 'New recovery key…' : 'Create recovery key…'}
                </Button>
                <Button size="sm" variant="outline" disabled={!editable} onClick={() => void setPlensEncryption(false)}>
                  Turn off encryption…
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" disabled={!editable} onClick={() => void setPlensEncryption(true)}>
                Turn on encryption…
              </Button>
            )}
          </div>
        </section>

        <section className="grid gap-2" aria-labelledby="plens-settings-folder">
          <h3 id="plens-settings-folder" className="font-medium">
            Backup folder
          </h3>
          <p data-testid="settings-backup-folder" className="text-muted-foreground text-sm">
            {folder
              ? `A dated copy goes to “${folder}” when you close a file, once a day (30 days kept, then one a month).`
              : 'No backup folder. Choose one (for example on a USB drive or a synced folder) for daily copies.'}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void chooseBackupFolder().then((n) => n && setFolder(n))}
            >
              {folder ? 'Change folder…' : 'Choose backup folder…'}
            </Button>
            {folder && (
              <Button size="sm" variant="ghost" onClick={() => void stopBackupFolder().then(() => setFolder(null))}>
                Stop using it
              </Button>
            )}
          </div>
        </section>

        <section className="grid gap-2" aria-labelledby="plens-settings-backups">
          <h3 id="plens-settings-backups" className="font-medium">
            Backups in this browser
          </h3>
          <p className="text-muted-foreground text-sm">A copy is kept each time you close the file (the last 10).</p>
          <ul data-testid="settings-backups" className="grid max-h-40 gap-1 overflow-auto text-sm">
            {backups.length === 0 && <li className="text-muted-foreground">None yet.</li>}
            {backups.map((b) => (
              <li key={b.name} className="flex items-center justify-between gap-2">
                <span>
                  {b.at.toLocaleString()} · {Math.round(b.size / 1024)} KB
                </span>
                <Button size="sm" variant="ghost" onClick={() => void saveRollingBackupAs(b.name)}>
                  Save a copy…
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  )
}
