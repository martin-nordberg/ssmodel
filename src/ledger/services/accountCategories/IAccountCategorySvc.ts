import type { IAccountCategoryCmdSvc } from '@/ledger/services/accountCategories/IAccountCategoryCmdSvc.ts'
import type { IAccountCategoryQrySvc } from '@/ledger/services/accountCategories/IAccountCategoryQrySvc.ts'

export interface IAccountCategorySvc extends IAccountCategoryQrySvc, IAccountCategoryCmdSvc {}
