/**
 * Builds the compact FACTS block fed to the model: only the ticket's book (or a one-line
 * summary of the author's books for account-level tickets). Never the full history/dataset.
 */
const db = require('../db');

const fmtDate = (d) => d.toISOString().slice(0, 10);

/** Quarterly cycle: paid within 45 days of quarter end. Returns the next payout deadline. */
function nextPayoutDate(today = new Date()) {
  const y = today.getUTCFullYear();
  const quarterEnds = [-1, 0, 1].flatMap((o) =>
    [[2, 31], [5, 30], [8, 30], [11, 31]].map(([m, d]) => new Date(Date.UTC(y + o, m, d))));
  const due = quarterEnds.map((q) => ({ q, due: new Date(q.getTime() + 45 * 864e5) }))
    .filter((x) => x.due >= today).sort((a, b) => a.due - b.due)[0];
  return { quarterEnd: fmtDate(due.q), payoutBy: fmtDate(due.due) };
}

function bookFacts(b) {
  const lines = [`Book: "${b.title}" (${b.id}), genre ${b.genre}, status: ${b.status}.`];
  if (!b.publication_date) {
    lines.push('Not yet published: in production, no sales or royalties yet, no MRP/print partner assigned.');
    return lines.join('\n');
  }
  const platforms = JSON.parse(b.available_on || '[]').join(', ') || 'none';
  lines.push(
    `ISBN ${b.isbn}; published ${b.publication_date}; MRP Rs ${b.mrp}; royalty/copy Rs ${b.royalty_per_copy}; print partner ${b.print_partner}; listed on: ${platforms}.`,
    `Sales: ${b.copies_sold} copies. Royalty earned Rs ${b.royalty_earned}, paid Rs ${b.royalty_paid}, pending Rs ${b.royalty_pending}. Last payout: ${b.last_payout_date || 'never paid'}.`);
  if (b.royalty_pending > 0 && b.royalty_pending < 1000) lines.push('Pending royalty is below the Rs 1,000 minimum, so it rolls over to next quarter.');
  const monthsLive = (Date.now() - new Date(b.publication_date)) / (30.4 * 864e5);
  if (!b.last_payout_date && b.royalty_pending >= 1000 && monthsLive > 4)
    lines.push(`No payout has ever been made despite Rs ${b.royalty_pending} pending and ${Math.floor(monthsLive)} months since publication: this may be genuinely overdue; check bank details and escalate.`);
  return lines.join('\n');
}

function buildFacts(ticket) {
  const author = db.prepare('SELECT name, city FROM authors WHERE id = ?').get(ticket.author_id);
  const np = nextPayoutDate();
  const out = [`Author: ${author.name}. Today: ${fmtDate(new Date())}. Next royalty payout deadline: ${np.payoutBy} (quarter ending ${np.quarterEnd} + 45 days).`];
  if (ticket.book_id) {
    out.push(bookFacts(db.prepare('SELECT * FROM books WHERE id = ?').get(ticket.book_id)));
  } else {
    const books = db.prepare('SELECT title, status, royalty_pending FROM books WHERE author_id = ?').all(ticket.author_id);
    out.push('Account-level ticket. Author books: ' + books.map((b) => `"${b.title}" [${b.status}, pending Rs ${b.royalty_pending}]`).join('; '));
  }
  return out.join('\n');
}

module.exports = { buildFacts, nextPayoutDate };
