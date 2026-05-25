const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

// asigura ca directorul exista
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    opgg_url TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    rank_tier TEXT,
    rank_division TEXT,
    rank_lp INTEGER,
    rank_wins INTEGER,
    rank_losses INTEGER,
    rank_fetched_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lobby_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    phase TEXT NOT NULL DEFAULT 'idle',
    captain1_id INTEGER REFERENCES users(id),
    captain2_id INTEGER REFERENCES users(id),
    current_turn INTEGER,
    pick_index INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS team_members (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    team_num INTEGER NOT NULL,
    pick_order INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
`);

// Migratii idempotente: adauga coloane rank daca lipsesc (pt DB-uri create anterior)
function ensureColumn(table, col, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  }
}
ensureColumn('users', 'rank_tier', 'TEXT');
ensureColumn('users', 'rank_division', 'TEXT');
ensureColumn('users', 'rank_lp', 'INTEGER');
ensureColumn('users', 'rank_wins', 'INTEGER');
ensureColumn('users', 'rank_losses', 'INTEGER');
ensureColumn('users', 'rank_fetched_at', 'INTEGER');

// Asigura singleton-ul lobby_state
const lobbyRow = db.prepare('SELECT id FROM lobby_state WHERE id = 1').get();
if (!lobbyRow) {
  db.prepare("INSERT INTO lobby_state (id, phase) VALUES (1, 'idle')").run();
}

// ---- Users ----
const userQ = {
  getByUsername: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  getById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insert: db.prepare(`
    INSERT INTO users (username, opgg_url, is_admin, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?)
  `),
  updateLastSeen: db.prepare('UPDATE users SET last_seen = ? WHERE id = ?'),
  updateOpgg: db.prepare('UPDATE users SET opgg_url = ? WHERE id = ?'),
  setAdmin: db.prepare('UPDATE users SET is_admin = ? WHERE id = ?'),
  count: db.prepare('SELECT COUNT(*) as n FROM users'),
  updateRank: db.prepare(`
    UPDATE users SET rank_tier = ?, rank_division = ?, rank_lp = ?,
                     rank_wins = ?, rank_losses = ?, rank_fetched_at = ?
    WHERE id = ?
  `),
};

function findOrCreateUser({ username, opggUrl, adminUsernames }) {
  const now = Date.now();
  const existing = userQ.getByUsername.get(username);
  if (existing) {
    userQ.updateLastSeen.run(now, existing.id);
    if (existing.opgg_url !== opggUrl) {
      userQ.updateOpgg.run(opggUrl, existing.id);
      existing.opgg_url = opggUrl;
    }
    return existing;
  }
  const totalUsers = userQ.count.get().n;
  const isAdmin =
    (adminUsernames && adminUsernames.includes(username.toLowerCase())) || totalUsers === 0
      ? 1
      : 0;
  const info = userQ.insert.run(username, opggUrl, isAdmin, now, now);
  return userQ.getById.get(info.lastInsertRowid);
}

// ---- Messages ----
const msgQ = {
  insert: db.prepare('INSERT INTO messages (user_id, content, created_at) VALUES (?, ?, ?)'),
  recent: db.prepare(`
    SELECT m.id, m.content, m.created_at, u.username, u.is_admin
    FROM messages m JOIN users u ON u.id = m.user_id
    ORDER BY m.id DESC LIMIT ?
  `),
};

function insertMessage(userId, content) {
  const now = Date.now();
  const info = msgQ.insert.run(userId, content, now);
  return { id: Number(info.lastInsertRowid), created_at: now };
}

function getRecentMessages(limit = 100) {
  return msgQ.recent.all(limit).reverse();
}

// ---- Lobby state ----
const lobbyQ = {
  get: db.prepare('SELECT * FROM lobby_state WHERE id = 1'),
  setCaptains: db.prepare(`
    UPDATE lobby_state SET phase = 'drafting', captain1_id = ?, captain2_id = ?, current_turn = 1, pick_index = 0
    WHERE id = 1
  `),
  reset: db.prepare(`
    UPDATE lobby_state SET phase = 'idle', captain1_id = NULL, captain2_id = NULL, current_turn = NULL, pick_index = 0
    WHERE id = 1
  `),
  setPhaseDone: db.prepare("UPDATE lobby_state SET phase = 'done' WHERE id = 1"),
  advance: db.prepare(`
    UPDATE lobby_state SET pick_index = ?, current_turn = ? WHERE id = 1
  `),
};

function getLobbyState() {
  return lobbyQ.get.get();
}

// ---- Team members ----
const teamQ = {
  clear: db.prepare('DELETE FROM team_members'),
  insert: db.prepare(
    'INSERT INTO team_members (user_id, team_num, pick_order) VALUES (?, ?, ?)'
  ),
  list: db.prepare(`
    SELECT tm.user_id, tm.team_num, tm.pick_order, u.username, u.opgg_url
    FROM team_members tm JOIN users u ON u.id = tm.user_id
    ORDER BY tm.team_num, tm.pick_order
  `),
  getByUser: db.prepare('SELECT * FROM team_members WHERE user_id = ?'),
};

function resetTeams() {
  teamQ.clear.run();
}

function addTeamMember(userId, teamNum, pickOrder) {
  teamQ.insert.run(userId, teamNum, pickOrder);
}

function getTeams() {
  const rows = teamQ.list.all();
  return {
    team1: rows.filter((r) => r.team_num === 1),
    team2: rows.filter((r) => r.team_num === 2),
  };
}

function isUserInTeam(userId) {
  return !!teamQ.getByUser.get(userId);
}

// La fiecare boot reseteaza starea lobby-ului (jocul incepe curat de fiecare data)
lobbyQ.reset.run();
teamQ.clear.run();

module.exports = {
  db,
  findOrCreateUser,
  getUserById: (id) => userQ.getById.get(id),
  getUserByUsername: (u) => userQ.getByUsername.get(u),
  setAdmin: (id, isAdmin) => userQ.setAdmin.run(isAdmin ? 1 : 0, id),
  touchUser: (id) => userQ.updateLastSeen.run(Date.now(), id),
  updateUserRank: (id, rank) =>
    userQ.updateRank.run(
      rank.tier || null,
      rank.division || null,
      rank.lp ?? null,
      rank.wins ?? null,
      rank.losses ?? null,
      Date.now(),
      id
    ),
  insertMessage,
  getRecentMessages,
  getLobbyState,
  setCaptains: (c1, c2) => lobbyQ.setCaptains.run(c1, c2),
  resetLobby: () => {
    lobbyQ.reset.run();
    teamQ.clear.run();
  },
  advanceDraft: (pickIndex, currentTurn) => lobbyQ.advance.run(pickIndex, currentTurn),
  setPhaseDone: () => lobbyQ.setPhaseDone.run(),
  resetTeams,
  addTeamMember,
  getTeams,
  isUserInTeam,
};
