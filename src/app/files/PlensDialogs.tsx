import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
  return (
    <Dialog open onOpenChange={(open) => !open && prompt.resolve(null)}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            prompt.resolve(password)
          }}
        >
          <DialogHeader>
            <DialogTitle>Open {prompt.name}</DialogTitle>
            <DialogDescription>This file is encrypted. Enter its password.</DialogDescription>
          </DialogHeader>
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
            {prompt.error && <p className="text-destructive text-xs">{prompt.error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={password.length === 0}>
              Open
            </Button>
          </DialogFooter>
        </form>
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
  }
}
