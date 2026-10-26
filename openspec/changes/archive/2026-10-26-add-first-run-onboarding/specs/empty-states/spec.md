# Spec Delta

## Purpose

Ensures no app page dead-ends when it has nothing to show: every empty page explains why it is empty and links to the setup step that would fill it.

## ADDED Requirements

### Requirement: Empty pages point to the missing prerequisite
When an app page has no data to display because setup is incomplete, it SHALL show an empty state that names the earliest missing prerequisite and offers one primary action linking to the page where it is done: no accounts leads to Bank Accounts; accounts but no transactions leads to Import Statements.

#### Scenario: No accounts
- **WHEN** a user with no bank accounts opens Transactions, Spending Analysis, Recurring Payments or Reports
- **THEN** the page states that a bank account must be added first and offers an "Add account" action linking to Bank Accounts

#### Scenario: Accounts but nothing imported
- **WHEN** a user with accounts but no transactions opens Transactions, Spending Analysis, Recurring Payments or Reports
- **THEN** the page states that a statement must be imported first and offers an "Import statement" action linking to Import Statements

#### Scenario: Filters, not setup, cause emptiness
- **WHEN** a user with transactions applies Transactions filters that match nothing
- **THEN** the page says no transactions match the filters and does not point to setup steps

### Requirement: Reports page has an empty state
The Reports page SHALL show an empty state, following the prerequisite rule, when the user has no transactions, instead of rendering a report of zeros.

#### Scenario: Reports before any import
- **WHEN** a user with accounts but no transactions opens Reports
- **THEN** an empty state with an "Import statement" action is shown and no report figures are rendered

### Requirement: Accounts page empty state offers the action
The Bank Accounts page, when the user has no accounts, SHALL offer adding an account directly from the empty state and explain that only the bank name, account type and last four digits are needed.

#### Scenario: Add account from the empty state
- **WHEN** a user with no accounts opens Bank Accounts
- **THEN** the empty state offers an "Add account" action that opens the add-account form, and states that passwords, PINs and full account numbers are never needed

### Requirement: Planning pages work before data exists
Budgets and Financial Goals, when empty, SHALL state that they can be set up before any statement is imported and SHALL offer creating the first budget or goal from the empty state.

#### Scenario: Budgets before import
- **WHEN** a user with no transactions and no budgets opens Budgets
- **THEN** the empty state says budgets can be set now and will be compared with spending once statements are imported, and offers creating a budget

#### Scenario: Goals before import
- **WHEN** a user with no goals opens Financial Goals
- **THEN** the empty state offers creating a goal

### Requirement: Empty states link to the guide
Each setup-related empty state SHALL include a secondary link to the Guide page.

#### Scenario: Secondary guide link
- **WHEN** a user with no transactions sees an empty state on Spending Analysis
- **THEN** besides the primary action there is a link to the Guide page
