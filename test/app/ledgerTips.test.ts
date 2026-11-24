import { expect, test } from 'bun:test'
import { LEDGER_TIPS } from '@/app/ledger/ledgerTips.ts'

// FR-UI-37: every ledger tooltip is 5–40 words.
test('ledger tooltips are 5–40 words', () => {
  for (const [key, tip] of Object.entries(LEDGER_TIPS)) {
    const words = tip.split(/\s+/).length
    expect([key, words >= 5 && words <= 40]).toEqual([key, true])
  }
})
