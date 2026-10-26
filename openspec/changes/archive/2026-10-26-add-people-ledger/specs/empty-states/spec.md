# Spec Delta

## MODIFIED Requirements

### Requirement: Empty pages point to the missing prerequisite
When an app page has no data to display because setup is incomplete, it SHALL show an empty state that names the earliest missing prerequisite and offers one primary action linking to the page where it is done: no accounts leads to Bank Accounts; accounts but no transactions leads to Import Statements.

#### Scenario: No accounts
- **WHEN** a user with no bank accounts opens Transactions, Spending Analysis, Money flow, People, Recurring Payments or Reports
- **THEN** the page states that a bank account must be added first and offers an "Add account" action linking to Bank Accounts

#### Scenario: Accounts but nothing imported
- **WHEN** a user with accounts but no transactions opens Transactions, Spending Analysis, Money flow, People, Recurring Payments or Reports
- **THEN** the page states that a statement must be imported first and offers an "Import statement" action linking to Import Statements

#### Scenario: Filters, not setup, cause emptiness
- **WHEN** a user with transactions applies Transactions filters that match nothing
- **THEN** the page says no transactions match the filters and does not point to setup steps

## ADDED Requirements

### Requirement: People page explains how to add the first person
When the user has transactions but no people, the People page SHALL explain that people are created from person-to-person payments and SHALL list the counterparties with the most untagged person payments, each with an action to create a person.

#### Scenario: Transactions but no people
- **WHEN** a user with imported transactions and no people opens People
- **THEN** the page lists the top untagged person counterparties, such as "Tushar Sharma · 25 transactions", each with a "Make a person" action
