import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fixtureDir, repoRoot } from './helpers.ts'

// Generates the synthetic .checquery fixtures with Checquery's own code, if they aren't there yet.
export default function globalSetup(): void {
  if (existsSync(`${fixtureDir}large.reference.json`)) return
  const run = spawnSync('bun', ['spike/checquery/makeFixture.ts'], { cwd: repoRoot, stdio: 'inherit' })
  if (run.status !== 0) throw new Error('fixture generation failed (is a Checquery checkout at CHECQUERY_DIR?)')
}
