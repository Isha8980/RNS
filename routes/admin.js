const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, username, role FROM users ORDER BY id');
    res.render('admin', { user: req.user, users: result.rows, error: null });
  } catch (err) {
    next(err);
  }
});

// The only way a reader account is ever created — no public signup
// page exists anywhere in this app.
router.post('/admin/users', requireAdmin, async (req, res, next) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
      const result = await pool.query('SELECT id, username, role FROM users ORDER BY id');
      return res.status(400).render('admin', {
        user: req.user,
        users: result.rows,
        error: 'Username and password are both required.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'reader')`,
      [username, passwordHash]
    );
    res.redirect('/admin');
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation: that username is already taken
      const result = await pool.query('SELECT id, username, role FROM users ORDER BY id');
      return res.status(400).render('admin', {
        user: req.user,
        users: result.rows,
        error: 'That username is already taken.',
      });
    }
    next(err);
  }
});

router.get('/admin/chapters/new', requireAdmin, (req, res) => {
  res.render('admin-new-chapter', { user: req.user, error: null });
});

router.post('/admin/chapters', requireAdmin, async (req, res, next) => {
  const { title, content } = req.body;

  try {
    if (!title || !content) {
      return res.status(400).render('admin-new-chapter', {
        user: req.user,
        error: 'Title and content are both required.',
      });
    }

    const result = await pool.query(
      'INSERT INTO chapters (title, content) VALUES ($1, $2) RETURNING id',
      [title, content]
    );
    res.redirect(`/chapters/${result.rows[0].id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
