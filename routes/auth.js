const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { pool } = require('../db');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect(req.user.role === 'admin' ? '/admin' : '/');
  }
  res.render('login', { user: null, error: null });
});

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    // Same error message whether the username doesn't exist or the
    // password is wrong, so a failed login doesn't reveal which
    // usernames are registered.
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).render('login', { user: null, error: 'Incorrect username or password.' });
    }

    req.session.userId = user.id;

    // Only readers are limited to one active session. A fresh token
    // here overwrites whatever was stored before, which is what
    // invalidates any reader session already open elsewhere. Admins
    // skip this so they can be logged in from multiple devices at once.
    if (user.role === 'reader') {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query('UPDATE users SET session_token = $1 WHERE id = $2', [token, user.id]);
      req.session.token = token;
    }

    res.redirect(user.role === 'admin' ? '/admin' : '/');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    if (req.user) {
      await pool.query('UPDATE users SET session_token = NULL WHERE id = $1', [req.user.id]);
    }
    req.session.destroy(() => {
      res.redirect('/login');
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
