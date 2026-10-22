const router = require('express').Router();
const db = require('../db');
const { forbidden } = require('../errors');

const toDto = (b) => ({
  id: b.id, title: b.title, isbn: b.isbn, genre: b.genre, publicationDate: b.publication_date,
  status: b.status, isPublished: Boolean(b.publication_date), mrp: b.mrp, copiesSold: b.copies_sold,
  royaltyEarned: b.royalty_earned, royaltyPaid: b.royalty_paid, royaltyPending: b.royalty_pending,
  lastPayoutDate: b.last_payout_date, printPartner: b.print_partner, availableOn: JSON.parse(b.available_on || '[]'),
});

/** Authors: always their own books. Admins: ?authorId= required to scope (or all if omitted). */
router.get('/', (req, res) => {
  let rows;
  if (req.user.role === 'author') rows = db.prepare('SELECT * FROM books WHERE author_id = ? ORDER BY publication_date IS NULL, publication_date').all(req.user.authorId);
  else if (req.query.authorId) rows = db.prepare('SELECT * FROM books WHERE author_id = ?').all(String(req.query.authorId));
  else rows = db.prepare('SELECT * FROM books').all();
  res.json({ books: rows.map(toDto) });
});

module.exports = router;
