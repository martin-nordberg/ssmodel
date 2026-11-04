import { expect, test } from '@playwright/test'

// NFR-SIM-1 measurement in Chromium. Not a pass/fail gate on speed (CI machines vary); it records the timing.
test('Monte Carlo timing in the browser pool', async ({ page }) => {
  test.setTimeout(120_000)
  const paths = Number(process.env.PERF_PATHS ?? 1000)
  const workers = process.env.PERF_WORKERS ? `&workers=${process.env.PERF_WORKERS}` : ''
  await page.goto(`/?harness=mc&paths=${paths}${workers}`)
  const out = page.getByTestId('mc-result')
  await expect(out).not.toHaveText('running', { timeout: 110_000 })
  const r = JSON.parse((await out.textContent()) ?? '{}')
  console.log('MC timing', r)
  expect(r.paths).toBe(paths)
})
