/** In-process SSE hub. Swap for Redis pub/sub when running more than one instance. */
const clients = new Set(); // { res, role, authorId }

function subscribe(res, user) {
  const c = { res, role: user.role, authorId: user.authorId };
  clients.add(c);
  res.on('close', () => clients.delete(c));
}

/** Authors only receive events for their own tickets; admins receive all. */
function publish(type, ticket) {
  const payload = `data: ${JSON.stringify({ type, ticketId: ticket.id })}\n\n`;
  for (const c of clients) if (c.role === 'admin' || c.authorId === ticket.author_id) c.res.write(payload);
}

module.exports = { subscribe, publish };
