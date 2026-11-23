import { expect, test } from '@playwright/test'
import {
  fixtureDir,
  hasRealFile,
  ms,
  openSpike,
  readReference,
  realFile,
  realPassword,
  record,
  serveFile,
} from './helpers.ts'

// P0.2: browser crypto. Payloads written by Checquery's node:crypto code decrypt identically with noble scrypt
// and Web Crypto AES-GCM [FR-STO-5]. Target: key derivation ≤ 2 s.

for (const name of ['small', 'large']) {
  test(`synthetic ${name} fixture decrypts identically to Checquery`, async ({ page }) => {
    const reference = readReference(name)
    await serveFile(page, `/fixtures/${name}.checquery`, `${fixtureDir}${name}.checquery`)
    await openSpike(page)
    const result = await page.evaluate(
      async ({ name, password }) => {
        const bytes = await window.spike.fetchBytes(`/fixtures/${name}.checquery`)
        return window.spike.call('decryptFile', bytes, password, true)
      },
      { name, password: reference.password },
    )
    expect(result.passwordOk).toBe(true)
    expect(result.actions).toBe(reference.actions)
    expect(result.plaintexts).toEqual(reference.plaintexts)
    const t = result.timings
    console.log(
      `${name}: ${result.actions} actions; open ${ms(t.openMs)}, key ${ms(t.keyMs)}, decrypt ${ms(t.decryptMs)}`,
    )
    record(`p0.2-${name}`, { actions: result.actions, timings: t })
  })
}

test('a wrong password is rejected', async ({ page }) => {
  await serveFile(page, '/fixtures/small.checquery', `${fixtureDir}small.checquery`)
  await openSpike(page)
  const result = await page.evaluate(async () => {
    const bytes = await window.spike.fetchBytes('/fixtures/small.checquery')
    return window.spike.call('decryptFile', bytes, 'not the password', false)
  })
  expect(result.passwordOk).toBe(false)
})

test('real Checquery file decrypts', async ({ page }) => {
  test.skip(!hasRealFile || !realPassword, 'needs the real file and SPIKE_CHECQUERY_PASSWORD')
  await serveFile(page, '/fixtures/real.checquery', realFile)
  await openSpike(page)
  const result = await page.evaluate(async (password) => {
    const bytes = await window.spike.fetchBytes('/fixtures/real.checquery')
    return window.spike.call('decryptFile', bytes, password, false)
  }, realPassword as string)
  expect(result.passwordOk, 'password accepted').toBe(true)
  expect(result.actions).toBeGreaterThan(0)
  const t = result.timings
  console.log(`real: ${result.actions} actions; open ${ms(t.openMs)}, key ${ms(t.keyMs)}, decrypt ${ms(t.decryptMs)}`)
  record('p0.2-real', { actions: result.actions, timings: t })
})
