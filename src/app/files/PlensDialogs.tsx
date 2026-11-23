import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type Prompt, usePlensFile } from './plensFile.ts'

// The questions the .plens file controller asks: a new file's password, an existing file's password, whether to
// recover a working copy, and whether to upgrade an older file [FR-STO-3, FR-STO-5, FR-STO-7].

function NewPasswordDialog({ prompt }: { prompt: Extract<Prompt, { kind: 'new-password' }> }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [unencrypted, setUnencrypted] = useState(false)
  const mismatch = confirm.length > 0 && password !== confirm
  const ready = unencrypted || (password.length > 0 && password === confirm)
  return (
    <Dialog open onOpenChange={(open) => !open && prompt.resolve(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ProvisionLens file</DialogTitle>
          <DialogDescription>
            The file is encrypted with a password. If you forget it, the data can't be recovered.
          </DialogDescription>
        </DialogHeader>
        {unencrypted ? (
          <p className="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-sm">
            Without encryption, anyone who gets the file can read your household's finances. Use this only for test
            files.
          </p>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="plens-new-password">Password</Label>
              <Input
                id="plens-new-password"
                type="password"
                autoComplete="new-password"
                aria-description="The password that encrypts this file. You need it every time you open the file."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="plens-confirm-password">Confirm password</Label>
              <Input
                id="plens-confirm-password"
                type="password"
                autoComplete="new-password"
                aria-description="Type the password again, to catch typing mistakes."
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {mismatch && <p className="text-destructive text-xs">The passwords don't match.</p>}
            </div>
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          <Button variant="link" className="px-0" onClick={() => setUnencrypted(!unencrypted)}>
            {unencrypted ? 'Use a password' : 'Create without encryption…'}
          </Button>
          <Button disabled={!ready} onClick={() => prompt.resolve({ password: unencrypted ? undefined : password })}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PasswordDialog({ prompt }: { prompt: Extract<Prompt, { kind: 'password' }> }) {
  const [password, setPassword] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [words, setWords] = useState('')
  const ready = useRecovery ? words.trim().split(/\s+/).length === 24 : password.length > 0
  return (
    <Dialog open onOpenChange={(open) => !open && prompt.resolve(null)}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready) prompt.resolve(useRecovery ? { recoveryWords: words } : { password })
          }}
        >
          <DialogHeader>
            <DialogTitle>Open {prompt.name}</DialogTitle>
            <DialogDescription>
              {useRecovery
                ? 'Enter the 24 words of the recovery key you saved when the file was created.'
                : 'This file is encrypted. Enter its password.'}
            </DialogDescription>
          </DialogHeader>
          {useRecovery ? (
            <div className="grid gap-1">
              <Label htmlFor="plens-recovery-words">Recovery key</Label>
              <Textarea
                id="plens-recovery-words"
                rows={4}
                autoFocus
                spellCheck={false}
                aria-description="The 24 recovery-key words, in order, separated by spaces or new lines."
                value={words}
                onChange={(e) => setWords(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid gap-1">
              <Label htmlFor="plens-password">Password</Label>
              <Input
                id="plens-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                aria-description="The password that was set when this file was created or last changed."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {prompt.error && <p className="text-destructive text-xs">{prompt.error}</p>}
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="link" className="px-0" onClick={() => setUseRecovery(!useRecovery)}>
              {useRecovery ? 'Use the password' : 'Forgot the password? Use the recovery key'}
            </Button>
            <Button type="submit" disabled={!ready}>
              Open
            </Button>
          </DialogFooter>
          {useRecovery && (
            <p className="text-muted-foreground text-xs">
              Without the password or the recovery key, the file can't be opened by anyone, including us.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SetPasswordDialog({ prompt }: { prompt: Extract<Prompt, { kind: 'set-password' }> }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm.length > 0 && password !== confirm
  return (
    <Dialog open onOpenChange={(open) => !open && prompt.resolve(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{prompt.title}</DialogTitle>
          <DialogDescription>{prompt.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="plens-set-password">New password</Label>
            <Input
              id="plens-set-password"
              type="password"
              autoComplete="new-password"
              aria-description="The password that will be needed to open this file."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="plens-set-confirm">Confirm new password</Label>
            <Input
              id="plens-set-confirm"
              type="password"
              autoComplete="new-password"
              aria-description="Type the new password again, to catch typing mistakes."
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && <p className="text-destructive text-xs">The passwords don't match.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => prompt.resolve(null)}>
            Cancel
          </Button>
          <Button disabled={password.length === 0 || password !== confirm} onClick={() => prompt.resolve(password)}>
            Set password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecoveryKeyDialog({ prompt }: { prompt: Extract<Prompt, { kind: 'recovery-key' }> }) {
  const [kept, setKept] = useState(false)
  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Your recovery key</DialogTitle>
          <DialogDescription>
            If you forget the password, these 24 words are the only way to open the file. Write them down or print them,
            and keep them somewhere safe and separate from the file. They won't be shown again.
          </DialogDescription>
        </DialogHeader>
        <ol
          data-testid="recovery-words"
          className="grid grid-cols-3 gap-x-4 gap-y-1 rounded border p-3 font-mono text-sm"
        >
          {prompt.words.map((word, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the words' positions are their identity.
            <li key={i}>
              <span className="text-muted-foreground">{i + 1}.</span> {word}
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            id="plens-recovery-kept"
            checked={kept}
            onCheckedChange={(v) => setKept(v === true)}
            aria-description="Confirms you have written down, printed or stored the 24 words before closing this."
          />
          <Label htmlFor="plens-recovery-kept">I have saved the recovery key</Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(prompt.words.join(' '))}>
            Copy
          </Button>
          <Button disabled={!kept} onClick={() => prompt.resolve(true)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmDialog({ prompt }: { prompt: Extract<Prompt, { kind: 'confirm' }> }) {
  return (
    <Dialog open onOpenChange={(open) => !open && prompt.resolve(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{prompt.title}</DialogTitle>
          <DialogDescription>{prompt.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => prompt.resolve(false)}>
            Cancel
          </Button>
          <Button onClick={() => prompt.resolve(true)}>{prompt.action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecoverDialog({ prompt }: { prompt: Extract<Prompt, { kind: 'recover' }> }) {
  return (
    <Dialog open onOpenChange={(open) => !open && prompt.resolve(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recover unsaved changes?</DialogTitle>
          <DialogDescription>
            This browser has a newer version of {prompt.name}, with changes that weren't saved to the file (for example,
            because the app closed unexpectedly).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => prompt.resolve('file')}>
            Discard them and open the file
          </Button>
          <Button onClick={() => prompt.resolve('working-copy')}>Recover changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MigrateDialog({ prompt }: { prompt: Extract<Prompt, { kind: 'migrate' }> }) {
  return (
    <Dialog open onOpenChange={(open) => !open && prompt.resolve(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade {prompt.name}?</DialogTitle>
          <DialogDescription>
            This file was made by an older version. To open it, it is upgraded and saved in the new format, which older
            versions can't open. Consider saving a copy of the original first.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => prompt.resolve(false)}>
            Cancel
          </Button>
          <Button onClick={() => prompt.resolve(true)}>Upgrade and open</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OtherDeviceDialog({ prompt }: { prompt: Extract<Prompt, { kind: 'other-device' }> }) {
  const minutes = Math.max(1, Math.round((Date.now() - prompt.openBy.at) / 60_000))
  return (
    <Dialog open onOpenChange={(open) => !open && prompt.resolve(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{prompt.name} may be open on another device</DialogTitle>
          <DialogDescription>
            It was open on “{prompt.openBy.deviceName}” {minutes === 1 ? 'a minute' : `${minutes} minutes`} ago. If you
            edit it in both places, one device's changes will overwrite the other's. Close it there first if you can.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => prompt.resolve(false)}>
            Cancel
          </Button>
          <Button onClick={() => prompt.resolve(true)}>Open anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PlensDialogs() {
  const prompt = usePlensFile((s) => s.prompt)
  if (!prompt) return null
  // Keyed by prompt, so each question starts with empty fields (e.g. a password retry).
  switch (prompt.kind) {
    case 'new-password':
      return <NewPasswordDialog key={prompt.id} prompt={prompt} />
    case 'password':
      return <PasswordDialog key={prompt.id} prompt={prompt} />
    case 'recover':
      return <RecoverDialog key={prompt.id} prompt={prompt} />
    case 'migrate':
      return <MigrateDialog key={prompt.id} prompt={prompt} />
    case 'other-device':
      return <OtherDeviceDialog key={prompt.id} prompt={prompt} />
    case 'set-password':
      return <SetPasswordDialog key={prompt.id} prompt={prompt} />
    case 'recovery-key':
      return <RecoveryKeyDialog key={prompt.id} prompt={prompt} />
    case 'confirm':
      return <ConfirmDialog key={prompt.id} prompt={prompt} />
  }
}
