# Design

## Context

See proposal.md for motivation and specs/ for the required behavior. Current state that shapes the approach:

- The dashboard (`src/app/(app)/page.tsx`) already branches on `accountCount`/`txnCount` and renders one `EmptyState`; every other page renders its own `EmptyState` with inconsistent actions (several have none; Reports has none at all).
- Everything a step needs is already stored: `BankAccount` (non-archived), `StatementImport.status = COMMITTED` per account, `UserSettings.ownIdentifiers` (auto-filled from statement holder name/mobile by `rememberOwnIdentity`), `Transaction.needsReview`, `PaymentAppImport`, `Budget`, `FinancialGoal`.
- Per-user settings live in `UserSettings` (one row per user, created by `ensureUserDefaults`); settings changes are audited via `audit()`.
- Navigation is a static `NAV` array in `src/components/nav.tsx`, shared by the desktop sidebar and mobile sheet.
- shadcn/ui `Dialog`, `Card`, `Progress`, `Badge` and `Button` are already present; no new dependency is needed.

## Goals / Non-Goals

**Goals:**
- One pure function decides every step's status from plain counts, so the rules in the onboarding spec are unit-testable without a database.
- One server query gathers those counts in a single round of parallel queries; pages never compute onboarding state themselves.
- Empty states across pages are produced by one component fed by the same prerequisite logic, so they cannot disagree with the checklist.

**Non-Goals:**
- No client-side tour engine, no element highlighting, no animation library.
- No caching of onboarding state; counts are cheap and must always reflect current data.

## Decisions

### 1. Store three timestamps on `UserSettings`
Add nullable `onboardingGuideSeenAt`, `onboardingChecklistHiddenAt`, `onboardingReviewDoneAt` (`DateTime?`).
- *Why timestamps, not booleans:* they show when a decision was made (useful in the audit log and when debugging) at no extra cost; `null` means "not yet".
- *Alternative — a separate `OnboardingState` table:* rejected; it would be a 1:1 row with three columns and a second upsert path.
- *Alternative — `localStorage`:* rejected by the spec (must survive another browser/cleared storage) and by the project rule that durable state lives in the database.
- "Show on dashboard again" clears `onboardingChecklistHiddenAt` rather than adding a fourth field.

### 2. Pure evaluation in `src/lib/onboarding/steps.ts`
`evaluateSetup(facts: SetupFacts): SetupProgress` takes plain numbers/flags:
`activeAccounts`, `accountsWithCommittedImport` (plus names of those missing), `ownIdentifierCount`, `transactionCount`, `needsReviewCount`, `reviewMarkedDoneAt`, `paymentAppImportCount`, `budgetCount`, `goalCount`.
It returns the ordered steps (`id`, `required`, `done`, `detail` such as "2 of 3 accounts imported" or "371 transactions need review", `href`), `requiredDone`/`requiredTotal`, `allRequiredDone`, and `nextPrerequisite: "accounts" | "statements" | null` for empty states. Titles/reasons are static data in the same module. The 10% rule is `needsReview * 10 < transactions` in integers (no floats), and the step is never done when `transactionCount === 0`.
- *Why:* keeps Prisma/Next out of the rules (project layering rule) and makes every spec scenario a unit test.

### 3. One server query: `getSetupProgress(userId)` in `src/server/onboarding.ts`
Runs in parallel: count non-archived accounts; `bankAccount.findMany` with `imports: { some: { status: "COMMITTED" } }` selected per account; `transaction.count` total and `needsReview: true`; `paymentAppImport.count`; `budget.count`; `goal.count`; and reads `UserSettings`. Returns `{ progress, settings: { guideSeenAt, checklistHiddenAt } }`.
- Dashboard, Guide page and every page's empty state call it (or receive its `nextPrerequisite`). Dashboard already performs similar counts; those two counts are replaced by this call so the page does not query twice.

### 4. Server actions in `src/server/actions/onboarding.ts`
`markGuideSeen()`, `setChecklistHidden(hidden: boolean)`, `setReviewDone(done: boolean)` — each `requireUser()`, updates only the user's own `UserSettings` row, writes `audit(..., "UserSettings", id, "ONBOARDING_*", before, after)`, then `revalidatePath("/", "layout")`. `setReviewDone(true)` is rejected when the user has no transactions (spec: unmarkable). Inputs are validated with zod. No action touches financial tables.

### 5. UI composition
- `SetupChecklist` (server component data → small client component for the hide/mark-done buttons): progress bar `requiredDone/requiredTotal`, required steps then optional steps, each row with status icon + text label (never colour alone), reason, detail, and a "Do it" link. Rendered in two modes: `full` (no-data dashboard, Guide page) and `banner` (above dashboard content, with "Hide").
- `HowItWorks` dialog (client): an array of 4 steps (Your files stay here / What counts as spending / Card bills / Why rows are flagged), Next/Back/Close, `aria-live` step counter, focus handled by the existing Radix dialog. On the dashboard it is mounted open when `guideSeenAt` is null; `onOpenChange(false)` calls `markGuideSeen()` once. On the Guide page it is opened by a button and does not call the action again if already seen.
- `/guide` route under `src/app/(app)/guide/page.tsx`; `NAV` gains `{ href: "/guide", label: "Guide", icon: Compass }` placed before Settings.
- `EmptyState` gains optional `secondary` link and accepts a client trigger in place of `action` (so Accounts/Budgets/Goals can open their existing `AccountFormDialog`/`BudgetDialog`/`GoalDialog`). A thin `SetupEmptyState({ prerequisite })` maps `"accounts" | "statements"` to the correct title/description/action and always adds the Guide link.

### 6. Invariants
- **Integer paise / totals:** onboarding reads only counts; no amount is read, computed or written. The spec's "never changes financial data" requirement is enforced by the actions touching only `UserSettings` and covered by an integration test comparing transactions and summary totals before/after all actions.
- **Immutable raw records, locked categorization methods, idempotent commits, statement passwords:** untouched — no import, transaction or categorization code path changes.
- **AuditLog:** every onboarding state change writes an audit entry (Decision 4).
- **Review semantics:** "Mark as done" only affects the checklist; it never clears `needsReview` on any transaction.

## Risks / Trade-offs

- [Dashboard does a few more count queries per load] → all are indexed counts on `userId` run in parallel; replaces two existing counts; acceptable for a single-user app.
- [Walkthrough text drifts from accounting rules as rules evolve] → content lives next to the step definitions in `src/lib/onboarding` and a unit test asserts the spending-exclusion step mentions transfers, investments, cash and lending.
- [Auto-opening dialog could block e2e tests and screenshots] → e2e global setup marks the guide seen for the test user, and a dedicated e2e test covers the first-run flow on a fresh user.
- [Identifiers step auto-completes from a statement without the user looking] → the step's detail text invites checking the learned identifiers and adding UPI IDs, linking to Settings.
- [Existing users see the walkthrough once after deploy] → intended; one dismissal stops it.

## Migration Plan

1. `prisma migrate dev --name onboarding_state` adds the three nullable columns; existing rows get `NULL` (guide not yet seen, checklist visible, review not marked).
2. Deploy app code. No backfill is needed.
3. Rollback: revert the app, then drop the three columns (`ALTER TABLE "UserSettings" DROP COLUMN ...`). Only onboarding UI state is lost; no financial data is affected.
