const voting = require('../voting');
const { onlineUserIds, getLobbySnapshot } = require('../presence');
const { getLobbyState, setCaptains, getUserById } = require('../db');

const REQUIRED_PLAYERS = 10;

// Verifica daca putem porni draftul automat si o face
function maybeAutoStart(io) {
  const ids = onlineUserIds();
  const lobby = getLobbyState();
  if (lobby.phase !== 'idle') return false;
  if (ids.length !== REQUIRED_PLAYERS) return false;
  if (!voting.allOnlineVoted(ids)) return false;
  const top = voting.getTopTwo(ids);
  if (!top) return false;
  setCaptains(top.c1, top.c2);
  voting.reset(); // sterge voturile (nu mai sunt necesare in faza de draft)
  const c1 = getUserById(top.c1);
  const c2 = getUserById(top.c2);
  io.emit('draft:auto-started', {
    captain1: { id: c1.id, username: c1.username },
    captain2: { id: c2.id, username: c2.username },
  });
  io.emit('lobby:state', getLobbySnapshot());
  return true;
}

function registerVoteHandlers(io, socket) {
  socket.on('vote:cast', ({ candidateId } = {}) => {
    const cid = parseInt(candidateId, 10);
    if (!cid) return socket.emit('error', { message: 'Candidat invalid' });
    const ids = onlineUserIds();
    if (!ids.includes(cid)) {
      return socket.emit('error', { message: 'Candidatul nu e in lobby' });
    }
    const lobby = getLobbyState();
    if (lobby.phase !== 'idle') {
      return socket.emit('error', { message: 'Voting-ul nu e disponibil acum' });
    }
    voting.castVote(socket.userId, cid);
    io.emit('lobby:state', getLobbySnapshot());
    maybeAutoStart(io);
  });
}

module.exports = { registerVoteHandlers, maybeAutoStart, REQUIRED_PLAYERS };
