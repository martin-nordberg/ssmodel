import { ActionLog } from '@/store/actionLog/ActionLog.ts'
import { decryptPayload, encryptPayload, importKey, randomBytes } from '@/store/actionLog/encryption/crypto.ts'
import type { PayloadCodec } from '@/store/actionLog/encryption/PayloadCodec.ts'
import { openBunDriver } from '@/store/driver/bunSqlite.ts'

// Test helpers (Checquery's inMemory.ts, moved out of src/ because storage modules may not import a driver).

/** An AES-GCM codec under a random key, usable synchronously (the key is imported on first use). */
export function testAesCodec(raw: Uint8Array<ArrayBuffer> = randomBytes(32)): PayloadCodec {
  const key = importKey(raw)
  return {
    encode: async (plaintext) => {
      const { iv, encryptedPayload } = await encryptPayload(await key, plaintext)
      return { iv, payload: encryptedPayload }
    },
    decode: async (iv, payload) => decryptPayload(await key, iv, payload),
  }
}

/** A working ActionLog on an in-memory database, encrypted under a random key unless a codec is given. */
export function createInMemoryActionLog(opts?: { codec?: PayloadCodec; nodeId?: string }): ActionLog {
  return new ActionLog(openBunDriver(), opts?.codec ?? testAesCodec(), opts?.nodeId ?? 'ABC')
}

/** Collects an async iterator into an array. */
export async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const x of it) out.push(x)
  return out
}
