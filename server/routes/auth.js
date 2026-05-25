const express = require('express');
const { validateOpgg } = require('../lib/opgg');
const { fetchRank } = require('../lib/opggScraper');
const { findOrCreateUser, updateUserRank } = require('../db');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_.\- ]{2,24}$/;

function getAdminUsernames() {
  const env = process.env.ADMIN_USERNAMES || '';
  return env
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

router.post('/login', (req, res) => {
  const { username, opggUrl } = req.body || {};
  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'Username invalid (2-24 caractere, litere/cifre/spatii/_-.)',
    });
  }
  const opgg = validateOpgg(opggUrl);
  if (!opgg.ok) {
    return res.status(400).json({ error: opgg.error });
  }
  const adminUsernames = getAdminUsernames();
  const user = findOrCreateUser({
    username: username.trim(),
    opggUrl: opgg.url,
    adminUsernames,
  });
  req.session.userId = user.id;
  res.json({
    id: user.id,
    username: user.username,
    opgg_url: user.opgg_url,
    is_admin: !!user.is_admin,
  });

  // fetch rank in background (nu blocheaza raspunsul)
  fetchRank(opgg.url)
    .then((rank) => {
      if (rank) {
        updateUserRank(user.id, rank);
        // broadcast lobby snapshot ca toata lumea sa vada noul rank
        const io = req.app.get('io');
        if (io) {
          const { getLobbySnapshot } = require('../presence');
          io.emit('lobby:state', getLobbySnapshot());
        }
      }
    })
    .catch(() => {});
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Nelogat' });
  res.json({
    id: req.user.id,
    username: req.user.username,
    opgg_url: req.user.opgg_url,
    is_admin: !!req.user.is_admin,
  });
});

module.exports = router;
