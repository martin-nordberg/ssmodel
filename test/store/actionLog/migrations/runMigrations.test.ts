import { describe, expect, it } from 'bun:test'
import { setMetaValue } from '@/store/actionLog/meta.ts'
import { up as up0001 } from '@/store/actionLog/migrations/0001_meta.ts'
import { up as up0002 } from '@/store/actionLog/migrations/0002_actions.ts'
import { readSchemaVersion, runMigrations } from '@/store/actionLog/migrations/runMigrations.ts'

// runMigrations runs the schema migrations (1–3); the payload migration 0004 needs the key (see cents.test.ts).
const lastSchemaVersion = 3

import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'

function tableNames(db: DbDriver): string[] {
  return (db.all(`SELECT name FROM sqlite_master WHERE type = 'table'`) as { name: string }[]).map((row) => row.name)
}

function columnNames(db: DbDriver, table: string): string[] {
  return (db.all(`PRAGMA table_info(${table})`) as { name: string }[]).map((row) => row.name)
}

describe('readSchemaVersion', () => {
  it('is 0 for a completely empty database', () => {
    const db = openBunDriver()
    expect(readSchemaVersion(db)).toBe(0)
  })
})

describe('runMigrations', () => {
  it('brings a fresh database to the latest schema_version', () => {
    const db = openBunDriver()
    runMigrations(db)
    expect(readSchemaVersion(db)).toBe(lastSchemaVersion)
  })

  it('creates _checquery_meta, actions, and the six per-entity lookup tables', () => {
    const db = openBunDriver()
    runMigrations(db)
    const names = tableNames(db)
    expect(names).toContain('_checquery_meta')
    expect(names).toContain('actions')
    expect(names).toContain('account_actions')
    expect(names).toContain('account_category_actions')
    expect(names).toContain('vendor_actions')
    expect(names).toContain('transaction_actions')
    expect(names).toContain('balance_assertion_actions')
    expect(names).toContain('origin_actions')
  })

  it('does not create vendor_category_actions -- dropped by 0003 (vendor categories were removed)', () => {
    const db = openBunDriver()
    runMigrations(db)
    expect(tableNames(db)).not.toContain('vendor_category_actions')
  })

  it('creates actions with the expected columns, id as TEXT (an ActnId, not an autoincrement integer)', () => {
    const db = openBunDriver()
    runMigrations(db)
    const columns = columnNames(db, 'actions')
    expect(columns).toEqual(['id', 'action_type', 'hlc', 'iv', 'encrypted_payload'])
  })

  it.each([
    ['account_actions', ['actn_id', 'acct_id']],
    ['account_category_actions', ['actn_id', 'acct_ctg_id']],
    ['vendor_actions', ['actn_id', 'vndr_id']],
    ['transaction_actions', ['actn_id', 'txn_id']],
    ['balance_assertion_actions', ['actn_id', 'asrt_id']],
    ['origin_actions', ['actn_id', 'orig_id']],
  ])('creates %s with the expected columns', (table, expectedColumns) => {
    const db = openBunDriver()
    runMigrations(db)
    expect(columnNames(db, table)).toEqual(expectedColumns)
  })

  it('rejects an action_type outside the known vocabulary', () => {
    const db = openBunDriver()
    runMigrations(db)
    expect(() =>
      db.run(`INSERT INTO actions (id, action_type, hlc, iv, encrypted_payload) VALUES (?, ?, ?, ?, ?)`, [
        'actn1',
        'not-a-real-action',
        '0000000000000000',
        'iv',
        'payload',
      ]),
    ).toThrow()
  })

  it('enforces a unique hlc', () => {
    const db = openBunDriver()
    runMigrations(db)
    db.run(`INSERT INTO actions (id, action_type, hlc, iv, encrypted_payload) VALUES (?, ?, ?, ?, ?)`, [
      'actn1',
      'create-origin',
      '0000000000000001',
      'iv',
      'payload',
    ])
    expect(() =>
      db.run(`INSERT INTO actions (id, action_type, hlc, iv, encrypted_payload) VALUES (?, ?, ?, ?, ?)`, [
        'actn2',
        'create-origin',
        '0000000000000001',
        'iv2',
        'payload2',
      ]),
    ).toThrow()
  })

  it("rejects a duplicate action id across the lookup tables (actn_id is each lookup table's own primary key)", () => {
    const db = openBunDriver()
    runMigrations(db)
    db.run(`INSERT INTO actions (id, action_type, hlc, iv, encrypted_payload) VALUES (?, ?, ?, ?, ?)`, [
      'actn1',
      'create-account',
      '0000000000000001',
      'iv',
      'payload',
    ])
    db.run(`INSERT INTO account_actions (actn_id, acct_id) VALUES (?, ?)`, ['actn1', 'acct1'])
    expect(() => db.run(`INSERT INTO account_actions (actn_id, acct_id) VALUES (?, ?)`, ['actn1', 'acct2'])).toThrow()
  })

  it('0003 drops vendor_category_actions even for a schema_version-2 file that still has real rows in it', () => {
    // Simulate a real pre-existing file: bring it to exactly the schema_version-2 shape by hand (not via
    // runMigrations, which would already apply 0003 too), then give it actual data in the table 0003 is
    // about to drop -- proving the drop never validates/depends on the table's contents.
    const db = openBunDriver()
    up0001(db)
    up0002(db)
    setMetaValue(db, 'schema_version', '2')
    db.run(`INSERT INTO actions (id, action_type, hlc, iv, encrypted_payload) VALUES (?, ?, ?, ?, ?)`, [
      'actn1',
      'create-vendor-category',
      '0000000000000001',
      'iv',
      'payload',
    ])
    db.run(`INSERT INTO vendor_category_actions (actn_id, vndr_ctg_id) VALUES (?, ?)`, ['actn1', 'ctg1'])

    expect(() => runMigrations(db)).not.toThrow()

    expect(readSchemaVersion(db)).toBe(lastSchemaVersion)
    expect(tableNames(db)).not.toContain('vendor_category_actions')
    // The action row itself is untouched -- only the now-unused lookup table is gone.
    const row = db.get(`SELECT action_type FROM actions WHERE id = 'actn1'`) as { action_type: string }
    expect(row.action_type).toBe('create-vendor-category')
  })

  it('is idempotent: calling it again is a no-op', () => {
    const db = openBunDriver()
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
    expect(readSchemaVersion(db)).toBe(lastSchemaVersion)
  })

  it('leaves an unrelated pre-existing schema_version key alone as the migration checkpoint', () => {
    // A file at an already-known version shouldn't re-run migrations below it.
    const db = openBunDriver()
    runMigrations(db)
    db.run(`INSERT INTO _checquery_meta (key, value) VALUES ('unrelated', 'x')`)
    runMigrations(db)
    const row = db.get(`SELECT value FROM _checquery_meta WHERE key = 'unrelated'`) as { value: string }
    expect(row.value).toBe('x')
  })
})
