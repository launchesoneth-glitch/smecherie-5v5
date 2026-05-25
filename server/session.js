const session = require('express-session');

// MemoryStore e ok pt o app intre prieteni:
// la restart se reseteaza sesiunile -> userii se re-logheaza
// (datele lor sunt persistate in SQLite, doar cookie-ul de session moare)
function buildSession() {
  return session({
    secret: process.env.SESSION_SECRET || 'dev-secret-schimba-ma',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 zile
    },
  });
}

module.exports = buildSession;
