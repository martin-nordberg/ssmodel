import { decryptPayload, encryptPayload } from '@/store/actionLog/encryption/crypto.ts'
import type { PayloadCodec } from '@/store/actionLog/encryption/PayloadCodec.ts'

/** The encrypting codec: AES-256-GCM under the file key, with a fresh IV per row (see crypto.ts). */
export class AesGcmCodec implements PayloadCodec {
  /** The file's data key (kept in the store worker; needed to rewrap it when the password changes). */
  readonly key: CryptoKey

  constructor(key: CryptoKey) {
    this.key = key
  }

  async encode(plaintext: string): Promise<{ iv: string; payload: string }> {
    const { iv, encryptedPayload } = await encryptPayload(this.key, plaintext)
    return { iv, payload: encryptedPayload }
  }

  decode(iv: string, payload: string): Promise<string> {
    return decryptPayload(this.key, iv, payload)
  }
}
