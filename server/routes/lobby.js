const express = require('express');
const { db, getRecentMessages, getUserById } = require('../db');
const { getLobbySnapshot, isOnline } = require('../presence');
const voting = require('../voting');
const { requireAuth } = require('../middleware');

const router = express.Router();

router.get('/lobby', requireAuth, (req, res) => {
  const snap = getLobbySnapshot();
  res.json(snap);
});

router.get('/messages', requireAuth, (req, res) => {
  res.json(getRecentMessages(100));
});

// Detalii despre un jucator (pt modal click)
const lastMsgStmt = db.prepare(`
  SELECT content, created_at FROM messages
  WHERE user_id = ? ORDER BY id DESC LIMIT 1
`);
const teamStmt = db.prepare(`
  SELECT team_num, pick_order FROM team_members WHERE user_id = ?
`);

router.get('/player/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID invalid' });
  const u = getUserById(id);
  if (!u) return res.status(404).json({ error: 'Jucator inexistent' });
  const lastMsg = lastMsgStmt.get(id);
  const team = teamStmt.get(id);
  const tally = voting.snapshot([id]);
  // numar voturi primite (din toti voterii valizi)
  const allTally = voting.tallyVotes(require('../presence').onlineUserIds());
  res.json({
    id: u.id,
    username: u.username,
    opgg_url: u.opgg_url,
    is_admin: !!u.is_admin,
    online: isOnline(u.id),
    in_lobby_since: u.last_seen,
    created_at: u.created_at,
    rank: u.rank_tier
      ? {
          tier: u.rank_tier,
          division: u.rank_division,
          lp: u.rank_lp,
          wins: u.rank_wins,
          losses: u.rank_losses,
          fetched_at: u.rank_fetched_at,
        }
      : null,
    last_message: lastMsg
      ? { content: lastMsg.content, created_at: lastMsg.created_at }
      : null,
    team: team ? { team_num: team.team_num, pick_order: team.pick_order } : null,
    captain_votes_received: allTally.get(u.id) || 0,
  });
});

module.exports = router;
