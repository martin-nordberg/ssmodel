import { z } from 'zod'

/** Schema for a Checquery name. */
export const nameMaxLength = 200

export const nameRegex = /^[^\r\n]*$/

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name must not be empty.')
  .max(nameMaxLength, `Name can be at most ${nameMaxLength} characters.`)
  .regex(nameRegex, 'Name must not cross multiple lines.')
  .brand('NameStr')

export type NameStr = z.infer<typeof nameSchema>
