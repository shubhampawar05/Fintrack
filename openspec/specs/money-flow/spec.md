# money-flow Specification

## Purpose

Shows where every rupee went in a period: all money out and all money in across the user's accounts, split into named buckets that add up exactly to the totals, with unclassified money shown openly instead of silently left out.

## Requirements

### Requirement: Money out is split into buckets that add up exactly
For a selected period, the Money flow page SHALL split the sum of all debits into these buckets by category: Spent on myself, Family support, Card bills, Invested, Moved to my own accounts, Lent or repaid to people, Cash withdrawn, Other, and Not yet classified. The bucket amounts SHALL add up exactly to total debits, in paise.

#### Scenario: Buckets sum to total
- **WHEN** a period has debits of 1,000,000 paise in Groceries, 1,000,000 in Family support, 3,000,000 in Credit card payments, 500,000 in Investment contributions, 2,000,000 in own-account transfers, 700,000 in Personal lending, and 1,800,000 Unclassified
- **THEN** the buckets show those amounts (Groceries under Spent on myself) and their sum equals the total debits of 10,000,000 paise

#### Scenario: Debit with no category
- **WHEN** a debit has no category at all
- **THEN** it is counted under Not yet classified

#### Scenario: Debits in income or refund categories
- **WHEN** a debit is in an income category or is a reversed refund
- **THEN** it is counted under Other, so no debit is left out of the total

### Requirement: Money in is split into buckets that add up exactly
For the same period, the page SHALL split the sum of all credits into: Income, Paid back by people and refunds, Borrowed or repaid by people, From my own accounts, Investment withdrawals, Cash deposits, and Not yet classified. The bucket amounts SHALL add up exactly to total credits.

#### Scenario: Card reimbursement is not income
- **WHEN** a period has a 2,950,000 paise credit tagged "Paid me back for my card" and a 15,000,000 paise salary credit
- **THEN** Income is 15,000,000 paise and Paid back by people and refunds includes 2,950,000 paise

### Requirement: Net spending figures account for reimbursements
The page SHALL show "Spent on myself (net)", which is expense debits outside Family support minus the credits that net against them. It SHALL also show "Card bills, net of friends' repayments", which is card-bill debits minus credits in the Credit card payments category. Both figures SHALL use the same accounting rules as Spending Analysis.

#### Scenario: Friend repaid part of a card bill
- **WHEN** a period has card-bill debits of 10,000,000 paise and credits of 4,000,000 paise tagged "Paid me back for my card"
- **THEN** Card bills is shown as 10,000,000 paise gross and 6,000,000 paise net

#### Scenario: Matches Spending Analysis
- **WHEN** the same period is opened on Money flow and on Spending Analysis
- **THEN** Spent on myself (net) plus Family support (net), plus Card bills net when card bills count as spending, equals the Spent figure on Spending Analysis

### Requirement: Not yet classified is shown with a way to fix it
The Not yet classified bucket SHALL always be displayed, even when it is zero. When it is not zero, it SHALL show its share of money out and the top counterparties in it, each linking to the person page if the counterparty is linked to a person, or to their transactions otherwise.

#### Scenario: Large unknown share
- **WHEN** 1,800,000 of 10,000,000 paise of debits are unclassified, and 1,000,000 of those went to "Tushar Sharma"
- **THEN** the bucket reads "18% not yet classified" and lists "Tushar Sharma ₹10,000" with a link

#### Scenario: Everything classified
- **WHEN** no transaction in the period is unclassified
- **THEN** the bucket shows ₹0 and states that every transaction is classified

### Requirement: Transfers to accounts that are not imported are called out
The Moved to my own accounts bucket SHALL show how much of it has no matching credit in an imported account, and SHALL state that this money's final use is unknown until that account's statement is imported.

#### Scenario: Savings account not imported
- **WHEN** 2,000,000 paise moved to own accounts, of which 1,500,000 paise has no matched counterpart transaction
- **THEN** the bucket notes "₹15,000 went to accounts that aren't imported" and links to Import Statements

### Requirement: Buckets link to their transactions
Each bucket SHALL link to the Transactions page filtered to that bucket's transactions for the same period.

#### Scenario: Open a bucket
- **WHEN** the user clicks Lent or repaid to people
- **THEN** Transactions opens filtered to Personal lending debits in the selected period

### Requirement: Spending totals disclose unclassified money
Wherever the Dashboard or Spending Analysis shows the period's expenses, they SHALL also show the period's unclassified debits when they are not zero, stating that these are not counted as spending, with a link to Money flow.

#### Scenario: Dashboard notice
- **WHEN** the dashboard period has 1,040,000 paise of unclassified debits
- **THEN** the Expenses card says "₹10,400 more not yet classified — not counted" with a link to Money flow

#### Scenario: Nothing unclassified
- **WHEN** the period has no unclassified debits
- **THEN** no notice is shown
