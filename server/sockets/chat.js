const { insertMessage, getRecentMessages, getUserById } = require('../db');

// Rate limit: max 5 msg / 10s per user
const userTimestamps = new Map(); // userId -> [timestamps]

function canSend(userId) {
  const now = Date.now();
  const arr = (userTimestamps.get(userId) || []).filter((t) => now - t < 10000);
  if (arr.length >= 5) return false;
  arr.push(now);
  userTimestamps.set(userId, arr);
  return true;
}

function registerChatHandlers(io, socket) {
  // trimite ultimele 100 msg la connect
  socket.emit('chat:history', getRecentMessages(100));

  socket.on('chat:send', (payload) => {
    const { content } = payload || {};
    if (typeof content !== 'string') return;
    const trimmed = content.trim().slice(0, 500);
    if (!trimmed) return;
    if (!canSend(socket.userId)) {
      socket.emit('error', { message: 'Prea multe mesaje, mai incet' });
      return;
    }
    const user = getUserById(socket.userId);
    if (!user) return;
    const saved = insertMessage(user.id, trimmed);
    io.emit('chat:message', {
      id: saved.id,
      content: trimmed,
      created_at: saved.created_at,
      username: user.username,
      is_admin: !!user.is_admin,
    });
  });
}

module.exports = { registerChatHandlers };
