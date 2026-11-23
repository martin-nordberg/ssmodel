# Ledger domain

Ported from Checquery (`packages/shared/src/domain`, `util` and `crudServices`, at Checquery commit `2f2b312`)
[NFR-ARCH-11]. The domain modules sit directly under `src/ledger/<area>/`. The CRUD service interfaces are in
`services/`, and their tests are in `test/ledger/`.

Changes from the source:

- Biome style, and imports use `@/ledger/…ts`.
- Changes needed for this repo's stricter TypeScript settings (`noUncheckedIndexedAccess`, `erasableSyntaxOnly`).
- The JSON-schema tests check structure only. Zod 4.6 adds keywords that the exact snapshots didn't expect.

Domain changes made in ProvisionLens:

- Origins are a device/user name. Checquery's IP address is optional (P1.3, FR-LED-4).
- Amounts are integer cents (`core/money.ts`, P1.4, D: OQ-LED-2). `core/CurrencyAmt.ts` is kept only for Checquery's
  old string format. Change-log migration 0004 rewrites stored amounts once.
