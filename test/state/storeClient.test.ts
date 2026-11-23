import { describe, expect, test } from 'bun:test'
import { StoreClient, StoreError, type StorePort } from '@/state/storeClient.ts'
import type { StoreMessage, StoreNotification } from '@/worker/storeProtocol.ts'

// NFR-ARCH-8: the client side of the protocol, against a stand-in port.

function fakePort() {
  const sent: Record<string, unknown>[] = []
  const port: StorePort = { onmessage: null, postMessage: (m) => sent.push(m as Record<string, unknown>) }
  const reply = (message: StoreMessage) => port.onmessage?.({ data: message } as MessageEvent)
  return { port, sent, reply }
}

describe('StoreClient', () => {
  test('matches results to requests by id, out of order', async () => {
    const { port, sent, reply } = fakePort()
    const client = new StoreClient(port)
    const a = client.query('accounts', 'countAccountsAll')
    const b = client.query('accounts', 'findAccountById', 'acct1' as never)
    expect(sent).toEqual([
      { id: 1, op: 'query', entity: 'accounts', method: 'countAccountsAll', args: [] },
      { id: 2, op: 'query', entity: 'accounts', method: 'findAccountById', args: ['acct1'] },
    ])
    reply({ kind: 'result', id: 2, ok: true, result: null })
    reply({ kind: 'result', id: 1, ok: true, result: 3 })
    expect(await a).toBe(3)
    expect(await b).toBeNull()
  })

  test('turns error responses into StoreError with the code', async () => {
    const { port, reply } = fakePort()
    const client = new StoreClient(port)
    const p = client.request('open', {
      bytes: new Uint8Array(),
      password: 'x',
      deviceName: 'L',
      allowMigration: false,
      source: 'file',
    })
    reply({ kind: 'result', id: 1, ok: false, error: { code: 'wrong-password', message: 'Incorrect password.' } })
    const err = await p.catch((e) => e)
    expect(err).toBeInstanceOf(StoreError)
    expect(err.code).toBe('wrong-password')
  })

  test('delivers notifications to subscribers until they unsubscribe', () => {
    const { port, reply } = fakePort()
    const client = new StoreClient(port)
    const seen: StoreNotification[] = []
    const unsubscribe = client.subscribe((n) => seen.push(n))
    const change: StoreNotification = {
      kind: 'change',
      seq: 1,
      changes: [{ entity: 'accounts', op: 'create', id: 'a' }],
    }
    reply(change)
    unsubscribe()
    reply({ kind: 'session', state: 'closed' })
    expect(seen).toEqual([change])
  })

  test('rejects pending requests when terminated', async () => {
    const { port } = fakePort()
    const client = new StoreClient(port)
    const p = client.request('version', {})
    client.terminate()
    expect((await p.catch((e) => e)).code).toBe('internal')
  })
})
