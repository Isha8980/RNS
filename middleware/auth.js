const { pool } = require('../db');

// Runs on every request. If the session cookie names a logged-in user,
// loads that user and, for readers only, checks their session_token in
// the database still matches the token stored in this session. If it
// doesn't match (e.g. they logged in from another device, which
// overwrites the token), this session is stale — it gets destroyed and
// treated as logged out. Admin accounts skip this check entirely, so
// admins can be logged in from multiple devices/sessions at once.
async function attachUser(req, res, next) {
  if (!req.session.userId) {
    req.user = null;
    return next();
  }

  try {
    const result = await pool.query(
      'SELECT id, username, role, session_token FROM users WHERE id = $1',
      [req.session.userId]
    );
    const user = result.rows[0];

    if (!user) {
      return req.session.destroy(() => {
        req.user = null;
        next();
      });
    }

    const sessionIsStale = user.role === 'reader' && user.session_token !== req.session.token;

    if (sessionIsStale) {
      return req.session.destroy(() => {
        req.user = null;
        next();
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireLogin(req, res, next) {
  if (!req.user) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.redirect('/login');
  }
  if (req.user.role !== 'admin') {
    return res.status(403).send('Forbidden: admin access only.');
  }
  next();
}

module.exports = { attachUser, requireLogin, requireAdmin };
