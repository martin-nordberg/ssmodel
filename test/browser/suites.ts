// Message types shared by the harness page and its worker.

export interface CaseResult {
  name: string
  ok: boolean
  error?: string
}

export interface SuiteRequest {
  id: number
  suite: string
  args: unknown[]
}

export type SuiteResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }
