/** Orchestrates AI work on tickets. Failures degrade to rules / manual replies; they never break ticket creation. */
const db = require('../db');
const ai = require('./ai');
const { classifyByRules } = require('./rules');
const { buildFacts } = require('./context');
const events = require('./events');

const getTicket = (id) => db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);

/** Runs after the ticket is saved (fire-and-forget). Won't overwrite an admin's manual override. */
async function triage(ticketId) {
  const t = getTicket(ticketId);
  const book = t.book_id ? db.prepare('SELECT status FROM books WHERE id = ?').get(t.book_id) : null;
  let result;
  try { result = await ai.classify({ subject: t.subject, description: t.description, bookStatus: book?.status }); }
  catch (e) { console.warn(`[triage] ticket ${ticketId}: ${e.message}; using rules`); result = classifyByRules(t); }
  db.prepare(`UPDATE tickets SET
      category = CASE WHEN category_source IN ('pending') THEN ? ELSE category END,
      category_source = CASE WHEN category_source = 'pending' THEN ? ELSE category_source END,
      priority = CASE WHEN priority_source = 'pending' THEN ? ELSE priority END,
      priority_source = CASE WHEN priority_source = 'pending' THEN ? ELSE priority_source END,
      updated_at = datetime('now') WHERE id = ?`)
    .run(result.category, result.source, result.priority, result.source, ticketId);
  events.publish('ticket.updated', getTicket(ticketId));
}

/** Lazy + cached: the draft is generated the first time an admin opens the ticket (or on regenerate). */
async function ensureDraft(ticketId, { force = false } = {}) {
  const t = getTicket(ticketId);
  if (t.ai_draft && !force) return { draft: t.ai_draft, status: 'ready' };
  try {
    const recent = db.prepare('SELECT sender_role, body FROM messages WHERE ticket_id = ? ORDER BY id DESC LIMIT 4').all(ticketId).reverse();
    const draft = await ai.draftReply({ ticket: t, facts: buildFacts(t), recentMessages: recent });
    db.prepare("UPDATE tickets SET ai_draft = ?, ai_draft_status = 'ready' WHERE id = ?").run(draft, ticketId);
    return { draft, status: 'ready' };
  } catch (e) {
    console.warn(`[draft] ticket ${ticketId}: ${e.message}`);
    db.prepare("UPDATE tickets SET ai_draft_status = 'failed' WHERE id = ?").run(ticketId);
    return { draft: null, status: 'failed', reason: e.message };
  }
}

module.exports = { triage, ensureDraft };
