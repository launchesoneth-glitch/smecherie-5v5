// Tracker pt useri online prin Socket.io
const { getUserById, getTeams, getLobbyState } = require('./db');
const voting = require('./voting');

const sockets = new Map(); // socketId -> userId
const userSockets = new Map(); // userId -> Set<socketId>

function add(socketId, userId) {
  sockets.set(socketId, userId);
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socketId);
}

function remove(socketId) {
  const userId = sockets.get(socketId);
  sockets.delete(socketId);
  if (userId && userSockets.has(userId)) {
    userSockets.get(userId).delete(socketId);
    if (userSockets.get(userId).size === 0) userSockets.delete(userId);
  }
  return userId;
}

function isOnline(userId) {
  return userSockets.has(userId);
}

function onlineUserIds() {
  return Array.from(userSockets.keys());
}

function getLobbySnapshot() {
  const ids = onlineUserIds();
  const users = ids
    .map((id) => getUserById(id))
    .filter(Boolean)
    .map((u) => ({
      id: u.id,
      username: u.username,
      opgg_url: u.opgg_url,
      is_admin: !!u.is_admin,
      rank: u.rank_tier
        ? {
            tier: u.rank_tier,
            division: u.rank_division,
            lp: u.rank_lp,
            wins: u.rank_wins,
            losses: u.rank_losses,
          }
        : null,
    }));
  const state = getLobbyState();
  const teams = getTeams();
  return {
    users,
    state: {
      phase: state.phase,
      captain1_id: state.captain1_id,
      captain2_id: state.captain2_id,
      current_turn: state.current_turn,
      pick_index: state.pick_index,
    },
    teams,
    voting: voting.snapshot(ids),
  };
}

module.exports = { add, remove, isOnline, onlineUserIds, getLobbySnapshot };
