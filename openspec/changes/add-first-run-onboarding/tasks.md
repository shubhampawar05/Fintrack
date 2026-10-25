# Tasks

## 1. Onboarding state in the database

- [ ] 1.1 Add nullable `onboardingGuideSeenAt`, `onboardingChecklistHiddenAt`, `onboardingReviewDoneAt` (`DateTime?`) to `UserSettings` in `prisma/schema.prisma` and create migration `onboarding_state`; verify `npx prisma migrate dev` applies it and existing `UserSettings` rows read back with `NULL` in all three columns

## 2. Step rules (pure logic)

- [ ] 2.1 Create `src/lib/onboarding/steps.ts` with the six step definitions (id, title, reason, href, required flag) and the "How Fintrack works" walkthrough content (at most five steps); verify it imports nothing from Prisma or Next.js (`grep` shows no `@prisma`/`next` imports)
- [ ] 2.2 Implement `evaluateSetup(facts)` returning ordered steps with `done`/`detail`, `requiredDone`/`requiredTotal`, `allRequiredDone` and `nextPrerequisite`, using integer arithmetic for the 10% review rule; verify with unit tests in `tests/unit/onboarding.test.ts` covering every onboarding-spec scenario for step completion: no accounts, "2 of 3 accounts imported" naming the missing account, previews not counting (fed as zero committed), archived accounts ignored, identifiers learned, step regressing after a new account, review 99/1000 done, 100/1000 not done, marked done with 371/1000, zero transactions not done, optional steps excluded from required progress
- [ ] 2.3 Add a unit test asserting the walkthrough's spending step mentions own-account transfers, investments, cash withdrawals and lending, and that the walkthrough has between 1 and 5 steps; verify `npx vitest run tests/unit/onboarding.test.ts` passes

## 3. Server query and actions

- [ ] 3.1 Implement `getSetupProgress(userId)` in `src/server/onboarding.ts` (parallel counts: non-archived accounts and which have a COMMITTED import, transactions, needs-review, payment-app imports, budgets, goals, own identifiers, plus the three settings timestamps) feeding `evaluateSetup`; verify with an integration test in `tests/integration/onboarding.test.ts` that a fresh user reports 0 of 4, that a PREVIEW-only import leaves the statements step incomplete, and that committing the synthetic Kotak fixture completes accounts, statements and identifiers
- [ ] 3.2 Implement server actions `markGuideSeen`, `setChecklistHidden(hidden)`, `setReviewDone(done)` in `src/server/actions/onboarding.ts` (zod-validated, owner-scoped, audited, `revalidatePath`), rejecting `setReviewDone(true)` when the user has no transactions; verify in the integration test that each action writes an `AuditLog` row, that marking review done with no transactions is refused, and that after all three actions every transaction's category and `needsReview`, and the `computeSummary` totals, are unchanged

## 4. Checklist, walkthrough and Guide page

- [ ] 4.1 Build `SetupChecklist` (full and banner modes) with progress bar, status icon plus text label per step, reason, detail, "Do it" link, "Hide" (banner) and "Mark as done" on the review step (only when transactions exist); verify visually on the running app at mobile and desktop widths in light and dark mode
- [ ] 4.2 Build the `HowItWorks` dialog with Next/Back/Close and a step counter, calling `markGuideSeen` once on close when not yet seen; verify keyboard focus moves into the dialog and Escape closes it
- [ ] 4.3 Add the `/guide` page (full checklist regardless of hidden/complete, "Show on dashboard" when hidden, button to open the walkthrough) and a "Guide" entry in `NAV` before Settings; verify it appears in both the desktop sidebar and the mobile menu
- [ ] 4.4 Update the dashboard: use `getSetupProgress` instead of its own account/transaction counts, render the full checklist when there are no accounts or no transactions (even if hidden), render the banner above content while required steps are incomplete and not hidden, hide it when all required steps are done, and auto-open the walkthrough when `onboardingGuideSeenAt` is null; verify against the running app with real data (banner shows "review: N need review") and with a fresh test user (full checklist + walkthrough)

## 5. Empty states

- [ ] 5.1 Extend `EmptyState` with an optional secondary link and support for a custom action element; add `SetupEmptyState({ prerequisite })` mapping `accounts`/`statements` to title, description, primary action and a Guide link; verify existing callers still render unchanged (typecheck + visual check of Goals/Budgets)
- [ ] 5.2 Use `SetupEmptyState` on Transactions (only when there are no transactions at all, keeping the "no matches" message for filters), Spending Analysis, Recurring Payments and Reports (new empty state; render no report figures); verify each page with a user who has no accounts and with one who has accounts but no transactions
- [ ] 5.3 Accounts empty state opens `AccountFormDialog` and states that passwords, PINs and full account numbers are never needed; Budgets and Goals empty states explain they can be set before importing and open `BudgetDialog`/`GoalDialog`; verify the dialogs open from the empty states on the running app

## 6. End-to-end and documentation

- [ ] 6.1 Add a Playwright test, run first against the freshly truncated test database, covering: walkthrough opens on first dashboard visit, navigate Next/Back, close, reload shows no walkthrough, checklist shows "0 of 4", Analysis shows the "Add account" empty state with a Guide link, Guide page lists all six steps; make the existing e2e tests independent of the walkthrough (it is already marked seen by the first test, or dismissed in their setup); verify `npm run build && npm run test:e2e` passes
- [ ] 6.2 Update `README.md` (Features: first-run checklist and Guide; how the review step's 10% rule works) and `docs/ARCHITECTURE.md` (onboarding module in the key-modules table); verify the README describes the four required and two optional steps exactly as implemented

## 7. Verification

- [ ] 7.1 Run `npm run typecheck`, `npm run lint` and `npm test`; verify all pass with no new warnings
- [ ] 7.2 Run `openspec validate add-first-run-onboarding --strict`; verify it reports the change as valid

## Workflow follow-up

- Sync the delta specs into `openspec/specs/` (`/opsx:sync`) once implementation is reviewed.
- Archive the change (`/opsx:archive`) after typecheck, lint and tests pass, then verify `openspec/specs/onboarding` and `openspec/specs/empty-states` exist.
