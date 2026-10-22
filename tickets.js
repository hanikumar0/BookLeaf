const router = require('express').Router();
const { z } = require('zod');
const db = require('../db');
const { CATEGORIES, PRIORITIES, STATUSES } = require('../constants');
const { HttpError, notFound, forbidden } = require('../errors');
const validate = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');
const events = require('../services/events');
const ticketAi = require('../services/ticketAi');

// Express 4 doesn't forward rejected promises from async handlers; this does.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const admin = requireRole('admin');
const author = requireRole('author');

// ---------- schemas ----------
const createSchema = z.object({
  bookId: z.string().nullable().optional(),
  subject: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  attachmentName: z.string().max(200).optional(),
});
const listQuery = z.object({
  status: z.enum(STATUSES).optional(), category: z.enum(CATEGORIES).optional(), priority: z.enum(PRIORITIES).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assignee: z.enum(['me', 'unassigned']).optional(), authorId: z.string().optional(),
});
const patchSchema = z.object({
  status: z.enum(STATUSES).optional(), category: z.enum(CATEGORIES).optional(), priority: z.enum(PRIORITIES).optional(),
  assignee: z.enum(['me']).nullable().optional(),
}).refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');
const messageSchema = z.object({ body: z.string().trim().min(1).max(5000), status: z.enum(STATUSES).optional() });
const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const draftSchema = z.object({ regenerate: z.boolean().optional() });

// ---------- helpers ----------
const SELECT = `SELECT t.*, a.name AS author_name, b.title AS book_title, u.name AS assignee_name
  FROM tickets t JOIN authors a ON a.id = t.author_id LEFT JOIN books b ON b.id = t.book_id LEFT JOIN users u ON u.id = t.assignee_id`;

const adminDto = (t) => ({
  id: t.id, subject: t.subject, description: t.description, attachmentName: t.attachment_name,
  authorId: t.author_id, authorName: t.author_name, bookId: t.book_id, bookTitle: t.book_title || 'General / Account Level',
  category: t.category, categorySource: t.category_source, priority: t.priority, prioritySource: t.priority_source,
  status: t.status, assigneeId: t.assignee_id, assigneeName: t.assignee_name,
  aiDraftStatus: t.ai_draft_status, createdAt: t.created_at, updatedAt: t.updated_at,
});
// Authors never see priority, assignee, AI metadata or notes.
const authorDto = (t) => ({
  id: t.id, subject: t.subject, description: t.description, attachmentName: t.attachment_name,
  bookId: t.book_id, bookTitle: t.book_title || 'General / Account Level', category: t.category,
  status: t.status, createdAt: t.created_at, updatedAt: t.updated_at,
});
const msgDto = (m) => ({ id: m.id, senderRole: m.sender_role, senderName: m.sender_name, body: m.body, createdAt: m.created_at });

/** Loads a ticket and enforces ownership: authors may only touch their own. */
function loadTicket(req) {
  const t = db.prepare(`${SELECT} WHERE t.id = ?`).get(req.params.id);
  if (!t) throw notFound('Ticket');
  if (req.user.role === 'author' && t.author_id !== req.user.authorId) throw notFound('Ticket'); // 404, not 403: don't leak existence
  return t;
}
const touch = (id, extra = '') => db.prepare(`UPDATE tickets SET updated_at = datetime('now')${extra} WHERE id = ?`).run(id);
const emit = (id, type = 'ticket.updated') => events.publish(type, db.prepare('SELECT id, author_id FROM tickets WHERE id = ?').get(id));

// ---------- routes ----------
router.post('/', author, validate({ body: createSchema }), (req, res) => {
  const { bookId, subject, description, attachmentName } = req.body;
  if (bookId) {
    const book = db.prepare('SELECT author_id FROM books WHERE id = ?').get(bookId);
    if (!book || book.author_id !== req.user.authorId) throw new HttpError(400, 'Selected book does not belong to your account');
  }
  const info = db.prepare('INSERT INTO tickets (author_id, book_id, subject, description, attachment_name) VALUES (?,?,?,?,?)')
    .run(req.user.authorId, bookId || null, subject, description, attachmentName || null);
  const id = info.lastInsertRowid;
  emit(id, 'ticket.created');
  ticketAi.triage(id).catch((e) => console.error('triage crashed', e)); // async; ticket already saved
  res.status(201).json({ ticket: authorDto(db.prepare(`${SELECT} WHERE t.id = ?`).get(id)) });
});

router.get('/', validate({ query: listQuery }), (req, res) => {
  const where = []; const args = [];
  const q = req.query;
  if (req.user.role === 'author') { where.push('t.author_id = ?'); args.push(req.user.authorId); }
  else {
    if (q.category) { where.push('t.category = ?'); args.push(q.category); }
    if (q.priority) { where.push('t.priority = ?'); args.push(q.priority); }
    if (q.authorId) { where.push('t.author_id = ?'); args.push(q.authorId); }
    if (q.assignee === 'me') { where.push('t.assignee_id = ?'); args.push(req.user.sub); }
    if (q.assignee === 'unassigned') where.push('t.assignee_id IS NULL');
    if (q.from) { where.push('date(t.created_at) >= ?'); args.push(q.from); }
    if (q.to) { where.push('date(t.created_at) <= ?'); args.push(q.to); }
  }
  if (q.status) { where.push('t.status = ?'); args.push(q.status); }
  // Admin default order surfaces urgency: unresolved first, then priority, then oldest first.
  const order = req.user.role === 'admin'
    ? `(t.status IN ('Resolved','Closed')), CASE t.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 2 END, t.created_at ASC`
    : 't.updated_at DESC';
  const rows = db.prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`).all(...args);
  res.json({ tickets: rows.map(req.user.role === 'admin' ? adminDto : authorDto) });
});

router.get('/:id', (req, res) => {
  const t = loadTicket(req);
  const messages = db.prepare('SELECT * FROM messages WHERE ticket_id = ? ORDER BY id').all(t.id).map(msgDto);
  if (req.user.role === 'author') return res.json({ ticket: authorDto(t), messages });
  const notes = db.prepare('SELECT * FROM notes WHERE ticket_id = ? ORDER BY id').all(t.id)
    .map((n) => ({ id: n.id, adminName: n.admin_name, body: n.body, createdAt: n.created_at }));
  res.json({ ticket: adminDto(t), messages, notes, aiDraft: t.ai_draft });
});

router.patch('/:id', admin, validate({ body: patchSchema }), (req, res) => {
  const t = loadTicket(req);
  const { status, category, priority, assignee } = req.body;
  if (status) db.prepare('UPDATE tickets SET status = ? WHERE id = ?').run(status, t.id);
  if (category && category !== t.category) // new category => cached draft used the wrong policy, discard it
    db.prepare("UPDATE tickets SET category = ?, category_source = 'admin', ai_draft = NULL, ai_draft_status = 'none' WHERE id = ?").run(category, t.id);
  if (priority) db.prepare("UPDATE tickets SET priority = ?, priority_source = 'admin' WHERE id = ?").run(priority, t.id);
  if (assignee !== undefined) db.prepare('UPDATE tickets SET assignee_id = ? WHERE id = ?').run(assignee === 'me' ? req.user.sub : null, t.id);
  touch(t.id);
  emit(t.id);
  res.json({ ticket: adminDto(db.prepare(`${SELECT} WHERE t.id = ?`).get(t.id)) });
});

router.post('/:id/messages', validate({ body: messageSchema }), (req, res) => {
  const t = loadTicket(req);
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && t.status === 'Closed') throw new HttpError(409, 'This ticket is closed. Please open a new ticket.');
  db.prepare('INSERT INTO messages (ticket_id, sender_role, sender_name, body) VALUES (?,?,?,?)')
    .run(t.id, req.user.role, isAdmin ? `${req.user.name} (BookLeaf)` : req.user.name, req.body.body);
  if (isAdmin) {
    const status = req.body.status || (t.status === 'Open' ? 'In Progress' : t.status);
    db.prepare('UPDATE tickets SET status = ?, assignee_id = COALESCE(assignee_id, ?) WHERE id = ?').run(status, req.user.sub, t.id);
  } else if (t.status === 'Resolved') db.prepare("UPDATE tickets SET status = 'Open' WHERE id = ?").run(t.id); // author follow-up reopens
  touch(t.id);
  emit(t.id);
  res.status(201).json({ ok: true });
});

router.post('/:id/notes', admin, validate({ body: noteSchema }), (req, res) => {
  const t = loadTicket(req);
  db.prepare('INSERT INTO notes (ticket_id, admin_name, body) VALUES (?,?,?)').run(t.id, req.user.name, req.body.body);
  res.status(201).json({ ok: true });
});

router.post('/:id/draft', admin, validate({ body: draftSchema }), wrap(async (req, res) => {
  const t = loadTicket(req);
  const result = await ticketAi.ensureDraft(t.id, { force: Boolean(req.body.regenerate) });
  // 200 even on AI failure: the client shows "write manually" rather than an error page.
  res.json(result);
}));

module.exports = router;
