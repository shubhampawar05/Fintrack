# onboarding Specification

## Purpose

Guides a new user from an empty installation to trustworthy numbers: a setup checklist whose progress is derived from the user's own data, and a short reopenable explanation of how Fintrack counts money.

## Requirements

### Requirement: Setup steps
The system SHALL define these setup steps, in this order: (1) add bank accounts, (2) import a statement for every account, (3) confirm own identifiers, (4) review flagged transactions — all required; then (5) upload payment-app history and (6) set a budget or goal — both optional. Each step SHALL show a title, a one-line reason it matters, its status, and a link to the page where it is done.

#### Scenario: Steps are listed in order with links
- **WHEN** the user views the setup checklist
- **THEN** the six steps appear in the defined order, required steps before optional ones, each with a reason and a link to its page

#### Scenario: Optional steps are labelled
- **WHEN** the user views the payment-app and budget/goal steps
- **THEN** they are marked optional and do not count toward required progress

### Requirement: Step completion is derived from data
Each step's status SHALL be computed from the user's stored data at the time of viewing, never from clicks on the checklist (except the explicit review override). Completion rules: accounts — at least one non-archived account; statements — every non-archived account has a committed import; identifiers — at least one own name, phone or UPI ID saved; payment-app — at least one uploaded history; plan — at least one budget or goal.

#### Scenario: Accounts step completes when an account exists
- **WHEN** the user has no non-archived bank accounts
- **THEN** the accounts step is incomplete
- **WHEN** the user adds one account
- **THEN** the accounts step is complete on next view without any checklist interaction

#### Scenario: Statements step shows per-account progress
- **WHEN** the user has 3 non-archived accounts and committed imports exist for 2 of them
- **THEN** the statements step is incomplete and shows "2 of 3 accounts imported", naming the account still missing

#### Scenario: Previews and failed imports do not count
- **WHEN** an account's only import is an uncommitted preview, a discarded preview or a failed upload
- **THEN** that account counts as not imported

#### Scenario: Archived accounts are ignored
- **WHEN** an archived account has no imports and every other account has a committed import
- **THEN** the statements step is complete

#### Scenario: Identifiers learned from a statement complete the step
- **WHEN** an import automatically saved the holder's name to own identifiers
- **THEN** the identifiers step is complete and invites the user to check them and add UPI IDs

#### Scenario: Step becomes incomplete again
- **WHEN** the user later adds a new account with no statement
- **THEN** the statements step becomes incomplete again

### Requirement: Review step completion threshold
The review step SHALL be complete when the user has at least one transaction and fewer than 10% of their transactions need review, or when the user has explicitly marked it done. With no transactions it SHALL be incomplete and unmarkable. It SHALL show how many transactions need review.

#### Scenario: Below threshold
- **WHEN** the user has 1,000 transactions and 99 need review
- **THEN** the review step is complete

#### Scenario: At or above threshold
- **WHEN** the user has 1,000 transactions and 100 need review
- **THEN** the review step is incomplete and shows "100 transactions need review"

#### Scenario: User marks review done
- **WHEN** the user has 1,000 transactions, 371 need review, and the user chooses "Mark as done"
- **THEN** the review step is complete, the choice is recorded in the audit log, and the count of transactions needing review is still shown

#### Scenario: Nothing imported yet
- **WHEN** the user has no transactions
- **THEN** the review step is incomplete and offers no "Mark as done" action

### Requirement: Checklist visibility on the dashboard
The dashboard SHALL show the setup checklist when the user has no accounts or no transactions. Otherwise it SHALL show the checklist above the dashboard content while any required step is incomplete, unless the user has hidden it. Hiding SHALL be recorded in the audit log.

#### Scenario: First visit with no data
- **WHEN** a user with no accounts opens the dashboard
- **THEN** the checklist is shown in place of the dashboard content, with "0 of 4 required steps done"

#### Scenario: Partly set up
- **WHEN** a user has transactions but the identifiers step is incomplete and the checklist is not hidden
- **THEN** the dashboard shows its normal content with the checklist above it

#### Scenario: User hides the checklist
- **WHEN** the user hides the checklist while a required step is incomplete
- **THEN** the dashboard no longer shows it, and the hiding is recorded in the audit log

#### Scenario: Hidden but no data
- **WHEN** the user hid the checklist and later deletes all their data so no transactions remain
- **THEN** the dashboard shows the checklist again in place of the dashboard content

#### Scenario: All required steps complete
- **WHEN** all four required steps are complete
- **THEN** the dashboard does not show the checklist

### Requirement: Guide page
The system SHALL provide a Guide page, reachable from the main navigation on desktop and mobile, showing the full checklist (regardless of hidden or complete state) and the "How Fintrack works" explanation. From the Guide page the user SHALL be able to show the checklist on the dashboard again.

#### Scenario: Reopen from navigation
- **WHEN** the user has hidden the checklist and opens Guide from the navigation
- **THEN** the full checklist with current statuses and the explanation are shown

#### Scenario: Show on dashboard again
- **WHEN** the user chooses "Show on dashboard" on the Guide page
- **THEN** the checklist reappears on the dashboard while required steps remain incomplete, and the change is recorded in the audit log

### Requirement: How Fintrack works walkthrough
The system SHALL provide a short walkthrough of at most five steps explaining: that statement files are parsed locally and not kept; that transfers between own accounts, investments, cash withdrawals and lending are not spending; how credit-card bill payments are treated; and why rows are flagged for review. Users SHALL be able to move forward, back and close at any step.

#### Scenario: Navigate the walkthrough
- **WHEN** the user opens the walkthrough
- **THEN** it shows step 1 of N with Next, Back (from step 2) and Close controls, and keyboard focus moves into it

#### Scenario: Content matches accounting rules
- **WHEN** the user reads the walkthrough step about what counts as spending
- **THEN** it states that own-account transfers, investments, cash withdrawals and lending are excluded from spending and income

### Requirement: Walkthrough opens once automatically
The walkthrough SHALL open automatically the first time the user reaches the dashboard after signing in and SHALL NOT open automatically again once it has been closed or completed. Marking it seen SHALL be stored per user on the server, not in browser storage, and recorded in the audit log.

#### Scenario: First visit
- **WHEN** a user who has never seen the walkthrough opens the dashboard
- **THEN** the walkthrough opens

#### Scenario: Closed early
- **WHEN** the user closes the walkthrough at step 2
- **THEN** it is marked seen and does not open automatically on later visits, including from another browser

#### Scenario: Reopened manually
- **WHEN** a user who has seen the walkthrough opens it from the Guide page
- **THEN** it opens at step 1

### Requirement: Onboarding never changes financial data
Onboarding state and actions SHALL NOT create, modify or delete transactions, imports, categories, rules or balances, and SHALL NOT change any totals.

#### Scenario: Hiding and marking done leave totals unchanged
- **WHEN** the user hides the checklist, marks review done and closes the walkthrough
- **THEN** every transaction, its category and needs-review flag, and every dashboard total are identical to before
