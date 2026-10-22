const express = require('express');
const path = require('path');
const { port } = require('./config');
const { seed } = require('./seed');
const { HttpError } = require('./errors');
const { authenticate } = require('./middleware/auth');
const { CATEGORIES, PRIORITIES, STATUSES } = require('./constants');
const events = require('./services/events');
const { aiEnabled } = require('./services/ai');

seed();
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ai: aiEnabled() ? 'enabled' : 'rules-only' }));
app.use('/api/auth', require('./routes/auth'));

// Everything below requires a valid token.
app.get('/api/events', authenticate({ allowQueryToken: true }), (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const beat = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => clearInterval(beat));
  events.subscribe(res, req.user);
});
app.use('/api', authenticate());
app.get('/api/meta', (_req, res) => res.json({ categories: CATEGORIES, priorities: PRIORITIES, statuses: STATUSES }));
app.use('/api/books', require('./routes/books'));
app.use('/api/tickets', require('./routes/tickets'));

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint not found')));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: { message: err.message, details: err.details } });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'Malformed JSON body' } });
  console.error(err);
  res.status(500).json({ error: { message: 'Unexpected server error' } });
});

module.exports = app;
if (require.main === module) app.listen(port, () => console.log(`BookLeaf portal on http://localhost:${port} (AI: ${aiEnabled() ? 'on' : 'rules-only'})`));
