import type { Page } from '@playwright/test'

/** Opens a page from its section tab's menu [FR-UI-20], or the section's main page when no page is named. */
export async function openPage(page: Page, section: string, pageLabel?: string): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Sections' })
  if (pageLabel === undefined) {
    await nav.getByRole('link', { name: section, exact: true }).click()
    return
  }
  await nav.getByRole('button', { name: `${section} pages` }).click()
  await page.getByRole('menuitem', { name: pageLabel, exact: true }).click()
}
