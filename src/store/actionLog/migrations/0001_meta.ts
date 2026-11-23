import type { DbDriver } from '@/store/driver/DbDriver.ts'

export function up(db: DbDriver): void {
  db.exec(`CREATE TABLE _checquery_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
}
