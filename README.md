# Fintrack — personal finance intelligence

A private, self-hosted dashboard that turns Indian bank statements (PDF, CSV, XLSX) into accurate answers to:
**where is my money going, how much am I actually saving, and what can I change?**

Financial correctness comes first: every PDF row is reconciled against the bank's running balance, money is stored as integer paise, transfers between your own accounts are never counted as income or spending, and anything uncertain is flagged for review instead of guessed.

## Quick start

Requirements: Node 20+ (tested on 26) and either Docker or a local PostgreSQL 15+ (tested on 17).

```bash
# 1. Database — Docker (recommended; nothing installed globally)
docker compose up -d          # Postgres 17 on localhost:5433, creates fintrack + fintrack_test
#    …or a local install instead: brew install postgresql@17 && createdb fintrack && createdb fintrack_test

# 2. Configure
cp .env.example .env
#   DATABASE_URL   → your fintrack database
#   APP_PASSWORD   → the password you'll sign in with (min 8 chars)
#   SESSION_SECRET → openssl rand -hex 32

# 3. Install, migrate, seed (seed creates the owner + built-in categories/rules)
npm install
npm run db:deploy        # or `npm run db:migrate` while developing
npm run db:seed          # add `-- --demo` to load SYNTHETIC demo statements

# 4. Run
npm run build && npm start      # http://localhost:3000
# or for development: npm run dev
```

> npm 11 blocks dependency install scripts by default. If Prisma or esbuild complain, run
> `npm install-scripts approve @prisma/client @prisma/engines prisma esbuild unrs-resolver && npm rebuild`.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `APP_PASSWORD` | yes | Single-user login password (≥ 8 chars) |
| `SESSION_SECRET` | yes | ≥ 32 chars; signs the session cookie |
| `APP_USER_EMAIL`, `APP_USER_NAME` | no | Owner identity (defaults: `owner@fintrack.local`, `Owner`) |
| `TEST_DATABASE_URL` | no | Test DB (default `postgresql://$USER@localhost:5432/fintrack_test`) |

## Importing your three bank accounts

1. **Bank Accounts → Add account** once per account (e.g. *Kotak Mahindra*, *Federal Bank*, *Bank of Maharashtra*). Set the type (Savings/Salary/Credit card…). Don't enter passwords, PINs or full card numbers — only the last 4 digits are kept, and they're filled in automatically from the first statement.
2. **Import Statements**: choose the account, drop the file. For password-protected PDFs (e.g. Federal Bank), enter the statement password — it is used once in memory and never stored.
3. **Review the preview.** You'll see the detected bank and period, opening → closing balance, and the *running-balance check* ("Every row reconciles" means each row's amount matches the change in the bank's printed balance). Rows already imported are marked *Already imported*. You can correct a row, exclude rows, or — for CSV/XLSX — remap columns and save the mapping for that account.
4. **Import.** Transactions are categorized, refunds linked, transfers between your accounts matched, and recurring payments detected.
5. **Review** (Transactions → *Needs review*): the *Review by person or merchant* panel lets you categorize everyone you pay or receive money from in one click (e.g. Family support, Personal lending and repayments, Rent) and saves a rule for future imports.

Re-importing the same file is refused; importing overlapping periods skips the overlap automatically.

**Paytm (payment-app) history.** If you pay mostly through Paytm, upload its UPI statement under *Import → Payment app history* (Paytm app → Balance & History → Download statement). It isn't an account: each Paytm payment is matched to its bank transaction by UPI reference number (same amount, direction and account; ambiguous cases are left alone), and adds the payee's real name, your note and your tags. Tags that name a spending type (#Food, #Groceries, #rapido, #Travel, #Self Transfer, #monthly FD…) categorize the transaction; generic or personal tags (#Money Transfer, #hisab, #Office) are only shown. The upload is checked against Paytm's printed totals, overlapping uploads replace earlier ones, and entries paid from accounts you haven't imported yet match automatically once you import them. Nothing is added to income or spending totals.

**Supported formats**

| Source | Status |
|---|---|
| Kotak Mahindra PDF e-statement | Dedicated adapter (`kotak-pdf`) |
| Federal Bank PDF e-statement (incl. password-protected) | Dedicated adapter (`federal-pdf`), reads MCC codes from UPI narrations |
| Bank of Maharashtra PDF e-statement | Dedicated adapter (`bom-pdf`), cross-checks the bank's printed totals |
| Other banks' text PDFs | Generic table parser — review carefully |
| CSV / XLS / XLSX exports | Auto-detected header + editable column mapping |
| Paytm UPI statement PDF | Enrichment only (`paytm-upi-pdf`): payee names, notes, tags; reconciled with Paytm's totals |
| Scanned/image PDFs | Detected and rejected with an OCR message (no OCR built in) |

Check how a file parses without touching the database (prints only aggregates):
`npm run analyze -- path/to/statement.pdf [password]`

## Features

- **Dashboard** — verified total balance (from statement closing balances, clearly marked verified/unverified/unknown), income, expenses, savings & rate, net cash flow, investments, own-account transfers, card bills and cash, monthly income vs expenses, spending by category, per-account balances and activity, largest expenses, recurring payments, recent and needs-review transactions, data-quality notes. All driven by the date filter (this month, last month, 3/6 months, this year, all time, custom).
- **Spending Analysis** — category breakdown (amount + %), evidence-based observations, period comparison with links to the responsible transactions, unusual increases vs a 3-period baseline, key areas (food, shopping, transport, rent, family), essential/discretionary/family split, top merchants, largest one-time expenses, subscriptions with annualized cost, spending vs money movements.
- **Transactions** — search, filter (account, category, type, direction, amount, date, needs review), sort, paginate, inline category edit, bulk categorize (optionally creating rules), merchant-name correction, notes, transfer confirmation, manual entries (e.g. cash spending), CSV export.
- **Budgets** (monthly per category, remaining and % used) with a monthly summary of essential / discretionary / family / savings / investments / transfers. **Goals** with required monthly contribution vs your recent savings. **Recurring payments** to confirm, edit or dismiss. **Monthly reports** with observations, budget performance and data-quality warnings, exportable to CSV or PDF (print).
- **Settings** — own-account identifiers, transfer window, credit-card bill treatment, categories (custom + subcategories), editable rules (including built-ins), audit trail, delete-everything.

## Accounting rules (what counts as what)

| Category type | Income / expense? | Shown as |
|---|---|---|
| Income (salary, interest…) | Income | Income |
| Expense categories | Expense (net of refunds) | Spending |
| Transfers between my own accounts | Neither | Own-account transfers |
| Credit card payments | Spending **only** if no credit-card account is tracked (Settings → Automatic) | Card bills |
| Investment contributions / withdrawals | Neither | Invested / paid out |
| Cash withdrawals | Neither (spending unknown) | Cash |
| Personal lending and repayments | Neither | Lending |
| Refunds and reversals | Reduce the original expense category | Refunds |
| Unclassified | Neither — surfaced as a data-quality warning | Not yet categorized |

- **Transfers**: an identical UPI/IMPS reference number in two of your accounts confirms a transfer automatically. Same amount + nearby date without a shared reference is only a *suggestion* you confirm or reject. Payments to/from your own name, phone number or UPI IDs (Settings) are transfers even when the other account isn't imported.
- **Duplicates**: keyed by account + date + direction + amount + bank reference (or normalized narration), numbered by occurrence so two genuine identical payments on the same day both survive; a second check on running balance catches the same statement exported in a different format.
- **Savings rate** is shown only when the imported accounts receive most of your income; otherwise the app says so rather than printing a meaningless percentage.
- Original bank narrations and every extracted row are kept unchanged; corrections and reclassifications are written to the audit log.

## Security & privacy

- Single-user login (password from env), signed HttpOnly SameSite=Strict session cookie, middleware on every route plus server-side checks in every action and API handler; all queries are scoped to the owner.
- Uploaded files are validated by size (15 MB) and content (magic bytes), parsed in memory and **never stored** — only extracted rows and a SHA-256 fingerprint. No public file URLs exist.
- PDF passwords are never stored or logged; account numbers are reduced to the last 4 digits; database query logging is off; errors don't echo financial data.
- Rate limits on login (5 / 15 min) and uploads (30 / 10 min); CSP, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, `no-store` headers.
- No data is sent to any external service. CSV exports are protected against spreadsheet formula injection.
- `.gitignore` excludes `.env*` and statement files (`*.pdf`, `*.xlsx`, `*.xls`) except synthetic test fixtures.

## Testing

```bash
npm test             # unit + integration (uses the fintrack_test database)
npm run test:e2e     # Playwright against the production build (run `npm run build` first; `npx playwright install chromium` once)
npm run typecheck && npm run lint
npm run fixtures     # regenerate the synthetic statement fixtures
```

Unit tests cover amount/date parsing, all three bank adapters and CSV/XLSX (with totals checked against independently computed expectations), file validation, categorization, transfer detection, duplicate keys, refunds, recurring detection, accounting totals, savings rate, budgets and date ranges. Integration tests run the full import pipeline against PostgreSQL (overlapping statements, idempotent retries, ownership checks, deletion). All fixtures are synthetic.

## Known limitations

- **No OCR**: scanned PDFs are rejected with an explanation.
- New bank PDF formats use a generic parser; add an adapter in `src/lib/parsing/pdf/adapters.ts` for reliable results.
- Credit-card statements have no dedicated parser yet; import card exports as CSV/XLSX into a *Credit card* account (this automatically stops counting card bill payments as spending).
- AI-assisted categorization is not implemented; everything is deterministic and local.
- Single user; in-memory rate limiting (fine for one machine, not for multi-instance deployments).
- Bond/P2P payouts can't be split into principal vs interest from narrations and are recorded as investment withdrawals for review.
- PDF export uses the browser's print-to-PDF.

See `docs/ARCHITECTURE.md` for the design.
