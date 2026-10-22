/** Seeds authors, books, users and a few demo tickets from data/bookleaf_sample_data.json. Idempotent. */
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const { classifyByRules } = require('./services/rules');

const AUTHOR_PASSWORD = 'author123';
const ADMIN_ACCOUNTS = [['admin@bookleaf.com', 'Asha (Ops)'], ['admin2@bookleaf.com', 'Ravi (Ops)']];
const ADMIN_PASSWORD = 'admin123';

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM authors').get().c > 0) return false;
  const { authors } = require(path.join(__dirname, '..', 'data', 'bookleaf_sample_data.json'));
  const insAuthor = db.prepare('INSERT INTO authors (id,name,email,phone,city,joined_date) VALUES (?,?,?,?,?,?)');
  const insBook = db.prepare(`INSERT INTO books (id,author_id,title,isbn,genre,publication_date,status,mrp,royalty_per_copy,copies_sold,
    royalty_earned,royalty_paid,royalty_pending,last_payout_date,print_partner,available_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insUser = db.prepare('INSERT INTO users (email,password_hash,role,name,author_id) VALUES (?,?,?,?,?)');
  const authorHash = bcrypt.hashSync(AUTHOR_PASSWORD, 10);

  db.transaction(() => {
    for (const a of authors) {
      insAuthor.run(a.author_id, a.name, a.email, a.phone, a.city, a.joined_date);
      insUser.run(a.email, authorHash, 'author', a.name, a.author_id);
      for (const b of a.books)
        insBook.run(b.book_id, a.author_id, b.title, b.isbn, b.genre, b.publication_date, b.status, b.mrp, b.author_royalty_per_copy,
          b.total_copies_sold, b.total_royalty_earned, b.royalty_paid, b.royalty_pending, b.last_royalty_payout_date, b.print_partner, JSON.stringify(b.available_on));
    }
    const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    for (const [email, name] of ADMIN_ACCOUNTS) insUser.run(email, adminHash, 'admin', name, null);

    // Demo tickets that exercise the edge cases (zero payout, in-production, ISBN mismatch).
    const demo = [
      ['AUTH003', 'BK005', 'No royalty received yet', 'I published my book 4 months ago and still haven\'t received any royalty. What is going on?'],
      ['AUTH007', 'BK013', 'Where is my book?', 'My thriller has been in cover design for weeks. When will it be published?'],
      ['AUTH002', 'BK003', 'ISBN mismatch on Amazon', 'My book is showing a different ISBN on Amazon than what is printed on the physical copy.'],
      ['AUTH006', null, 'Update my author bio', 'Can I update my author bio shown on the BookLeaf Store?'],
    ];
    const insT = db.prepare('INSERT INTO tickets (author_id,book_id,subject,description,category,category_source,priority,priority_source,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    demo.forEach(([a, b, s, d], i) => {
      const r = classifyByRules({ subject: s, description: d });
      insT.run(a, b, s, d, r.category, r.source, r.priority, r.source, new Date(Date.now() - (i + 1) * 36e5 * 20).toISOString().replace('T', ' ').slice(0, 19));
    });
  })();
  return true;
}

if (require.main === module) { console.log(seed() ? 'Seeded.' : 'Already seeded.'); }
module.exports = { seed };
