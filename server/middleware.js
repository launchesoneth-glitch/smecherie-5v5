const { getUserById } = require('./db');

function loadUser(req, res, next) {
  if (req.session && req.session.userId) {
    const u = getUserById(req.session.userId);
    if (u) req.user = u;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Trebuie sa fii logat' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Trebuie sa fii logat' });
  if (!req.user.is_admin) return res.status(403).json({ error: 'Doar adminul poate face asta' });
  next();
}

module.exports = { loadUser, requireAuth, requireAdmin };
