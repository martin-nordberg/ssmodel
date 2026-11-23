import { describe, expect, it } from 'bun:test'
import { ipAddressSchema } from '@/ledger/core/IpAddress.ts'

describe('ipAddressSchema', () => {
  describe('valid IPv4 addresses', () => {
    it('accepts a typical address', () => {
      const result = ipAddressSchema.parse('192.168.1.1')
      expect(result as string).toBe('192.168.1.1')
    })

    it('accepts the loopback address', () => {
      const result = ipAddressSchema.parse('127.0.0.1')
      expect(result as string).toBe('127.0.0.1')
    })

    it('accepts an address with all-zero octets', () => {
      const result = ipAddressSchema.parse('0.0.0.0')
      expect(result as string).toBe('0.0.0.0')
    })

    it('accepts an address with all-255 octets', () => {
      const result = ipAddressSchema.parse('255.255.255.255')
      expect(result as string).toBe('255.255.255.255')
    })

    it('trims surrounding whitespace', () => {
      const result = ipAddressSchema.parse('  192.168.1.1  ')
      expect(result as string).toBe('192.168.1.1')
    })
  })

  describe('invalid IP addresses', () => {
    it('rejects an octet greater than 255', () => {
      expect(() => ipAddressSchema.parse('256.1.1.1')).toThrow()
    })

    it('rejects too few octets', () => {
      expect(() => ipAddressSchema.parse('192.168.1')).toThrow()
    })

    it('rejects too many octets', () => {
      expect(() => ipAddressSchema.parse('192.168.1.1.1')).toThrow()
    })

    it('rejects a non-numeric octet', () => {
      expect(() => ipAddressSchema.parse('192.168.1.abc')).toThrow()
    })

    it('rejects an empty string', () => {
      expect(() => ipAddressSchema.parse('')).toThrow()
    })

    it('rejects an IPv6 address', () => {
      expect(() => ipAddressSchema.parse('::1')).toThrow()
    })

    it('rejects a hostname', () => {
      expect(() => ipAddressSchema.parse('localhost')).toThrow()
    })
  })
})
