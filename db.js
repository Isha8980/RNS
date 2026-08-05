const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// A Pool manages a small set of reusable connections to Postgres,
// so the app isn't opening a brand-new connection for every query.
// It reads connection details from the DATABASE_URL env var
// (set in .env), e.g. postgres://user:password@host:5432/dbname
//
// Hosted databases (like Supabase) require SSL; the local Homebrew
// Postgres used for development doesn't support it at all, so SSL is
// only turned on when DATABASE_URL isn't pointing at localhost.
const isLocalDatabase = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
});

async function initializeDatabase() {
  // users: readers and the admin. For readers, session_token holds
  // their one active session — logging in elsewhere overwrites it,
  // invalidating the old session. Admins are exempt from this and can
  // have multiple sessions at once, so session_token is unused for them.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'reader')) DEFAULT 'reader',
      session_token TEXT
    );
  `);

  // chapters: the bonus chapters being shared with readers.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chapters (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // comments: attached to a specific paragraph within a chapter.
  // paragraph_index identifies which paragraph (e.g. 0 = first
  // paragraph, 1 = second, ...) so comments can be shown inline.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      paragraph_index INTEGER NOT NULL,
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // votes: one vote per user per chapter, enforced by the UNIQUE
  // constraint below (a second insert for the same pair will fail,
  // which the app can use to mean "you've already voted").
  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (chapter_id, user_id)
    );
  `);

  await createFirstAdmin();
}

// Creates the first admin account from ADMIN_USERNAME / ADMIN_PASSWORD
// in .env, but only if no user with that username already exists yet —
// safe to run on every server startup.
async function createFirstAdmin() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.warn(
      'ADMIN_USERNAME / ADMIN_PASSWORD not set in .env — skipping admin account creation.'
    );
    return;
  }

  const existing = await pool.query(
    'SELECT id FROM users WHERE username = $1',
    [ADMIN_USERNAME]
  );

  if (existing.rows.length > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await pool.query(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')`,
    [ADMIN_USERNAME, passwordHash]
  );

  console.log(`Admin account created for "${ADMIN_USERNAME}".`);
}

module.exports = { pool, initializeDatabase };
