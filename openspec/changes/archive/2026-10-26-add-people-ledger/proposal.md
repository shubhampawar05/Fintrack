# Proposal

## Why

Fintrack cannot answer "where did my money go?" for a user whose money is mixed with friends' money. On the user's Federal account (May–Oct 2026), only ~11% of money out lands in a visible spending category. Payments to and from people (₹1.04L out, ₹4.2L in) default to Unclassified, which counts as neither income nor spending, so they vanish from every total without warning. Credit-card bills (₹3.05L) count in full as spending even when friends used the card and paid the user back by UPI. Nothing tracks who owes whom after lending or borrowing, and no view accounts for every rupee that left.

## What Changes

- Add **people**: the user can turn a counterparty into a named person and link several UPI IDs or bank names to them (e.g. "Govinda Gadre" and "govindagadre"). New imports from a linked counterparty are attributed to that person automatically.
- Add a **per-person running balance** ("Govinda owes you ₹12,000" / "You owe Tushar ₹3,000"). It is computed from that person's lending transactions: money the user sends counts as +, money they send counts as −. Lending, repaying, borrowing and getting repaid are all covered without the user picking a sub-type. An optional opening balance covers debts that existed before the first imported statement.
- Add **quick tagging** of each person's transactions as one of: loan or repayment, "paid me back for my card", "paid me back for a shared expense" (with a category), "my share of a shared expense" (with a category), or "gift / family". Each tag maps to an existing category kind. A friend reimbursing a card purchase becomes a credit in "Credit card payments", which existing analytics already net against card bills. A roommate's share becomes a credit in the expense category, which existing analytics already net against that category.
- Add a **People page** (list with balances, total owed to me and total I owe) and a **person page** (balance, history and untagged transactions to tag).
- Add a **Money flow page** that splits all money out and all money in for a period into named buckets that add up exactly to the totals: spent on myself, family support, card bills (gross and net of friend reimbursements), invested, moved to own accounts, lent or repaid to friends, cash, and **not yet classified**, which is shown openly with a link to tag it.
- Show the unclassified amount next to the Expenses figure on the Dashboard and Spending Analysis, so "excluded" is never silent.
- Include people in "Delete everything" and record every people/ledger change in the audit log.

### Out of scope

- Importing credit-card statements and tagging individual card purchases as "mine" or "for a friend" (future option 2). Card bills stay one unitemized amount, net of reimbursements the user tags.
- Ledger entries with no bank transaction (e.g. "Rahul used my card for ₹5,000" recorded by hand). The opening balance is the only non-transaction entry.
- Splitting one bank transaction across several people or categories.
- Reminders, settle-up requests, or sharing balances with friends.
- Re-importing the user's other accounts (Kotak Salary, Kotak savings): this is a data step the user does, not a code change. The Money flow page notes when own-account transfers go to accounts that are not imported.

## Capabilities

### New Capabilities
- `people-ledger`: named people, linking counterparties to them, attributing transactions, tagging person transactions, and per-person running balances with an opening balance.
- `money-flow`: a period view that accounts for 100% of money in and out in named buckets, including "not yet classified", and the unclassified notice on spending totals.

### Modified Capabilities
- `empty-states`: the prerequisite empty-state rule extends to the new People and Money flow pages.

## Impact

- **Database**: one Prisma migration adding a `Person` table, a `PersonKey` table (counterparty key → person, unique per user), an `openingBalancePaise` BigInt column on `Person` and a nullable `Transaction.personId` (FK, `ON DELETE SET NULL`). It is additive and reversible: dropping the tables and column loses only person attribution and opening balances. Categories, amounts and raw records are untouched.
- **Code**: pure ledger and money-flow logic in `src/lib/finance`; person services and audited server actions in `src/server`; person attribution in the import pipeline (`src/server/pipeline.ts`); new `/people`, `/people/[id]` and `/money-flow` pages and nav entries; an unclassified notice on Dashboard and Analysis; `deleteAllUserData` extended.
- **Tests**: unit tests for balance and bucket logic, integration tests for attribution, tagging and deletion, an e2e test for the tag → balance → money-flow flow.
- **Dependencies**: none new.
