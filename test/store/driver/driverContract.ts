import type { DbDriver } from '@/store/driver/DbDriver.ts'

// One contract both DbDriver implementations must meet [NFR-ARCH-9]. Plain functions with their own assertions
// (no bun:test), so the same cases run under `bun test` (bunSqlite) and in a browser worker (wasmSqlite).

export interface DriverFactory {
  open(): DbDriver
  openBytes(bytes: Uint8Array): DbDriver
}

export interface ContractCase {
  name: string
  run(factory: DriverFactory): void
}

function eq(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual, (_k, v) => (v instanceof Uint8Array ? [...v] : v))
  const e = JSON.stringify(expected, (_k, v) => (v instanceof Uint8Array ? [...v] : v))
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`)
}

function throws(fn: () => unknown, what: string): void {
  try {
    fn()
  } catch {
    return
  }
  throw new Error(`${what}: expected an error`)
}

function withDb(factory: DriverFactory, fn: (db: DbDriver) => void): void {
  const db = factory.open()
  try {
    fn(db)
  } finally {
    db.close()
  }
}

const schema = 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, amount INTEGER, ratio REAL, data BLOB)'

export const driverContract: ContractCase[] = [
  {
    name: 'exec runs several statements',
    run: (f) =>
      withDb(f, (db) => {
        db.exec(`${schema}; CREATE INDEX t_name ON t (name);`)
        eq(
          db.all("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name"),
          [{ name: 't' }, { name: 't_name' }],
          'schema',
        )
      }),
  },
  {
    name: 'run binds parameters and reports changes',
    run: (f) =>
      withDb(f, (db) => {
        db.exec(schema)
        eq(db.run('INSERT INTO t (name, amount) VALUES (?, ?)', ['a', 1]), { changes: 1 }, 'insert')
        db.run('INSERT INTO t (name, amount) VALUES (?, ?)', ['b', 2])
        eq(db.run('UPDATE t SET amount = amount + 1'), { changes: 2 }, 'update all')
        eq(db.run('UPDATE t SET amount = 0 WHERE name = ?', ['none']), { changes: 0 }, 'update none')
      }),
  },
  {
    name: 'values round-trip by type',
    run: (f) =>
      withDb(f, (db) => {
        db.exec(schema)
        const big = 2 ** 40 + 7 // cents well beyond 32 bits
        db.run('INSERT INTO t (id, name, amount, ratio, data) VALUES (?, ?, ?, ?, ?)', [
          1,
          'héllo – ✓',
          big,
          0.125,
          new Uint8Array([0, 1, 254, 255]),
        ])
        db.run('INSERT INTO t (id, name, amount, ratio, data) VALUES (?, ?, ?, ?, ?)', [2, null, -5, null, null])
        eq(
          db.all('SELECT id, name, amount, ratio, data FROM t ORDER BY id'),
          [
            { id: 1, name: 'héllo – ✓', amount: big, ratio: 0.125, data: new Uint8Array([0, 1, 254, 255]) },
            { id: 2, name: null, amount: -5, ratio: null, data: null },
          ],
          'rows',
        )
      }),
  },
  {
    name: 'get returns the first row or null; all returns [] when empty',
    run: (f) =>
      withDb(f, (db) => {
        db.exec(schema)
        eq(db.get('SELECT * FROM t'), null, 'empty get')
        eq(db.all('SELECT * FROM t'), [], 'empty all')
        db.run("INSERT INTO t (name) VALUES ('x'), ('y')")
        eq(db.get('SELECT name FROM t ORDER BY name DESC'), { name: 'y' }, 'first row')
        eq(db.get('SELECT COUNT(*) AS n FROM t WHERE name = ?', ['x']), { n: 1 }, 'count')
      }),
  },
  {
    name: 'a cached statement is reusable with new parameters, and after an error',
    run: (f) =>
      withDb(f, (db) => {
        db.exec('CREATE TABLE u (k TEXT PRIMARY KEY)')
        const insert = 'INSERT INTO u (k) VALUES (?)'
        db.run(insert, ['a'])
        throws(() => db.run(insert, ['a']), 'duplicate key')
        db.run(insert, ['b'])
        eq(db.all('SELECT k FROM u WHERE k > ? ORDER BY k', ['']), [{ k: 'a' }, { k: 'b' }], 'rows')
        eq(db.all('SELECT k FROM u WHERE k > ? ORDER BY k', ['a']), [{ k: 'b' }], 'rebound')
      }),
  },
  {
    name: 'bad SQL throws',
    run: (f) => withDb(f, (db) => throws(() => db.all('SELEKT 1'), 'syntax error')),
  },
  {
    name: 'transaction commits and returns its value',
    run: (f) =>
      withDb(f, (db) => {
        db.exec(schema)
        const n = db.transaction(() => {
          db.run("INSERT INTO t (name) VALUES ('a')")
          db.run("INSERT INTO t (name) VALUES ('b')")
          return 2
        })
        eq(n, 2, 'return value')
        eq(db.get('SELECT COUNT(*) AS n FROM t'), { n: 2 }, 'committed')
      }),
  },
  {
    name: 'transaction rolls back when it throws',
    run: (f) =>
      withDb(f, (db) => {
        db.exec(schema)
        throws(
          () =>
            db.transaction(() => {
              db.run("INSERT INTO t (name) VALUES ('a')")
              throw new Error('boom')
            }),
          'rethrows',
        )
        eq(db.get('SELECT COUNT(*) AS n FROM t'), { n: 0 }, 'rolled back')
      }),
  },
  {
    name: 'nested transaction: a caught inner failure undoes only the inner work',
    run: (f) =>
      withDb(f, (db) => {
        db.exec(schema)
        db.transaction(() => {
          db.run("INSERT INTO t (name) VALUES ('outer')")
          try {
            db.transaction(() => {
              db.run("INSERT INTO t (name) VALUES ('inner')")
              throw new Error('inner')
            })
          } catch {
            // expected
          }
        })
        eq(db.all('SELECT name FROM t'), [{ name: 'outer' }], 'rows')
      }),
  },
  {
    name: 'exported bytes reopen as a writable copy',
    run: (f) => {
      const bytes = (() => {
        const db = f.open()
        try {
          db.exec(schema)
          db.run("INSERT INTO t (name, amount) VALUES ('kept', 42)")
          return db.exportBytes()
        } finally {
          db.close()
        }
      })()
      eq([...bytes.subarray(0, 15)].map((c) => String.fromCharCode(c)).join(''), 'SQLite format 3', 'header')
      const copy = f.openBytes(bytes)
      try {
        eq(copy.all('SELECT name, amount FROM t'), [{ name: 'kept', amount: 42 }], 'copied rows')
        copy.run("INSERT INTO t (name, data) VALUES ('grown', ?)", [new Uint8Array(200_000)])
        eq(copy.get('SELECT COUNT(*) AS n FROM t'), { n: 2 }, 'written after reopen')
        const again = f.openBytes(copy.exportBytes())
        try {
          eq(again.get("SELECT length(data) AS n FROM t WHERE name = 'grown'"), { n: 200_000 }, 're-exported')
        } finally {
          again.close()
        }
      } finally {
        copy.close()
      }
    },
  },
]
