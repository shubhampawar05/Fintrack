# Proposal

## Why

A brand-new user signs in to an empty dashboard with a single "Add your bank accounts" box and must discover the rest of the setup alone. Steps that strongly affect correctness — confirming which names, phone numbers and UPI IDs are "you" (so own-account transfers are not counted as spending), importing every account, and reviewing flagged rows — are easy to miss, and several pages dead-end with no way to the step that would fill them.

## What Changes

- Add a **setup checklist** on the dashboard that shows the user where they are in setup ("2 of 4 done"). Each step is ticked off from data that already exists (accounts, committed imports, review backlog, own identifiers, Paytm history, budgets/goals) rather than from clicks, with a "Do it" link and a one-line reason why the step matters.
- The checklist shows for a first-time user (replacing today's single empty box), stays visible until required steps are done or the user hides it, and can be reopened later.
- The review step counts as done when fewer than 10% of transactions need review, or when the user marks it done explicitly (the user currently has hundreds of person-to-person payments awaiting decisions; requiring zero would keep setup open indefinitely).
- Add a short **"How Fintrack works" guide** (about four steps) covering what the app does with files, how transfers, card bills and investments are counted, and why rows are flagged for review. It opens automatically on the first visit only and can be reopened from a "Guide" entry in the navigation.
- Replace dead-end **empty states** on every app page with ones that name the missing setup step and link to it; add an empty state to Reports, which has none.
- Store "guide seen", "checklist hidden" and "review marked done" per user in the database (not browser storage) and record changes in the audit log.

### Out of scope

- Spotlight/coach-mark tours that highlight individual UI elements.
- A "try with sample data" mode or loading demo data from the UI (it would mix synthetic rows into real totals; `npm run db:seed -- --demo` remains the developer path).
- Per-bank download walkthroughs with screenshots; steps carry short text hints only.
- Multi-user onboarding, emails or notifications.
- Any change to parsing, categorization, accounting rules or totals.

## Capabilities

### New Capabilities
- `onboarding`: first-run experience — the data-driven setup checklist, its completion rules, hiding/reopening it, and the "How Fintrack works" guide.
- `empty-states`: what each app page shows when it has no data to display, and how it points the user to the setup step that would fill it.

### Modified Capabilities
- None (no capability specs exist yet under `openspec/specs`).

## Impact

- **Database**: one Prisma migration adding three nullable timestamp columns to `UserSettings` (guide seen, checklist hidden, review marked done). Additive and reversible — dropping the columns loses only onboarding UI state; no financial data is touched.
- **Code**: new pure step-evaluation logic in `src/lib/onboarding`; a DB-aware progress query in `src/server`; server actions for dismiss/reopen/mark-done (audited); dashboard page, navigation (new "Guide" entry), and the empty states in Dashboard, Accounts, Import, Transactions, Analysis, Budgets, Goals, Recurring and Reports.
- **Tests**: unit tests for step evaluation, integration test for progress against PostgreSQL, Playwright e2e for the first-run flow.
- **Dependencies**: none new (uses existing shadcn/ui dialog, card and progress components).
