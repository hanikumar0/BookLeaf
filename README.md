# BookLeaf Author Support & Communication Portal

Two portals (author + admin) on one Express app, with AI-assisted ticket classification, priority scoring and reply drafting grounded in the BookLeaf knowledge base.

## Quick start
```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY (optional: without it the app runs in rules-only mode)
npm start                   # http://localhost:3000  (auto-seeds from data/bookleaf_sample_data.json)
npm test                    # API smoke tests against a running server (node scripts/smoke.js [baseUrl])
```
Requires Node 18+. Deploy anywhere that runs Node with a persistent disk (Render, Railway, VPS); set `JWT_SECRET`, `ANTHROPIC_API_KEY`, `DB_PATH`.

## Test credentials
| Role | Email | Password |
|---|---|---|
| Admin | admin@bookleaf.com (or admin2@bookleaf.com) | admin123 |
| Author | any email in the dataset, e.g. priya.sharma@email.com | author123 |

Edge cases: `ananya.reddy@email.com` (zero payout), `sneha.kulkarni@email.com` (book in Cover Design), `kavita.deshmukh@email.com` (book in Typesetting). Four demo tickets are pre-seeded.

## Architecture
```
public/            Vanilla JS SPA (DOM built with textContent, so no HTML injection)
src/server.js      App wiring, SSE endpoint, central error handler
src/routes/        auth, books, tickets (HTTP only: validation, authz, DTO mapping)
src/middleware/    authenticate (JWT), requireRole, validate (zod)
src/services/      ai.js (LLM client + prompts), ticketAi.js (orchestration), context.js (fact builder),
                   knowledge.js (KB by category), rules.js (fallback classifier), events.js (SSE hub)
src/db.js, seed.js SQLite schema + idempotent seeding
```
- **SQLite (better-sqlite3):** zero-ops, relational schema with FKs and indexes; easy to move to Postgres.
- **SSE for real-time:** one-way push is all that's needed. Authors only receive events for their own tickets; admins get all. Clients re-fetch on event. Single-process hub; use Redis pub/sub to scale out.
- **Ownership checks:** other authors' tickets return 404 (not 403). Authors get a DTO that omits priority, assignee, AI metadata and notes.
- **Provenance fields** (`category_source`, `priority_source`: pending/ai/rules/admin) make overrides auditable and stop late AI results overwriting an admin's choice.

## AI integration
**Model:** Claude Haiku (`AI_MODEL`, default `claude-haiku-5-5`): fast, cheap, follows JSON and tone instructions well. Swappable via env var.

1. **Classify + prioritise** (async, after the ticket is saved): one call, JSON output, `max_tokens 120`, validated against allowed enums. Input is subject, description (truncated to 1,500 chars) and the book's status. No KB is sent.
2. **Draft reply** (lazy: first time an admin opens the ticket, cached, regenerate on demand): system prompt = company overview + tone guidelines + **only the policy section and handling example for that category**, plus a compact FACTS block (the single relevant book's numbers, computed next payout deadline, flags like "below ₹1,000 threshold" or "never paid, possibly overdue") and the last 4 messages. Rules forbid inventing numbers or policies and require owning faults, a timeline and a next step.

**Cost control:** category-scoped KB; only the relevant book; capped history, input and output tokens; lazy + cached drafts; static system prompt marked for prompt caching.

**Failure handling:** 15s timeout, one retry with backoff on 429/5xx (honours `retry-after`), and a circuit breaker pausing AI for 60s after repeated failures. Classification falls back to keyword rules (shown as "auto" vs "AI"). If drafting fails the endpoint returns `status:"failed"` and the admin writes manually. Ticket creation never depends on AI.

**Security:** API key is server-side env only. Ticket text is treated as data in prompts. AI output is only a draft; an admin always sends.

## API
All routes except `/api/auth/login` and `/api/health` need `Authorization: Bearer <jwt>`. Errors: `{ "error": { "message", "details?" } }` (400/401/403/404/409).

| Method & path | Role | Description |
|---|---|---|
| POST `/api/auth/login` | public | `{email,password}` → `{token,user}` |
| GET `/api/auth/me` | any | Current user |
| GET `/api/meta` | any | Categories, priorities, statuses |
| GET `/api/books` | any | Author: own books. Admin: all, or `?authorId=` |
| POST `/api/tickets` | author | `{bookId\|null, subject(3-150), description(10-5000), attachmentName?}` → 201, triggers AI triage |
| GET `/api/tickets` | any | Author: own. Admin: all; filters `status, category, priority, from, to, assignee=me\|unassigned, authorId`; urgency-sorted |
| GET `/api/tickets/:id` | owner/admin | Ticket + messages (+ notes and cached draft for admin) |
| PATCH `/api/tickets/:id` | admin | `{status?, category?, priority?, assignee?: "me"\|null}` |
| POST `/api/tickets/:id/messages` | owner/admin | `{body, status?}`. Admin reply defaults Open→In Progress and self-assigns; author follow-up reopens Resolved; no posts on Closed |
| POST `/api/tickets/:id/notes` | admin | Internal note |
| POST `/api/tickets/:id/draft` | admin | `{regenerate?}` → `{draft,status,reason?}` |
| GET `/api/events?token=` | any | SSE stream `{type, ticketId}` |
| GET `/api/health` | public | Status and AI mode |

## Known limitations / next steps
- Attachments are UI-only (file name recorded).
- SSE token travels in the query string (EventSource limitation); use a short-lived stream ticket in production.
- No login rate limiting, password reset or audit log; JWT in localStorage (move to httpOnly cookies).
- Single-instance SSE hub and SQLite.
- Classification accuracy should be measured on a labelled set; AI calls were not exercised against the live API in my sandbox (no key), though fallback paths are tested.
