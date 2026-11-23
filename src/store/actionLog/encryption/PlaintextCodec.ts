import type { PayloadCodec } from '@/store/actionLog/encryption/PayloadCodec.ts'

/** The no-encryption codec: stores the JSON payload as is. `iv` is always empty. */
export class PlaintextCodec implements PayloadCodec {
  async encode(plaintext: string): Promise<{ iv: string; payload: string }> {
    return { iv: '', payload: plaintext }
  }

  async decode(_iv: string, payload: string): Promise<string> {
    return payload
  }
}
