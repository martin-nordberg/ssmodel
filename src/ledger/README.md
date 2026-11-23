# Ledger domain

Ported from Checquery (`packages/shared/src/domain`, `util` and `crudServices`, at Checquery commit `2f2b312`)
[NFR-ARCH-11]. The domain modules sit directly under `src/ledger/<area>/`. The CRUD service interfaces are in
`services/`, and their tests are in `test/ledger/`.

Changes from the source:

- Biome style, and imports use `@/ledger/…ts`.
- Changes needed for this repo's stricter TypeScript settings (`noUncheckedIndexedAccess`, `erasableSyntaxOnly`).
- The JSON-schema tests check structure only. Zod 4.6 adds keywords that the exact snapshots didn't expect.

Later P1 tasks change the domain itself: integer cents (P1.4) and device-named origins (P1.3).
