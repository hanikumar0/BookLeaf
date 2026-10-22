# Approach write-up

**Priorities.** AI integration and architecture carry the most weight, so I built the ticket lifecycle end to end first (submit → AI triage → admin drafts, edits, sends → author sees the reply live), then hardened it.

**Trade-offs.** Express + SQLite + vanilla JS keeps setup to `npm start` so review focuses on the backend. SSE over WebSockets because traffic is one-directional. Drafts are generated lazily and cached: a short wait on first open instead of paying for drafts nobody reads.

**AI design.** Classification is a tiny JSON-validated call. Drafting uses a category-scoped slice of the knowledge base plus a computed FACTS block (exact book figures, next payout date, "possibly overdue" flags) so the model quotes real numbers. Every AI step has a non-AI fallback (keyword rules, manual replies) and a human always sends.

**Product thinking.** The queue sorts unresolved → priority → oldest with a 48h stale marker; AI/auto/edited provenance is visible; changing category discards a draft written under the wrong policy. Authors never see priority or notes, and in-production or zero-payout books explain themselves.

**To production.** Postgres, Redis pub/sub, cookie sessions with rate limiting, real attachment storage, email notifications, SLA timers per priority, audit log, and an evaluation set to track classification accuracy and draft acceptance (edit distance between draft and sent reply).
