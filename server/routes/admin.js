const express = require('express');
const { requireAdmin } = require('../middleware');
const {
  setCaptains,
  resetLobby,
  getUserById,
  getLobbyState,
} = require('../db');
const { isOnline, getLobbySnapshot } = require('../presence');

const router = express.Router();

router.post('/captains', requireAdmin, (req, res) => {
  const { captain1Id, captain2Id } = req.body || {};
  const c1 = parseInt(captain1Id, 10);
  const c2 = parseInt(captain2Id, 10);
  if (!c1 || !c2 || c1 === c2) {
    return res.status(400).json({ error: 'Trebuie 2 capitani diferiti' });
  }
  const u1 = getUserById(c1);
  const u2 = getUserById(c2);
  if (!u1 || !u2) return res.status(400).json({ error: 'Capitan inexistent' });
  if (!isOnline(c1) || !isOnline(c2)) {
    return res.status(400).json({ error: 'Capitanii trebuie sa fie in lobby (online)' });
  }
  setCaptains(c1, c2);
  res.json({ ok: true, snapshot: getLobbySnapshot() });
  // emiterea catre socket-uri se face din index.js prin event-bus simplu
  if (req.app.get('io')) {
    req.app.get('io').emit('lobby:state', getLobbySnapshot());
  }
});

router.post('/reset', requireAdmin, (req, res) => {
  resetLobby();
  res.json({ ok: true });
  if (req.app.get('io')) {
    req.app.get('io').emit('lobby:state', getLobbySnapshot());
  }
});

router.get('/state', requireAdmin, (req, res) => {
  res.json(getLobbyState());
});

module.exports = router;
