import { useState } from 'react'
import { TIP_TRIGGER, Tip } from '@/app/components/Tip.tsx'
import { TIPS } from '@/app/tips.ts'
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
import { CURRENT_SCHEMA_VERSION, HouseholdFile } from '@/schema/model.ts'
import { useDocument } from '@/state/documentStore.ts'
import { useUi } from '@/state/uiStore.ts'

/** Collects the facts the schema requires before a household can exist. */
export function NewHouseholdDialog() {
  const open = useUi((s) => s.newDialogOpen)
  const setOpen = useUi((s) => s.setNewDialogOpen)
  const [form, setForm] = useState({ primaryBirth: '', spouseBirth: '', spouseMonthly: '', spouseClaimed: '' })
  const [error, setError] = useState<string | null>(null)
  const field = (k: keyof typeof form) => ({
    id: k,
    value: form[k],
    'aria-description': TIPS[`new.${k}`],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  })

  const create = () => {
    const parsed = HouseholdFile.safeParse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      household: {
        people: {
          primary: { birthDate: form.primaryBirth },
          spouse: {
            birthDate: form.spouseBirth,
            ss: { currentMonthly: Number(form.spouseMonthly), claimedDate: form.spouseClaimed },
          },
        },
      },
      scenarios: [{ id: 'base', name: 'Base case' }],
    })
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.at(-1)?.toString()}: ${i.message}`).join('; '))
      return
    }
    useDocument.getState().newFile(parsed.data)
    setError(null)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New household</DialogTitle>
          <DialogDescription>Enter the facts every model needs. Everything else is edited in Setup.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Tip tip={TIPS['new.primaryBirth']}>
              <Label htmlFor="primaryBirth" className={TIP_TRIGGER}>
                Primary birth date
              </Label>
            </Tip>
            <Input type="date" {...field('primaryBirth')} />
          </div>
          <div className="grid gap-1">
            <Tip tip={TIPS['new.spouseBirth']}>
              <Label htmlFor="spouseBirth" className={TIP_TRIGGER}>
                Spouse birth date
              </Label>
            </Tip>
            <Input type="date" {...field('spouseBirth')} />
          </div>
          <div className="grid gap-1">
            <Tip tip={TIPS['new.spouseMonthly']}>
              <Label htmlFor="spouseMonthly" className={TIP_TRIGGER}>
                Spouse current monthly benefit ($)
              </Label>
            </Tip>
            <Input inputMode="decimal" {...field('spouseMonthly')} />
          </div>
          <div className="grid gap-1">
            <Tip tip={TIPS['new.spouseClaimed']}>
              <Label htmlFor="spouseClaimed" className={TIP_TRIGGER}>
                Spouse claimed (month)
              </Label>
            </Tip>
            <Input type="month" {...field('spouseClaimed')} />
          </div>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={create}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
