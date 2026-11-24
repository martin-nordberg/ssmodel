import type { Page } from '@playwright/test'

/** Labels inside `root` with no tooltip trigger [FR-UI-37]. */
export function untippedLabels(page: Page, root = 'body'): Promise<string[]> {
  return page
    .locator(root)
    .evaluate((el) =>
      [...el.querySelectorAll('label')]
        .filter((l) => l.getAttribute('data-slot') !== 'tooltip-trigger' && !l.closest('[data-slot="tooltip-trigger"]'))
        .map((l) => l.textContent?.trim() ?? ''),
    )
}
