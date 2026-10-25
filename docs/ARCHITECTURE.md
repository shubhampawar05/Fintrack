# Architecture

Next.js 15 (App Router, server components + server actions), PostgreSQL via Prisma 6, Tailwind 4 + shadcn/ui, Recharts. Pure financial logic lives in `src/lib` (framework-free, unit-tested); database-aware services in `src/server`; UI in `src/app` and `src/components`.

```
statement file ─► sniff type ─► parse (PDF adapter | CSV/XLSX mapping)
                                   │
                                   ▼
                     finalizeRows: validate + running-balance reconciliation
                                   │                         (direction is re-derived from the
                                   ▼                          balance delta; mismatches flagged)
               StatementImport (PREVIEW) + ImportedTransaction rows (raw, immutable)
                                   │  user edits / excludes / remaps
                                   ▼
          commit (one DB transaction, guarded PREVIEW→COMMITTED, unique dedupe keys)
                                   │
                                   ▼
        Transaction ─► categorize (user rules → own account → reversal → built-in rules → MCC → review)
                                   │
                                   ▼
       runLinking: refunds ↔ originals · transfers between accounts · recurring detection
                                   │
                                   ▼
           analytics (classify by category kind) ─► dashboard, analysis, budgets, reports
```

## Key modules

| Path | Responsibility |
|---|---|
| `src/lib/money.ts`, `dates.ts` | Integer-paise amounts, Indian number/date parsing, date ranges |
| `src/lib/parsing/pdf/extract.ts` | pdfjs text extraction with positions; password & scanned-page detection |
| `src/lib/parsing/pdf/columnar.ts` | Generic table engine: header detection, row anchors, wrapped narration, amount columns by right edge |
| `src/lib/parsing/pdf/adapters.ts` | Kotak, Federal Bank, Bank of Maharashtra, generic: headings, end markers, metadata |
| `src/lib/parsing/tabular.ts` | CSV/XLSX header detection and column mapping |
| `src/lib/parsing/validate.ts` | Row validation, running-balance chain, newest-first detection, bank-total cross-checks |
| `src/lib/categorize/*` | Narration → counterparty (UPI RRN, VPA, MCC), default categories & rules, engine |
| `src/lib/finance/*` | Dedupe keys, transfers, refunds, recurring, analytics (the accounting rules), insights, budgets |
| `src/server/imports.ts` | Preview → edit → commit → delete workflow |
| `src/server/pipeline.ts` | Re-categorization and linking over a user's data |
| `src/server/queries.ts` | Analytics loading, balances (verified/unverified/unknown), coverage gaps, data-quality warnings |
| `src/server/auth.ts`, `session.ts`, `middleware.ts` | Single-user auth and route protection |
| `src/lib/onboarding/steps.ts`, `src/server/onboarding.ts` | First-run setup: step rules evaluated from data counts (pure), progress query, audited onboarding flags on `UserSettings` |

## Data model highlights

- `ImportedTransaction` preserves every extracted row (raw cells, errors, warnings) and links to the `Transaction` it produced or the one it duplicated.
- `Transaction.description` is never modified; `merchant`, `merchantOverride`, `categoryId`, `categorizationMethod` and `confidence` are separate. `USER`, `TRANSFER_MATCH` and `REFUND_MATCH` decisions are never overwritten by automatic re-categorization.
- `Transaction @@unique([accountId, dedupeKey])` makes commits idempotent and overlap-safe.
- `Category.kind` drives accounting; `Category.key` identifies built-ins across renames.
- `InternalTransfer` pairs a debit and credit (`SUGGESTED` / `CONFIRMED` / `REJECTED`); rejected pairs are not re-suggested.
- `AuditLog` records imports, deletions, recategorizations, rule and settings changes.
- Money columns are `BigInt` paise; dates are `@db.Date`.

## Adding a bank

1. Run `npm run analyze -- statement.pdf` and inspect the extracted text (see `tests/fixtures/generate-fixtures.ts` for how layouts are modelled).
2. Add a `PdfAdapter` with the bank's column headings, row date format, continuation style and end-of-table markers, plus metadata extraction.
3. Add a synthetic fixture and a test asserting row count, totals and a balance check of `PASSED`.
