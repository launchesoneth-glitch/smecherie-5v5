const {
  getLobbyState,
  getUserById,
  addTeamMember,
  advanceDraft,
  setPhaseDone,
  isUserInTeam,
} = require('../db');
const { isOnline, getLobbySnapshot } = require('../presence');
const { captainForPick, isDraftDone, TOTAL_PICKS } = require('../lib/draftEngine');

function registerDraftHandlers(io, socket) {
  socket.on('draft:pick', ({ targetUserId } = {}) => {
    const state = getLobbyState();
    if (state.phase !== 'drafting') {
      return socket.emit('error', { message: 'Draftul nu e activ' });
    }
    const pickIdx = state.pick_index || 0;
    if (isDraftDone(pickIdx)) {
      return socket.emit('error', { message: 'Draftul e gata' });
    }
    const expectedTeam = captainForPick(pickIdx);
    const expectedCaptainId = expectedTeam === 1 ? state.captain1_id : state.captain2_id;
    if (socket.userId !== expectedCaptainId) {
      return socket.emit('error', { message: 'Nu e tura ta sa alegi' });
    }
    const targetId = parseInt(targetUserId, 10);
    if (!targetId) return socket.emit('error', { message: 'Target invalid' });
    if (targetId === state.captain1_id || targetId === state.captain2_id) {
      return socket.emit('error', { message: 'Capitanii nu pot fi pickati' });
    }
    if (isUserInTeam(targetId)) {
      return socket.emit('error', { message: 'Jucator deja intr-o echipa' });
    }
    if (!isOnline(targetId)) {
      return socket.emit('error', { message: 'Jucator offline' });
    }
    const target = getUserById(targetId);
    if (!target) return socket.emit('error', { message: 'Jucator inexistent' });

    // Persist
    addTeamMember(target.id, expectedTeam, pickIdx + 1);
    const newPickIdx = pickIdx + 1;
    const nextCaptainTeam = isDraftDone(newPickIdx) ? null : captainForPick(newPickIdx);
    advanceDraft(newPickIdx, nextCaptainTeam);

    if (isDraftDone(newPickIdx)) {
      setPhaseDone();
    }

    io.emit('lobby:state', getLobbySnapshot());
    io.emit('draft:pick:made', {
      pickIndex: pickIdx,
      team: expectedTeam,
      user: { id: target.id, username: target.username, opgg_url: target.opgg_url },
    });
  });
}

module.exports = { registerDraftHandlers, TOTAL_PICKS };
