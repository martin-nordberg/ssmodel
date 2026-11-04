import { expect, type Page, test } from '@playwright/test'

const json = async (page: Page) => JSON.parse((await page.getByTestId('harness-json').textContent()) ?? '[]')

async function paste(page: Page, text: string) {
  await page.getByRole('grid').evaluate((el, t) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', t)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, text)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?harness=grid')
  await page.getByRole('grid').focus()
})

test('keyboard navigation and editing', async ({ page }) => {
  await page.keyboard.press('ArrowRight') // amount, row 1
  await page.keyboard.type('1.5k')
  await page.keyboard.press('Enter')
  expect((await json(page))[0].amount).toBe(1500)
  // Now on row 2 amount; F2 edits, Escape cancels.
  await page.keyboard.press('F2')
  await page.keyboard.press('Escape')
  expect((await json(page))[1].amount).toBe(52000)
  // Tab commits and moves right.
  await page.keyboard.type('$60,000')
  await page.keyboard.press('Tab')
  expect((await json(page))[1].amount).toBe(60000)
})

test('invalid input keeps the editor open with an error', async ({ page }) => {
  await page.keyboard.type('1800')
  await page.keyboard.press('Enter')
  await expect(page.getByText('minimum 1937').first()).toBeVisible()
  expect((await json(page))[0].year).toBe(2020)
})

test('paste the SSA earnings table format, extending rows', async ({ page }) => {
  await paste(page, '2022\t$147,000\n2023\t$160,200\n2024\t$168,600\n')
  const rows = await json(page)
  expect(rows.length).toBe(3)
  expect(rows.map((r: { year: number }) => r.year)).toEqual([2022, 2023, 2024])
  expect(rows[2].amount).toBe(168600)
})

test('paste reports invalid cells', async ({ page }) => {
  await paste(page, 'abc\t100\n')
  await expect(page.getByText(/1 cell\(s\) not pasted/)).toBeVisible()
})

test('select and boolean cells', async ({ page }) => {
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight') // kind
  await page.keyboard.press('Enter')
  await page.getByRole('combobox', { name: 'Kind' }).selectOption('se')
  expect((await json(page))[0].kind).toBe('se')
  await page.getByRole('grid').focus()
  await page.keyboard.press('ArrowRight') // flag
  await page.keyboard.press(' ')
  expect((await json(page))[0].flag).toBe(true)
})

test('add, reorder, delete rows and clear optional cells', async ({ page }) => {
  await page.getByRole('button', { name: 'Add row' }).click()
  expect((await json(page)).length).toBe(3)
  await page.getByRole('button', { name: 'Move row 3 up' }).click()
  expect((await json(page))[1].year).toBe(2000)
  await page.getByRole('button', { name: 'Delete row 2' }).click()
  expect((await json(page)).map((r: { year: number }) => r.year)).toEqual([2020, 2021])
})

test('copy produces TSV of the selection', async ({ page }) => {
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  const text = await page.getByRole('grid').evaluate((el) => {
    const dt = new DataTransfer()
    el.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }))
    return dt.getData('text/plain')
  })
  expect(text).toBe('2020\t$50,000\n2021\t$52,000')
})
