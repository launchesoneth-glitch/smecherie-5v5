require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const buildSession = require('./session');
const { loadUser } = require('./middleware');
const authRoutes = require('./routes/auth');
const lobbyRoutes = require('./routes/lobby');
const adminRoutes = require('./routes/admin');
const presence = require('./presence');
const { registerChatHandlers } = require('./sockets/chat');
const { registerDraftHandlers } = require('./sockets/draft');
const { registerVoteHandlers, maybeAutoStart } = require('./sockets/vote');
const voting = require('./voting');
const { touchUser, getUserById } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

const sessionMiddleware = buildSession();
app.use(express.json({ limit: '64kb' }));
app.use(sessionMiddleware);
app.use(loadUser);

// API
app.use('/api', authRoutes);
app.use('/api', lobbyRoutes);
app.use('/api/admin', adminRoutes);

// Static frontend
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Healthcheck
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Socket.io: share session middleware
io.engine.use(sessionMiddleware);

io.on('connection', (socket) => {
  const req = socket.request;
  const userId = req.session && req.session.userId;
  if (!userId) {
    socket.emit('error', { message: 'Nelogat' });
    socket.disconnect(true);
    return;
  }
  const user = getUserById(userId);
  if (!user) {
    socket.disconnect(true);
    return;
  }
  socket.userId = userId;
  touchUser(userId);
  presence.add(socket.id, userId);

  // Broadcast snapshot updates
  io.emit('lobby:state', presence.getLobbySnapshot());

  // Refetch rank in background daca e vechi (>15 min) sau lipseste
  const STALE_MS = 15 * 60 * 1000;
  if (!user.rank_fetched_at || Date.now() - user.rank_fetched_at > STALE_MS) {
    const { fetchRank } = require('./lib/opggScraper');
    const { updateUserRank } = require('./db');
    fetchRank(user.opgg_url)
      .then((rank) => {
        if (rank) {
          updateUserRank(user.id, rank);
          io.emit('lobby:state', presence.getLobbySnapshot());
        }
      })
      .catch(() => {});
  }

  registerChatHandlers(io, socket);
  registerDraftHandlers(io, socket);
  registerVoteHandlers(io, socket);

  socket.on('lobby:request', () => {
    socket.emit('lobby:state', presence.getLobbySnapshot());
  });

  socket.on('disconnect', () => {
    const wasUserId = presence.remove(socket.id);
    // daca utilizatorul nu mai are sockets active, sterge votul lui si voturile pt el
    if (wasUserId && !presence.isOnline(wasUserId)) {
      voting.clearVoter(wasUserId);
      voting.clearVotesForCandidate(wasUserId);
    }
    io.emit('lobby:state', presence.getLobbySnapshot());
    maybeAutoStart(io);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[5v5 pe Smecherie] online pe http://localhost:${PORT}`);
});
