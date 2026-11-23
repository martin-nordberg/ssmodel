import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

export const repoRoot = new URL('..', import.meta.url).pathname
const resultsDir = new URL('./results/', import.meta.url).pathname
export const fixtureDir = new URL('./.out/', import.meta.url).pathname

/** Password for the real file, from the environment only; tests that need it skip without it. */
export const realPassword = process.env.SPIKE_CHECQUERY_PASSWORD

export interface FixtureReference {
  password: string
  actions: number
  plaintexts: Record<string, string>
}

export function readReference(name: string): FixtureReference {
  return JSON.parse(readFileSync(`${fixtureDir}${name}.reference.json`, 'utf8'))
}

/** The real Checquery file, if present locally (never committed; see CLAUDE.md on private/). */
export const realFile = process.env.SPIKE_CHECQUERY_FILE ?? `${repoRoot}private/Nordbergs.checquery`
export const hasRealFile = existsSync(realFile)

/** Opens the spike page and waits for SQLite to load. */
export async function openSpike(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByText(/SQLite .* ready/).waitFor()
}

/** Serves a local file to the page at `url`, so large inputs needn't pass through page.evaluate arguments. */
export async function serveFile(page: Page, url: string, path: string): Promise<void> {
  const body = readFileSync(path)
  await page.route(`**${url}`, (route) => route.fulfill({ body, contentType: 'application/octet-stream' }))
}

/** Saves a measurement for docs/benchmarks.md. Results never include amounts from real data. */
export function record(name: string, data: unknown): void {
  mkdirSync(resultsDir, { recursive: true })
  writeFileSync(`${resultsDir}${name}.json`, `${JSON.stringify(data, null, 2)}\n`)
}

export const ms = (n: number) => `${n.toFixed(1)} ms`
