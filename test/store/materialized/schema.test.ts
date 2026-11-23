import { describe, expect, it } from 'bun:test'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'
import type { DbDriver } from '@/store/driver/DbDriver.ts'
import { createSchema } from '@/store/materialized/schema.ts'

function tableNames(db: DbDriver): string[] {
  return (db.all(`SELECT name FROM sqlite_master WHERE type = 'table'`) as { name: string }[]).map((row) => row.name)
}

function columnNames(db: DbDriver, table: string): string[] {
  return (db.all(`PRAGMA table_info(${table})`) as { name: string }[]).map((row) => row.name)
}

function indexNames(db: DbDriver): string[] {
  return (db.all(`SELECT name FROM sqlite_master WHERE type = 'index'`) as { name: string }[])
    .map((row) => row.name)
    .filter((name) => !name.startsWith('sqlite_autoindex_'))
}

describe('createSchema', () => {
  it('creates all seven tables', () => {
    const db = openBunDriver()
    createSchema(db)
    expect(tableNames(db).sort()).toEqual(
      ['account_categories', 'accounts', 'balance_assertions', 'entries', 'origins', 'transactions', 'vendors'].sort(),
    )
  })

  it('creates account_categories with the expected columns', () => {
    const db = openBunDriver()
    createSchema(db)
    expect(columnNames(db, 'account_categories')).toEqual([
      'id',
      'orig_id',
      'parent_ctg_id',
      'acct_type',
      'name',
      'description',
      'is_deleted',
    ])
  })

  it('creates accounts with the expected columns', () => {
    const db = openBunDriver()
    createSchema(db)
    expect(columnNames(db, 'accounts')).toEqual([
      'id',
      'orig_id',
      'parent_ctg_id',
      'acct_type',
      'name',
      'description',
      'is_primary',
      'is_deleted',
    ])
  })

  it('creates vendors with the expected columns', () => {
    const db = openBunDriver()
    createSchema(db)
    expect(columnNames(db, 'vendors')).toEqual([
      'id',
      'orig_id',
      'name',
      'description',
      'default_acct_id',
      'is_active',
      'is_deleted',
    ])
  })

  it('creates transactions with the expected columns', () => {
    const db = openBunDriver()
    createSchema(db)
    expect(columnNames(db, 'transactions')).toEqual([
      'id',
      'orig_id',
      'post_date',
      'cleared_date',
      'code',
      'vndr_id',
      'description',
      'needs_review',
      'is_deleted',
    ])
  })

  it('creates entries with the expected columns', () => {
    const db = openBunDriver()
    createSchema(db)
    expect(columnNames(db, 'entries')).toEqual([
      'id',
      'transaction_id',
      'ordinal',
      'acct_id',
      'debit_cents',
      'credit_cents',
    ])
  })

  it('creates balance_assertions with the expected columns', () => {
    const db = openBunDriver()
    createSchema(db)
    expect(columnNames(db, 'balance_assertions')).toEqual([
      'id',
      'orig_id',
      'acct_id',
      'assertion_date',
      'balance_cents',
      'is_deleted',
    ])
  })

  it('creates origins with the expected columns (no orig_id, no is_deleted)', () => {
    const db = openBunDriver()
    createSchema(db)
    expect(columnNames(db, 'origins')).toEqual(['id', 'name', 'ip_address'])
  })

  it('creates the expected indexes', () => {
    const db = openBunDriver()
    createSchema(db)
    expect(indexNames(db).sort()).toEqual(
      [
        'account_categories_parent_ctg_id_idx',
        'accounts_parent_ctg_id_idx',
        'transactions_post_date_idx',
        'transactions_vndr_id_idx',
        'entries_transaction_id_idx',
        'entries_acct_id_idx',
        'balance_assertions_acct_id_idx',
      ].sort(),
    )
  })

  it('rejects a duplicate primary key on accounts', () => {
    const db = openBunDriver()
    createSchema(db)
    db.run(
      `INSERT INTO accounts (id, orig_id, parent_ctg_id, acct_type, name, description, is_primary) VALUES ('a', 'o', 'c', 'ASSET', 'n', '', 0)`,
    )
    expect(() =>
      db.run(
        `INSERT INTO accounts (id, orig_id, parent_ctg_id, acct_type, name, description, is_primary) VALUES ('a', 'o', 'c', 'ASSET', 'n', '', 0)`,
      ),
    ).toThrow()
  })

  it('rejects a duplicate primary key on account_categories', () => {
    const db = openBunDriver()
    createSchema(db)
    db.run(
      `INSERT INTO account_categories (id, orig_id, acct_type, name, description) VALUES ('a', 'o', 'ASSET', 'n', '')`,
    )
    expect(() =>
      db.run(
        `INSERT INTO account_categories (id, orig_id, acct_type, name, description) VALUES ('a', 'o', 'ASSET', 'n', '')`,
      ),
    ).toThrow()
  })
})
