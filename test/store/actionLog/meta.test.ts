import { describe, expect, it } from 'bun:test'
import { getAllMetaEntries, getMetaValue, setMetaValue } from '@/store/actionLog/meta.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'

function makeDb() {
  const db = openBunDriver()
  db.run(`CREATE TABLE _checquery_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  return db
}

describe('getAllMetaEntries', () => {
  it('returns an empty array for an empty table', () => {
    const db = makeDb()
    expect(getAllMetaEntries(db)).toEqual([])
  })

  it('returns every key/value pair, ordered by key', () => {
    const db = makeDb()
    setMetaValue(db, 'node_id', 'ABC')
    setMetaValue(db, 'file_id', 'xyz123')
    setMetaValue(db, 'encrypted', 'true')

    expect(getAllMetaEntries(db)).toEqual([
      { key: 'encrypted', value: 'true' },
      { key: 'file_id', value: 'xyz123' },
      { key: 'node_id', value: 'ABC' },
    ])
  })

  it('reflects an update in place rather than a duplicate row', () => {
    const db = makeDb()
    setMetaValue(db, 'node_id', 'ABC')
    setMetaValue(db, 'node_id', 'DEF')

    expect(getAllMetaEntries(db)).toEqual([{ key: 'node_id', value: 'DEF' }])
    expect(getMetaValue(db, 'node_id')).toBe('DEF')
  })
})
