# Checquery fixtures

Synthetic encrypted `.checquery` files written by Checquery's own server code, with no real household data. They
let the tests check that ProvisionLens reads Checquery's format.

- `small.checquery`: 78 actions (categories, accounts, a vendor, four months of transactions, patches, deletes,
  an account patch and delete, and a balance assertion). Its password is `spike-fixture-password`.
- `small.reference.json`: the password, the action count, and every payload as decrypted by Checquery's
  `node:crypto` code, keyed by action ID.
- `small.balances.json`: Checquery's accounts, categories, per-account balances (as of dates and for periods) and
  balance-sheet net worth for `small.checquery`, from `bun spike/checquery/balances.ts test/fixtures/checquery/small.checquery spike-fixture-password test/fixtures/checquery/small.balances.json`.

To regenerate them (needs a Checquery checkout at `../checquery` or `CHECQUERY_DIR`), run
`bun spike/checquery/makeFixture.ts`, copy `spike/.out/small.*` here, then regenerate `small.balances.json`. The IDs and timestamps change on every run.
