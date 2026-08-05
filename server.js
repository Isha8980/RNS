require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool, initializeDatabase } = require('./db');
const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const chaptersRoutes = require('./routes/chapters');

const app = express();
const PORT = process.env.PORT || 3000;

// Tell Express to use EJS as the template engine, and look for
// template files in the /views folder (this is the default, but
// being explicit makes it clear what's happening).
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS, client-side JS, images) from /public.
// A request for /css/style.css will be found at public/css/style.css.
app.use(express.static(path.join(__dirname, 'public')));

// Parse form submissions (e.g. comment/vote forms) into req.body.
app.use(express.urlencoded({ extended: true }));

// Session middleware: keeps a logged-in reader "remembered" across
// page loads via a cookie. Sessions are stored in Postgres (in their
// own auto-created "session" table) rather than in memory, so nobody
// gets logged out when the server restarts or wakes from sleep.
app.use(session({
  store: new pgSession({
    pool,
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    // Real deployments serve over HTTPS, so cookies should be marked
    // Secure. Locally (plain HTTP) that would silently break login,
    // so it's only turned on in production.
    secure: process.env.NODE_ENV === 'production',
  },
}));

// Runs on every request to figure out who (if anyone) is logged in,
// making req.user available everywhere below this line.
app.use(attachUser);

app.use(authRoutes);
app.use(adminRoutes);
app.use(chaptersRoutes);

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
