import { z } from 'zod'

export const descriptionMaxLength = 200

export const descriptionRegex = /^[^\r\n]*$/

/** Zod schema for description validation. */
export const descriptionSchema = z
  .string()
  .trim()
  .max(descriptionMaxLength, `Description can be at most ${descriptionMaxLength} characters.`)
  .regex(descriptionRegex, 'Description must not cross multiple lines.')
  .brand('DescriptionStr')

export type DescriptionStr = z.infer<typeof descriptionSchema>
