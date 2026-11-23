/**
 * How an action's plaintext JSON payload becomes the actions table's iv/encrypted_payload columns, and back. The
 * ActionLog never encrypts anything itself; swapping AesGcmCodec for PlaintextCodec is the whole difference between
 * an encrypted and an unencrypted file. Asynchronous, because Web Crypto is.
 */
export interface PayloadCodec {
  encode(plaintext: string): Promise<{ iv: string; payload: string }>
  decode(iv: string, payload: string): Promise<string>
}
