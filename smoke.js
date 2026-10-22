/* End-to-end smoke test against a running server: node scripts/smoke.js [baseUrl] */
const base = process.argv[2] || 'http://localhost:3000';
let failed = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; };
async function call(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
(async () => {
  const a = (await call('/auth/login', { method: 'POST', body: { email: 'ananya.reddy@email.com', password: 'author123' } })).data.token;
  const p = (await call('/auth/login', { method: 'POST', body: { email: 'priya.sharma@email.com', password: 'author123' } })).data.token;
  const adm = (await call('/auth/login', { method: 'POST', body: { email: 'admin@bookleaf.com', password: 'admin123' } })).data.token;
  check('bad login -> 401', (await call('/auth/login', { method: 'POST', body: { email: 'x@y.com', password: 'no' } })).status === 401);
  check('no token -> 401', (await call('/books')).status === 401);
  check('author sees only own books', (await call('/books', { token: a })).data.books.length === 1);
  check('author cannot reach admin-only patch', (await call('/tickets/1', { method: 'PATCH', token: a, body: { status: 'Closed' } })).status === 403);
  check('validation -> 400', (await call('/tickets', { method: 'POST', token: a, body: { subject: 'x', description: 'y' } })).status === 400);
  check("cannot file ticket on someone else's book", (await call('/tickets', { method: 'POST', token: a, body: { bookId: 'BK001', subject: 'Hello there', description: 'This is not my book at all' } })).status === 400);
  const t = await call('/tickets', { method: 'POST', token: a, body: { bookId: 'BK005', subject: 'Royalty missing', description: 'I have not received any royalty for 6 months. Please help urgently.' } });
  check('create ticket -> 201', t.status === 201);
  await new Promise((r) => setTimeout(r, 800));
  const id = t.data.ticket.id;
  check("other author can't read ticket (404)", (await call('/tickets/' + id, { token: p })).status === 404);
  const view = (await call('/tickets/' + id, { token: adm })).data;
  check('auto-classified', view.ticket.category === 'Royalty & Payments' && view.ticket.priority === 'Critical');
  check('admin override works', (await call('/tickets/' + id, { method: 'PATCH', token: adm, body: { priority: 'High' } })).data.ticket.prioritySource === 'admin');
  const d = (await call(`/tickets/${id}/draft`, { method: 'POST', token: adm, body: {} })).data;
  check('draft endpoint degrades gracefully without AI key', d.status === 'failed' || d.status === 'ready');
  await call(`/tickets/${id}/notes`, { method: 'POST', token: adm, body: { body: 'internal only' } });
  await call(`/tickets/${id}/messages`, { method: 'POST', token: adm, body: { body: 'We are looking into it.' } });
  const av = (await call('/tickets/' + id, { token: a })).data;
  check('author sees admin reply', av.messages.some((m) => m.senderRole === 'admin'));
  check('author never sees notes/priority', !('notes' in av) && !('priority' in av.ticket));
  check('status moved to In Progress', av.ticket.status === 'In Progress');
  check('admin queue filter', (await call('/tickets?priority=High&status=In%20Progress', { token: adm })).data.tickets.length >= 1);
  check('in-production book returned', (await call('/books', { token: (await call('/auth/login', { method: 'POST', body: { email: 'sneha.kulkarni@email.com', password: 'author123' } })).data.token })).data.books.some((b) => !b.isPublished));
  process.exit(failed ? 1 : 0);
})();
