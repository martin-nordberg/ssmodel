import type { DbDriver } from '@/store/driver/DbDriver.ts'

/**
 * Drops the `vendor_category_actions` lookup table, left behind once vendor categories were removed from the
 * application (see tasks/done/remove-vendor-categories-implementation-plan.md) -- nothing has looked anything
 * up in it since. Safe as an ordinary forward migration, unlike tightening `actions.action_type`'s CHECK
 * constraint would be (see that plan's §12): dropping a table never validates its existing contents, so this
 * runs cleanly even against a file that still has real rows in the table (its own historical
 * `create-vendor-category` etc. actions, if any, stay untouched in the `actions` table itself -- this only
 * removes the now-unused index alongside them). `0002_actions.ts`'s `CHECK` constraint stays frozen exactly as
 * it is; only this one dead table goes.
 */
export function up(db: DbDriver): void {
  db.exec(`DROP TABLE IF EXISTS vendor_category_actions`)
}
