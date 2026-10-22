/* BookLeaf portal – vanilla JS SPA. All DOM built via h() (textContent), so user content can't inject HTML. */
const $app = document.getElementById('app');
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');
let meta = null, es = null, onEvent = () => {};

// ---------- helpers ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag); let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  if (value !== undefined) el.value = value;
  return el;
}
const inr = (n) => (n == null ? '–' : '₹' + Number(n).toLocaleString('en-IN'));
const utc = (s) => new Date(s.replace(' ', 'T') + 'Z');
const fmt = (s) => utc(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const ageHours = (s) => (Date.now() - utc(s)) / 36e5;
const age = (s) => { const x = ageHours(s); return x < 1 ? '<1h' : x < 48 ? Math.floor(x) + 'h' : Math.floor(x / 24) + 'd'; };
let toastTimer;
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3500); }

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { logout(); throw new Error('Session expired. Please sign in again.'); }
  if (!res.ok) throw new Error([data.error?.message || 'Request failed', ...(data.error?.details || []).map((d) => `${d.field}: ${d.message}`)].join(' – '));
  return data;
}
const badge = (cls, text) => h('span', { class: `badge ${cls}` }, text);
const pBadge = (t) => (t.priority ? badge('p-' + t.priority, t.priority) : h('span', { class: 'muted' }, 'Classifying…'));
const sBadge = (s) => badge('s-' + s, s);
const srcTag = (src) => (src === 'ai' ? h('span', { class: 'src', title: 'Set by AI' }, 'AI') : src === 'rules' ? h('span', { class: 'src', title: 'Set by keyword rules (AI unavailable)' }, 'auto') : src === 'admin' ? h('span', { class: 'src' }, 'edited') : null);

// ---------- session / realtime ----------
function logout() { localStorage.clear(); token = user = null; es?.close(); es = null; location.hash = ''; render(); }
function connectEvents() {
  es?.close();
  es = new EventSource('/api/events?token=' + encodeURIComponent(token));
  es.onmessage = (e) => onEvent(JSON.parse(e.data));
}

// ---------- layout ----------
function shell(content) {
  const links = user.role === 'admin' ? [['#/queue', 'Ticket queue']] : [['#/books', 'My books'], ['#/new', 'Submit a query'], ['#/tickets', 'My tickets']];
  const cur = location.hash;
  $app.replaceChildren(
    h('nav', {}, h('span', { class: 'brand' }, 'BookLeaf ' + (user.role === 'admin' ? 'Operations' : 'Author Support')),
      links.map(([href, label]) => h('a', { href, class: cur.startsWith(href) ? 'active' : '' }, label)),
      h('span', { class: 'muted' }, user.name), h('button', { class: 'secondary', onclick: logout }, 'Sign out')),
    h('main', {}, content));
}

// ---------- login ----------
function loginView() {
  const err = h('p', { class: 'error', role: 'alert' });
  const email = h('input', { type: 'email', required: true, autocomplete: 'username' });
  const pw = h('input', { type: 'password', required: true, autocomplete: 'current-password' });
  const fill = (e, p) => () => { email.value = e; pw.value = p; };
  $app.replaceChildren(h('div', { class: 'card login' }, h('h1', {}, 'BookLeaf Author Support'),
    h('form', { onsubmit: async (ev) => {
      ev.preventDefault(); err.textContent = '';
      try { const d = await api('/auth/login', { method: 'POST', body: { email: email.value, password: pw.value } });
        token = d.token; user = d.user; localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); render();
      } catch (e) { err.textContent = e.message; } } },
      h('label', {}, 'Email'), email, h('label', {}, 'Password'), pw, err,
      h('div', { class: 'row' }, h('button', { type: 'submit' }, 'Sign in'))),
    h('p', { class: 'muted' }, 'Demo accounts:'),
    h('div', { class: 'row' },
      h('button', { class: 'secondary', type: 'button', onclick: fill('priya.sharma@email.com', 'author123') }, 'Fill author'),
      h('button', { class: 'secondary', type: 'button', onclick: fill('admin@bookleaf.com', 'admin123') }, 'Fill admin'))));
}

// ---------- author: books ----------
async function booksView() {
  const { books } = await api('/books');
  shell([h('h1', {}, 'My books'), books.length ? h('div', { class: 'grid' }, books.map(bookCard)) : h('div', { class: 'empty' }, 'No books on your account yet.')]);
}
function bookCard(b) {
  const stat = (label, v) => h('div', {}, label, h('b', {}, v));
  return h('div', { class: 'card' }, h('h3', {}, b.title), sBadgeBook(b),
    h('p', { class: 'muted' }, [b.genre, b.isbn ? 'ISBN ' + b.isbn : null, b.publicationDate ? 'Published ' + b.publicationDate : null].filter(Boolean).join(' • ')),
    b.isPublished
      ? [h('div', { class: 'stats' }, stat('MRP', inr(b.mrp)), stat('Copies sold', b.copiesSold), stat('Earned', inr(b.royaltyEarned)),
          stat('Paid', inr(b.royaltyPaid)), stat('Pending', inr(b.royaltyPending)), stat('Last payout', b.lastPayoutDate || 'None yet')),
         b.royaltyPaid === 0 && b.royaltyPending > 0 ? h('p', { class: 'muted' }, 'No payout yet. Royalties are paid quarterly, within 45 days of quarter end (minimum ₹1,000).') : null,
         h('p', { class: 'muted' }, 'Available on: ' + (b.availableOn.join(', ') || '–'))]
      : h('p', { class: 'muted' }, 'This book is still in production. Sales and royalty details appear once it is live.'),
    h('a', { href: '#/new?book=' + b.id }, 'Ask about this book'));
}
const sBadgeBook = (b) => badge(b.isPublished ? 's-Resolved' : 's-In Progress', b.status);

// ---------- author: new ticket ----------
async function newTicketView() {
  const { books } = await api('/books');
  const pre = new URLSearchParams(location.hash.split('?')[1] || '').get('book') || '';
  const book = h('select', { value: pre }, h('option', { value: '' }, 'General / Account Level'), books.map((b) => h('option', { value: b.id }, b.title)));
  const subject = h('input', { required: true, maxlength: 150 });
  const desc = h('textarea', { required: true, minlength: 10, maxlength: 5000, placeholder: 'Tell us what happened, with dates and amounts if you have them.' });
  const file = h('input', { type: 'file' });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { type: 'submit' }, 'Submit query');
  shell([h('h1', {}, 'Submit a support query'), h('form', { class: 'card', onsubmit: async (ev) => {
    ev.preventDefault(); err.textContent = ''; btn.disabled = true;
    try { const { ticket } = await api('/tickets', { method: 'POST', body: { bookId: book.value || null, subject: subject.value, description: desc.value, attachmentName: file.files[0]?.name } });
      toast('Query submitted. We will reply here.'); location.hash = '#/tickets/' + ticket.id;
    } catch (e) { err.textContent = e.message; btn.disabled = false; } } },
    h('label', {}, 'Which book is this about?'), book, h('label', {}, 'Subject'), subject, h('label', {}, 'Description'), desc,
    h('label', {}, 'Attachment (optional)'), file, h('p', { class: 'muted' }, 'Only the file name is recorded for now. Please send photos by replying once we ask.'), err, h('div', { class: 'row' }, btn))]);
}

// ---------- shared: thread ----------
const threadEl = (messages) => messages.map((m) => h('div', { class: 'msg ' + m.senderRole }, h('small', {}, `${m.senderName} • ${fmt(m.createdAt)}`), m.body));

// ---------- author: tickets ----------
async function ticketsView() {
  const load = async () => {
    const { tickets } = await api('/tickets');
    shell([h('h1', {}, 'My tickets'), tickets.length ? tickets.map((t) => h('a', { href: '#/tickets/' + t.id, style: 'text-decoration:none;color:inherit' }, h('div', { class: 'card' },
      h('div', { class: 'row' }, h('b', {}, '#' + t.id + ' ' + t.subject), sBadge(t.status)),
      h('p', { class: 'muted' }, `${t.bookTitle} • updated ${fmt(t.updatedAt)}`)))) : h('div', { class: 'empty' }, 'You have not submitted any queries. ', h('a', { href: '#/new' }, 'Submit one'))]);
  };
  await load(); onEvent = () => load();
}
async function authorTicketView(id) {
  const load = async () => {
    const { ticket: t, messages } = await api('/tickets/' + id);
    const keep = document.getElementById('reply')?.value || '';
    const reply = h('textarea', { id: 'reply', style: 'min-height:90px', placeholder: 'Add a follow-up' }); reply.value = keep;
    shell([h('p', {}, h('a', { href: '#/tickets' }, '← All tickets')), h('div', { class: 'card' },
      h('div', { class: 'row' }, h('h2', {}, t.subject), sBadge(t.status)), h('p', { class: 'muted' }, `${t.bookTitle} • opened ${fmt(t.createdAt)}`),
      h('div', { class: 'msg author' }, t.description), threadEl(messages),
      messages.every((m) => m.senderRole === 'author') ? h('p', { class: 'muted' }, 'Our team has your query. Replies will appear here automatically.') : null,
      t.status === 'Closed' ? h('p', { class: 'muted' }, 'This ticket is closed. Please submit a new query if you need more help.')
        : h('form', { onsubmit: async (e) => { e.preventDefault(); try { await api(`/tickets/${id}/messages`, { method: 'POST', body: { body: reply.value } }); reply.value = ''; load(); } catch (er) { toast(er.message); } } },
          reply, h('div', { class: 'row' }, h('button', { type: 'submit' }, 'Send follow-up'))))]);
  };
  await load(); onEvent = (e) => e.ticketId === Number(id) && load();
}

// ---------- admin: queue ----------
async function queueView() {
  const f = JSON.parse(sessionStorage.getItem('filters') || '{}');
  const sel = (key, label, opts) => h('select', { 'aria-label': label, value: f[key] || '', onchange: (e) => { f[key] = e.target.value; sessionStorage.setItem('filters', JSON.stringify(f)); load(); } },
    h('option', { value: '' }, label), opts.map(([v, l]) => h('option', { value: v }, l || v)));
  const date = (key, label) => h('input', { type: 'date', 'aria-label': label, title: label, value: f[key] || '', onchange: (e) => { f[key] = e.target.value; sessionStorage.setItem('filters', JSON.stringify(f)); load(); } });
  const list = h('div');
  const load = async () => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    const { tickets } = await api('/tickets' + (qs ? '?' + qs : ''));
    const open = tickets.filter((t) => !['Resolved', 'Closed'].includes(t.status));
    list.replaceChildren(h('p', { class: 'muted' }, `${tickets.length} tickets • ${open.length} unresolved • ${open.filter((t) => t.priority === 'Critical').length} critical`),
      tickets.length ? h('table', {}, h('thead', {}, h('tr', {}, ['#', 'Priority', 'Subject', 'Author / book', 'Category', 'Status', 'Assignee', 'Age'].map((c) => h('th', {}, c)))),
        h('tbody', {}, tickets.map((t) => h('tr', { class: ageHours(t.createdAt) > 48 && open.includes(t) ? 'stale' : '', tabindex: 0, onclick: () => (location.hash = '#/queue/' + t.id), onkeydown: (e) => e.key === 'Enter' && (location.hash = '#/queue/' + t.id) },
          h('td', {}, t.id), h('td', {}, pBadge(t), srcTag(t.prioritySource)), h('td', {}, t.subject),
          h('td', {}, t.authorName, h('div', { class: 'muted' }, t.bookTitle)), h('td', {}, t.category || 'Classifying…', srcTag(t.categorySource)),
          h('td', {}, sBadge(t.status)), h('td', {}, t.assigneeName || '–'), h('td', {}, age(t.createdAt)))))) : h('div', { class: 'empty' }, 'No tickets match these filters.'));
  };
  shell([h('h1', {}, 'Ticket queue'), h('p', { class: 'muted' }, 'Sorted by urgency: unresolved first, then priority, then oldest. Red edge = unresolved for over 48h.'),
    h('div', { class: 'filters' }, sel('status', 'Any status', meta.statuses.map((s) => [s])), sel('category', 'Any category', meta.categories.map((s) => [s])),
      sel('priority', 'Any priority', meta.priorities.map((s) => [s])), sel('assignee', 'Anyone', [['me', 'Assigned to me'], ['unassigned', 'Unassigned']]),
      date('from', 'Created from'), date('to', 'Created to')), list]);
  await load(); onEvent = () => load();
}

// ---------- admin: ticket detail ----------
async function adminTicketView(id) {
  const draftBox = h('textarea', { id: 'draft', placeholder: 'Write your reply…', style: 'min-height:200px' });
  const draftNote = h('p', { class: 'muted' });
  const statusSend = h('select', {}, ['In Progress', 'Resolved', 'Closed', 'Open'].map((s) => h('option', { value: s }, 'Set status: ' + s)));
  const top = h('div'), side = h('div'), thread = h('div');
  let dirty = false; draftBox.addEventListener('input', () => (dirty = true));

  async function loadDraft(regenerate = false) {
    draftNote.textContent = 'Drafting a reply from the knowledge base…';
    const r = await api(`/tickets/${id}/draft`, { method: 'POST', body: { regenerate } });
    if (r.draft) { if (!dirty || regenerate) { draftBox.value = r.draft; dirty = false; } draftNote.textContent = 'AI draft ready. Review and edit before sending.'; }
    else draftNote.textContent = 'AI draft unavailable right now (' + (r.reason || 'unknown') + '). You can write the reply manually.';
  }
  async function patch(body) { try { await api('/tickets/' + id, { method: 'PATCH', body }); toast('Saved'); } catch (e) { toast(e.message); } refresh(); }
  async function refresh() {
    const d = await api('/tickets/' + id), t = d.ticket;
    const pick = (label, key, opts) => h('div', {}, h('label', {}, label, srcTag(t[key + 'Source'])), h('select', { value: t[key] || '', onchange: (e) => patch({ [key]: e.target.value }) },
      !t[key] ? h('option', { value: '' }, 'Classifying…') : null, opts.map((o) => h('option', { value: o }, o))));
    top.replaceChildren(h('p', {}, h('a', { href: '#/queue' }, '← Queue')), h('div', { class: 'row' }, h('h2', {}, `#${t.id} ${t.subject}`), sBadge(t.status)),
      h('p', { class: 'muted' }, `${t.authorName} • ${t.bookTitle} • opened ${fmt(t.createdAt)}`));
    thread.replaceChildren(h('div', { class: 'msg author' }, h('small', {}, t.authorName), t.description), t.attachmentName ? h('p', { class: 'muted' }, '📎 ' + t.attachmentName) : null, threadEl(d.messages));
    const note = h('textarea', { style: 'min-height:70px', placeholder: 'Internal note (author cannot see this)' });
    side.replaceChildren(h('div', { class: 'card' }, h('h3', {}, 'Triage'), pick('Category', 'category', meta.categories), pick('Priority', 'priority', meta.priorities),
      h('label', {}, 'Status'), h('select', { value: t.status, onchange: (e) => patch({ status: e.target.value }) }, meta.statuses.map((s) => h('option', { value: s }, s))),
      h('p', { class: 'muted' }, 'Assignee: ' + (t.assigneeName || 'unassigned')),
      h('div', { class: 'row' }, h('button', { class: 'secondary', onclick: () => patch({ assignee: 'me' }) }, 'Assign to me'), t.assigneeId ? h('button', { class: 'secondary', onclick: () => patch({ assignee: null }) }, 'Unassign') : null)),
      h('div', { class: 'card' }, h('h3', {}, 'Internal notes'), d.notes.length ? d.notes.map((n) => h('div', { class: 'note' }, h('small', { class: 'muted' }, `${n.adminName} • ${fmt(n.createdAt)}`), h('div', {}, n.body))) : h('p', { class: 'muted' }, 'No notes yet.'),
        note, h('div', { class: 'row' }, h('button', { onclick: async () => { if (!note.value.trim()) return; try { await api(`/tickets/${id}/notes`, { method: 'POST', body: { body: note.value } }); refresh(); } catch (e) { toast(e.message); } } }, 'Add note'))));
    return d;
  }
  shell(h('div', {}, top, h('div', { class: 'cols' }, h('div', {}, h('div', { class: 'card' }, thread),
    h('div', { class: 'card' }, h('h3', {}, 'Reply to author'), draftNote, draftBox,
      h('div', { class: 'row' }, statusSend, h('button', { onclick: async (e) => {
        if (!draftBox.value.trim()) return toast('Write a reply first');
        e.target.disabled = true;
        try { await api(`/tickets/${id}/messages`, { method: 'POST', body: { body: draftBox.value, status: statusSend.value } }); draftBox.value = ''; dirty = false; draftNote.textContent = 'Reply sent.'; toast('Reply sent'); refresh(); }
        catch (er) { toast(er.message); } e.target.disabled = false; } }, 'Send reply'),
        h('button', { class: 'secondary', onclick: () => loadDraft(true) }, 'Regenerate AI draft')))), side)));
  const d = await refresh();
  if (d.aiDraft) { draftBox.value = d.aiDraft; draftNote.textContent = 'AI draft ready. Review and edit before sending.'; } else loadDraft();
  onEvent = (e) => e.ticketId === Number(id) && refresh(); // refresh() leaves the draft textarea untouched
}

// ---------- router ----------
async function render() {
  if (!token) return loginView();
  try {
    meta ||= await api('/meta');
    if (!es) connectEvents();
    const [path] = location.hash.split('?'); const [, section, id] = path.split('/');
    onEvent = () => {};
    if (user.role === 'admin') return section === 'queue' && id ? await adminTicketView(id) : await queueView();
    if (section === 'new') return await newTicketView();
    if (section === 'tickets') return id ? await authorTicketView(id) : await ticketsView();
    return await booksView();
  } catch (e) { if (token) { shell(h('div', { class: 'card error' }, e.message)); } }
}
window.addEventListener('hashchange', render);
render();
