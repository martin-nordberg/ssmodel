import { z } from 'zod'

/** Schema for an IPv4 address. */
export const ipAddressSchema = z
  .string()
  .trim()
  .pipe(z.ipv4({ message: 'IP address must be a valid IPv4 address.' }))
  .brand('IpAddress')

export type IpAddress = z.infer<typeof ipAddressSchema>
