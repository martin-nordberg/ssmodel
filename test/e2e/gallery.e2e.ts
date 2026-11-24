import { expect, test } from '@playwright/test'

// FR-UI-27, FR-UI-28, FR-UI-29: the six page templates and the semantic colors render in both themes.

const templates = ['List or tree', 'Register', 'Editor', 'Report', 'Console', 'Dashboard']

for (const theme of ['light', 'dark'] as const) {
  test(`the template gallery renders in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('ssmodel.settings', JSON.stringify({ theme: t })), theme)
    await page.goto('/#/help/gallery')
    await expect(page.getByRole('heading', { name: 'Page templates', level: 2 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark')
    for (const name of templates) await expect(page.getByRole('region', { name: `${name} template` })).toBeVisible()

    // Semantic colors resolve to different values per theme, and favorable/unfavorable text differs.
    const colors = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement)
      return {
        favorable: css.getPropertyValue('--favorable').trim(),
        unfavorable: css.getPropertyValue('--unfavorable').trim(),
      }
    })
    expect(colors.favorable).toBe(theme === 'dark' ? '#5fd3a2' : '#13714d')
    expect(colors.favorable).not.toBe(colors.unfavorable)
    await expect(page.getByText(/^Unfavorable /)).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(255, 138, 128)' : 'rgb(180, 35, 31)',
    )
  })
}
