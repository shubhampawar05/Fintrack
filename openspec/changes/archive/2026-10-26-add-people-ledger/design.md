# Design

## Context

- Counterparties are already normalized: `extractCounterparty` gives every transaction a `merchantKey` (a phone-number group for phone VPAs, otherwise the VPA or the bank-printed name) and an `isPerson` hint. When no rule matches a person payment, the engine sends it to Unclassified with confidence 0.
- `classify()` in `src/lib/finance/analytics.ts` is the single place the accounting rules live. It already nets credits in an EXPENSE category against that category, and nets CREDIT_CARD_PAYMENT credits against card bills when `ccPaymentsAsExpense` is true. The SETTLEMENT kind ("Personal lending and repayments") exists but nothing reads it except `lendingOut`/`lendingIn` totals.
- `LOCKED_METHODS` (`USER`, `TRANSFER_MATCH`, `REFUND_MATCH`) keeps re-categorization away from user decisions. Bulk categorization (`bulkCategorize`) is already audited.
- Matched own-account transfers are stored as `InternalTransfer` rows. A TRANSFER debit with no confirmed `InternalTransfer` went to an account that is not imported (or not matched yet).

## Goals / Non-Goals

**Goals:**
- Tags are categories. No new accounting kind, so `classify()` and every existing total stay correct without changes.
- A balance is a pure function of tagged transactions plus an opening balance. Nothing is stored that can drift.
- Money flow is an exact partition of debits and credits, checked by a unit-test invariant.

**Non-Goals:**
- No change to how `classify()` computes income or expenses.
- No automatic tagging of person transactions as loans or reimbursements. Attribution to a person is automatic; *what* a payment was stays the user's decision (consistent with the "uncertain data is never guessed" rule).

## Decisions

### 1. A tag maps to an existing category; there is no "flow type" column

| Tag | Direction | Category set (method `USER`) |
|---|---|---|
| Loan or repayment | both | `lending` (SETTLEMENT) |
| Paid me back for my card | credit only | `cc-payment` (CREDIT_CARD_PAYMENT) |
| Shared expense | both | chosen EXPENSE category |
| Gift or family support | debit → `family`; credit → `other-income` | |

The balance only needs direction: lending debits count as +, lending credits as −. Whether a debit was "lending" or "repaying a debt" is just the sign of the balance at that moment, so asking the user to pick one would add work and create disagreements.
*Alternative considered:* a `personFlow` enum (LENT / REPAID / BORROWED / …) on Transaction. Rejected because it duplicates the category, needs its own accounting branch, and the four sub-types are redundant for the balance.

The tag shown in the UI is derived from the category kind (SETTLEMENT → "Loan or repayment", and so on). It is not stored separately.

### 2. Data model

```
Person        id, userId, name (unique per user, case-insensitive via lower(name) index),
              openingBalancePaise BigInt @default(0), openingAsOf Date?, notes?, createdAt
PersonKey     id, userId, personId -> Person (cascade), merchantKey,
              @@unique([userId, merchantKey])
Transaction   + personId String? -> Person (SetNull)
              + personSource PersonSource?   enum PersonSource { AUTO USER }
```

`personSource` makes "hand-attributed stays put" (spec: link moved to another person) and "re-run never changes person" enforceable. `AUTO` rows follow `PersonKey`; `USER` rows are only changed by the user. Attribution is kept separate from the category, so a person can be attached to a transaction that a rule already categorized (e.g. a roommate's rent payment).
*Alternative considered:* storing the person on `CategorizationRule`. Rejected because rules decide categories, and people should not alter rule precedence.

### 3. Attribution in the pipeline

After categorization in the commit path, the pipeline (`src/server/pipeline.ts`) sets `personId`/`personSource=AUTO` for every new transaction whose `merchantKey` has a `PersonKey`. `recategorizeAll` never touches `personId`. Linking a key to a person backfills existing `AUTO`/null rows with that key in one `updateMany`.

### 4. Pure logic in `src/lib/finance`

- `people.ts`: `personBalance(opening, txns)` and `tagToCategoryKey(tag, direction)`, which validates the direction (rejects card reimbursements on debits).
- `money-flow.ts`: `computeMoneyFlow(txns, range, opts, unmatchedTransferIds)` returns out/in buckets keyed by category kind and group. It reuses `classify()` for the two net figures, so Money flow and Spending Analysis cannot disagree.
- The test invariant: for any generated set of transactions, `sum(out buckets) === totalDebits` and `sum(in buckets) === totalCredits`.

Bucket mapping (debits): EXPENSE non-FAMILY → Spent on myself; EXPENSE FAMILY → Family support; CREDIT_CARD_PAYMENT → Card bills; INVESTMENT → Invested; TRANSFER → Own accounts; SETTLEMENT → Lent/repaid; CASH → Cash; UNCLASSIFIED or no category → Not yet classified; INCOME and REFUND → Other. Credits follow the same shape: EXPENSE, CREDIT_CARD_PAYMENT and REFUND credits → "Paid back by people and refunds".

### 5. Server and UI

- `src/server/people.ts`: queries (people with balances, a person's history, top untagged person counterparties).
- `src/server/actions/people.ts`: create, rename, delete, merge, link/unlink a key, set the opening balance, and tag transactions. Each action is audited in the same DB transaction as its write. Tagging reuses the `bulkCategorize` path with `createRules=false`, because one friend's payments vary (loans one week, card money the next) and a rule would mislabel them.
- Pages: `/people`, `/people/[id]`, `/money-flow`, plus a "Make a person" action on the existing counterparty-review card. Nav gains "People" and "Money Flow".
- The unclassified notice reads the existing `Summary.unclassifiedOut`, so it needs no new query.

## Invariants

- **Paise only**: balances, opening balances and buckets are integer paise (BigInt in the DB, converted with `toPaise`). Opening balance input is parsed with the existing rupee → paise parser.
- **Own-account transfers**: never touched. Tags cannot be applied to TRANSFER-category rows (the action rejects them), and Money flow keeps transfers in their own bucket.
- **Immutable raw records**: `description` and `ImportedTransaction` are not written. Only `categoryId`, `categorizationMethod`, `needsReview`, `personId` and `personSource` change.
- **Locked decisions**: tags write method `USER`. Auto attribution only sets `personId`, never the category, so TRANSFER_MATCH/REFUND_MATCH rows keep their category.
- **Idempotent commits**: unaffected. Attribution runs on rows that were actually inserted.
- **Audit**: every people action and tag writes AuditLog. `deleteAllUserData` deletes PersonKey and then Person before deleting transactions.

## Risks / Trade-offs

- [The user tags a friend's UPI as a card reimbursement while card statements are also imported (`ccPaymentsAsExpense=false`)] → the credit then nets against nothing. Money flow still shows it under "Paid back by people", and the person page warns that card reimbursements have no effect while card purchases are imported. Handling this properly belongs to future option 2.
- [Balances start mid-history (statements begin Oct 2025)] → opening balance per person; the People page shows the earliest imported date so the user knows what "as of" means.
- [Phone-group keys can merge two people who share a phone, or split one person across a VPA and a bank-printed name] → explicit link/unlink per key and person merge.
- [Tagging hundreds of rows is tedious] → per-person bulk tagging, sorting people by untagged amount, and the counterparty-review shortcut. There is no auto-tagging, by design.

## Migration Plan

1. Prisma migration `people_ledger`: create `PersonSource` enum, `Person`, `PersonKey`, and the `Transaction.personId` + `personSource` columns with an index on `(userId, personId)`. It is additive; existing rows get null.
2. No backfill: people exist only once the user creates them.
3. Rollback: drop the columns, tables and enum in a down migration. Categories set through tags stay valid on their own (they are ordinary USER categorizations).
