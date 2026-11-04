import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDocument } from '@/state/documentStore.ts'

/** Placeholder Setup view; replaced by the full panel layout in T1.17. */
export function SetupView() {
  const household = useDocument((s) => s.file?.household)
  const update = useDocument((s) => s.update)
  if (!household) return null
  return (
    <div className="grid max-w-md gap-3 p-4">
      <div className="grid gap-1">
        <Label htmlFor="baseDate">Base date</Label>
        <Input
          id="baseDate"
          type="month"
          min="2027-01"
          value={household.baseDate}
          onChange={(e) => {
            const v = e.target.value
            if (/^\d{4}-\d{2}$/.test(v) && v >= '2027-01')
              update((d) => {
                d.household.baseDate = v
              })
          }}
        />
      </div>
      <p className="text-muted-foreground">
        Primary born {household.people.primary.birthDate}; spouse born {household.people.spouse.birthDate}.
      </p>
    </div>
  )
}
