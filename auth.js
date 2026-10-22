const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const { jwtSecret } = require('../config');
const { HttpError } = require('../errors');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

const loginSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, authorId: u.author_id });

router.post('/login', validate({ body: loginSchema }), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email);
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!user || !bcrypt.compareSync(req.body.password, user.password_hash)) throw new HttpError(401, 'Invalid email or password');
  const token = jwt.sign({ sub: user.id, role: user.role, authorId: user.author_id, name: user.name }, jwtSecret, { expiresIn: '12h' });
  res.json({ token, user: publicUser(user) });
});

router.get('/me', authenticate(), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: publicUser(user) });
});

module.exports = router;
