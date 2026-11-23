import { z } from 'zod'

export type ActionType =
  | 'create-account'
  | 'update-account'
  | 'delete-account'
  | 'create-account-category'
  | 'update-account-category'
  | 'delete-account-category'
  | 'create-vendor'
  | 'update-vendor'
  | 'delete-vendor'
  | 'create-transaction'
  | 'update-transaction'
  | 'delete-transaction'
  | 'create-balance-assertion'
  | 'update-balance-assertion'
  | 'delete-balance-assertion'
  | 'create-origin'

export const ACTION_TYPES: readonly ActionType[] = [
  'create-account',
  'update-account',
  'delete-account',
  'create-account-category',
  'update-account-category',
  'delete-account-category',
  'create-vendor',
  'update-vendor',
  'delete-vendor',
  'create-transaction',
  'update-transaction',
  'delete-transaction',
  'create-balance-assertion',
  'update-balance-assertion',
  'delete-balance-assertion',
  'create-origin',
]

/** Schema for a Checquery action type. */
export const actionTypeSchema = z.enum(ACTION_TYPES as [ActionType, ...ActionType[]])
