# Spec Delta

## Purpose

Tracks the money the user exchanges with friends and family as named people, so that lending, borrowing, card reimbursements and shared expenses are recorded per person with a running "who owes whom" balance instead of disappearing into Unclassified.

## ADDED Requirements

### Requirement: User can create a person from a counterparty
The system SHALL let the user create a named person from any counterparty (a UPI ID, phone-number UPI group or bank-printed name) and SHALL attribute every existing transaction with that counterparty to the new person.

#### Scenario: Create person from a review row
- **WHEN** the user marks the counterparty "Govinda Gadre", which has 9 transactions, as a person named "Govinda"
- **THEN** a person "Govinda" exists and all 9 transactions show "Govinda" as their person

#### Scenario: Duplicate person name
- **WHEN** the user creates a person named "Govinda" while a person with that name (case-insensitive) already exists
- **THEN** the system rejects the request with a message to link the counterparty to the existing person instead

### Requirement: Several counterparties can link to one person
The system SHALL let the user link additional counterparties to an existing person. A counterparty SHALL belong to at most one person.

#### Scenario: Two spellings of the same friend
- **WHEN** the user links counterparty "govindagadre" to the existing person "Govinda"
- **THEN** transactions from both "Govinda Gadre" and "govindagadre" are attributed to "Govinda"

#### Scenario: Counterparty already linked elsewhere
- **WHEN** the user links a counterparty that already belongs to person "Rahul" to person "Govinda"
- **THEN** the system asks for confirmation and, if confirmed, moves the link and the automatically attributed transactions to "Govinda"; transactions the user attributed by hand stay with "Rahul"

### Requirement: New imports are attributed to linked people
When a committed import contains a transaction whose counterparty is linked to a person, the system SHALL attribute that transaction to the person. Attribution SHALL NOT change the transaction's category.

#### Scenario: Next month's statement
- **WHEN** a new statement with 2 UPI credits from a counterparty linked to "Govinda" is committed
- **THEN** both transactions are attributed to "Govinda" and keep the category chosen by the categorization rules

#### Scenario: Re-running categorization
- **WHEN** the user runs "Re-run rules" over all transactions
- **THEN** no transaction loses or changes its person, and no person tag the user set is overwritten

### Requirement: User can tag what a person transaction was
The system SHALL let the user tag a person's transaction with one of these tags: "Loan or repayment", "Paid me back for my card", "Shared expense" (with an expense category), "Gift or family support". Tagging SHALL set the transaction's category as a user decision and mark it reviewed.

#### Scenario: Loan or repayment
- **WHEN** the user tags a ₹5,000 debit to "Tushar" as "Loan or repayment"
- **THEN** the transaction is in the "Personal lending and repayments" category, is no longer flagged for review, and counts as neither income nor spending

#### Scenario: Card reimbursement
- **WHEN** the user tags a ₹29,500 (2,950,000 paise) credit from "Govinda" as "Paid me back for my card"
- **THEN** the transaction is in the "Credit card payments" category and reduces card-bill spending for that period by 2,950,000 paise

#### Scenario: Roommate pays their share
- **WHEN** the user tags a ₹1,200 credit from "Srijan" as "Shared expense" with category "Groceries"
- **THEN** the transaction is in "Groceries" and reduces the period's Groceries spending by 120,000 paise

#### Scenario: Paying my own share
- **WHEN** the user tags a ₹3,500 debit to "Tushar" as "Shared expense" with category "Rent and housing"
- **THEN** the transaction counts as ₹3,500 of Rent and housing spending

#### Scenario: Gift or family support
- **WHEN** the user tags a ₹10,000 debit to "Papa" as "Gift or family support"
- **THEN** the transaction counts as Family support spending; the same tag on a credit puts it in "Other income"

#### Scenario: Tag not valid for direction
- **WHEN** the user tries to tag a debit as "Paid me back for my card"
- **THEN** the system rejects the tag because a reimbursement must be money received

### Requirement: Each person has a running balance
The system SHALL show each person's balance as their opening balance, plus their "Personal lending and repayments" debits, minus their "Personal lending and repayments" credits, in integer paise. A positive balance SHALL read "owes you"; a negative balance SHALL read "you owe".

#### Scenario: Lend and get partly repaid
- **WHEN** "Tushar" has an opening balance of 0, a lending debit of 1,000,000 paise and a lending credit of 400,000 paise
- **THEN** Tushar's balance is +600,000 paise, shown as "Tushar owes you ₹6,000"

#### Scenario: Borrow from a friend
- **WHEN** "Deependra" has a lending credit of 2,430,000 paise and no other lending transactions
- **THEN** the balance is −2,430,000 paise, shown as "You owe Deependra ₹24,300"

#### Scenario: Other tags do not move the balance
- **WHEN** a transaction from "Govinda" is tagged "Paid me back for my card" or "Shared expense"
- **THEN** Govinda's balance is unchanged

#### Scenario: Untagged transactions
- **WHEN** a person has transactions that are still Unclassified
- **THEN** they are excluded from the balance, and the person page states how many transactions and how much money are not yet tagged

### Requirement: Person can carry an opening balance
The system SHALL let the user set an opening balance, with an as-of date, for a person to cover amounts owed before the first imported statement.

#### Scenario: Debt before imports start
- **WHEN** the user sets "Rahul" opening balance to "Rahul owes me ₹10,000" as of 2025-10-01
- **THEN** Rahul's balance starts at +1,000,000 paise and the person page shows the opening balance as the first history line

### Requirement: People page lists balances
The system SHALL provide a People page listing every person with their balance, the total owed to the user, the total the user owes, and the money not yet tagged per person.

#### Scenario: Overview totals
- **WHEN** "Tushar" is at +600,000 paise, "Rahul" is at +1,000,000 paise and "Deependra" is at −2,430,000 paise
- **THEN** the page shows "Owed to you ₹16,000" and "You owe ₹24,300", and lists Deependra, Rahul and Tushar with their balances

### Requirement: Person page shows history and untagged items
The system SHALL provide a page per person showing the balance, every attributed transaction across all accounts in date order with its tag, and the untagged transactions with controls to tag one or many at once.

#### Scenario: Bulk tag
- **WHEN** the user selects 3 untagged credits on "Abhay's" page and tags them "Shared expense" with category "Restaurants and food delivery"
- **THEN** all 3 move to that category, are marked reviewed, and disappear from the untagged list

### Requirement: People changes are audited and deletable
Creating, renaming, merging or deleting a person, linking or unlinking a counterparty, setting an opening balance, and tagging transactions SHALL each write an audit log entry. "Delete everything" SHALL remove all people and links.

#### Scenario: Audit on tag
- **WHEN** the user tags a transaction "Loan or repayment"
- **THEN** an audit entry records the transaction, the previous and new category, and the person

#### Scenario: Deleting a person
- **WHEN** the user deletes person "Rahul"
- **THEN** Rahul's links and opening balance are removed, his transactions keep their categories but no longer have a person, and no transaction is deleted

#### Scenario: Delete everything
- **WHEN** the user confirms "Delete everything" in Settings
- **THEN** no people or counterparty links remain for that user
