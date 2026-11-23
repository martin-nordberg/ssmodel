import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { installFsaMock } from './fsaMock.ts'

// Installable, offline-capable app [NFR-ARCH-7, FR-FILE-9].

const full = readFileSync(new URL('../fixtures/full.yaml', import.meta.url), 'utf8').replace(
  'paths: 5000',
  'paths: 600',
)

test('manifest is linked and installable', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/', short_name: 'SS Model' })
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)
  expect(sizes).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']))
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true)
  expect(manifest.file_handlers[0].accept['application/yaml']).toContain('.yaml')
  expect(manifest.file_handlers[1].accept['application/x-provisionlens']).toEqual(['.plens'])
})

// The store worker's SQLite build must be precached, or .plens files can't open offline [NFR-ARCH-7].
test('the service worker precaches SQLite WASM', async ({ request }) => {
  const sw = await (await request.get('/sw.js')).text()
  expect(sw).toMatch(/assets\/sqlite3-[\w-]+\.wasm/)
})

test('runs offline once loaded', async ({ page, context }) => {
  await installFsaMock(page, { 'full.yaml': full })
  await page.goto('/?poolSize=2')
  // The first load installs the service worker; it controls the page from the next navigation.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: /Social Security Claiming Model/ })).toBeVisible()
  // Opening a household and running the Monte Carlo needs the engine worker chunk, which must come from the cache.
  await page.getByRole('button', { name: 'Open…' }).click()
  await page.getByRole('tab', { name: 'Console' }).click()
  await expect(page.getByTestId('recommendation')).toContainText('Claim at', { timeout: 30_000 })
})
