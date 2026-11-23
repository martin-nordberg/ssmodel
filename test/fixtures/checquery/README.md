# Checquery fixtures

Synthetic encrypted `.checquery` files written by Checquery's own server code, with no real household data. They
let the tests check that ProvisionLens reads Checquery's format.

- `small.checquery`: 78 actions (categories, accounts, a vendor, four months of transactions, patches, deletes,
  an account patch and delete, and a balance assertion). Its password is `spike-fixture-password`.
- `small.reference.json`: the password, the action count, and every payload as decrypted by Checquery's
  `node:crypto` code, keyed by action ID.

To regenerate them (needs a Checquery checkout at `../checquery` or `CHECQUERY_DIR`), run
`bun spike/checquery/makeFixture.ts` and copy `spike/.out/small.*` here. The IDs and timestamps change on every run.
