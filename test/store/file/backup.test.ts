import { describe, expect, test } from 'bun:test'
import { folderBackupName, folderBackupsToPrune } from '@/store/file/backup.ts'

// FR-STO-6, D: OQ-STO-4: a dated copy a day in the backup folder, keeping 30 days plus one per earlier month.

describe('backup folder retention', () => {
  const today = new Date(2026, 10, 23) // 23 Nov 2026, local time

  test('names copies by file and local date', () => {
    expect(folderBackupName('Household.plens', today)).toBe('Household 2026-11-23.plens')
  })

  test('keeps the last 30 days and the newest copy of each earlier month', () => {
    const names = [
      'Household 2026-11-23.plens',
      'Household 2026-10-25.plens', // day 30 counting today: kept
      'Household 2026-10-24.plens', // day 31: the newest of October before the window, kept
      'Household 2026-10-02.plens',
      'Household 2026-09-30.plens',
      'Household 2026-09-01.plens',
      'Household 2025-12-31.plens',
      'Household 2025-12-01.plens',
    ]
    expect(folderBackupsToPrune(names, 'Household.plens', today).sort()).toEqual([
      'Household 2025-12-01.plens',
      'Household 2026-09-01.plens',
      'Household 2026-10-02.plens',
    ])
  })

  test("never touches other files or other files' backups", () => {
    const names = ['Other 2020-01-01.plens', 'Other 2020-01-02.plens', 'notes.txt', 'Household 2020-01-01.plens.bak']
    expect(folderBackupsToPrune(names, 'Household.plens', today)).toEqual([])
    expect(
      folderBackupsToPrune(['House (1) 2020-01-01.plens', 'House (1) 2020-01-02.plens'], 'House (1).plens', today),
    ).toEqual(['House (1) 2020-01-01.plens'])
  })
})
