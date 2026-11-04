import { Document, isMap, isScalar, isSeq, LineCounter, type Node, parseDocument } from 'yaml'
import type { ZodError } from 'zod'
import { migrate } from './migrations.ts'
import { CURRENT_SCHEMA_VERSION, HouseholdFile } from './model.ts'

export type FileError = { path: string; line?: number; message: string }

export type ParseResult =
  | { ok: true; value: HouseholdFile; doc: Document }
  | { ok: false; errors: FileError[]; doc?: Document }

/** Parse, migrate and validate a household YAML file [FR-FILE-2..4]. */
export function parseHouseholdYaml(text: string): ParseResult {
  const lineCounter = new LineCounter()
  const doc = parseDocument(text, { lineCounter, prettyErrors: false })
  const lineOf = (offset: number | undefined) => (offset === undefined ? undefined : lineCounter.linePos(offset).line)

  if (doc.errors.length > 0) {
    return {
      ok: false,
      errors: doc.errors.map((e) => ({ path: '', line: lineOf(e.pos[0]), message: e.message })),
    }
  }
  const raw: unknown = doc.toJS()
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, errors: [{ path: '', message: 'file is empty or not a mapping' }], doc }
  }
  const version = (raw as Record<string, unknown>).schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { ok: false, errors: [{ path: 'schemaVersion', message: 'missing or invalid schemaVersion' }], doc }
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        {
          path: 'schemaVersion',
          message: `file uses schema version ${version}, but this app supports up to ${CURRENT_SCHEMA_VERSION}; update the app`,
        },
      ],
      doc,
    }
  }
  const migrated = migrate(raw as Record<string, unknown>, version)
  const parsed = HouseholdFile.safeParse(migrated)
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error, doc, lineOf), doc }
  }
  // A migrated file no longer matches its original document; start a fresh one so comments are not misplaced.
  return { ok: true, value: parsed.data, doc: version === CURRENT_SCHEMA_VERSION ? doc : new Document(parsed.data) }
}

function zodErrors(error: ZodError, doc: Document, lineOf: (o: number | undefined) => number | undefined) {
  return error.issues.map((issue) => {
    const path = issue.path.map(String)
    // Walk up until a node exists so missing keys report the line of their parent.
    let line: number | undefined
    for (let n = path.length; n >= 0 && line === undefined; n--) {
      const node = doc.getIn(path.slice(0, n), true) as Node | undefined
      line = lineOf(node?.range?.[0])
    }
    return { path: formatPath(issue.path), line, message: issue.message }
  })
}

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>(
    (acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)),
    '',
  )
}

/**
 * Serialize a household file. When the document it was loaded from is given, values are merged into that document
 * so comments and key order on unchanged parts survive the round trip.
 */
export function serializeHouseholdYaml(value: HouseholdFile, doc?: Document): string {
  const target = doc ? doc.clone() : new Document()
  if (!doc) {
    target.contents = target.createNode(value) as typeof target.contents
  } else {
    mergeInto(target, [], value)
  }
  return target.toString({ lineWidth: 0 })
}

type Path = (string | number)[]

function mergeInto(doc: Document, path: Path, value: unknown): void {
  const node = path.length === 0 ? doc.contents : doc.getIn(path, true)
  if (Array.isArray(value)) {
    if (isSeq(node) && node.items.length === value.length) {
      for (const [i, v] of value.entries()) mergeInto(doc, [...path, i], v)
    } else {
      setNode(doc, path, value)
    }
    return
  }
  if (value !== null && typeof value === 'object') {
    if (!isMap(node)) {
      setNode(doc, path, value)
      return
    }
    const obj = value as Record<string, unknown>
    for (const pair of [...node.items]) {
      const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key)
      if (!(key in obj) || obj[key] === undefined) doc.deleteIn([...path, key])
    }
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue
      if (node.has(k)) mergeInto(doc, [...path, k], v)
      else doc.setIn([...path, k], doc.createNode(v))
    }
    return
  }
  if (isScalar(node) && node.value === value) return
  setNode(doc, path, value)
}

function setNode(doc: Document, path: Path, value: unknown) {
  if (path.length === 0) doc.contents = doc.createNode(value) as typeof doc.contents
  else doc.setIn(path, doc.createNode(value))
}
