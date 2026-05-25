// State global pt frontend
const state = {
  me: null,
  users: [],
  lobby: { phase: 'idle', captain1_id: null, captain2_id: null, current_turn: null, pick_index: 0 },
  teams: { team1: [], team2: [] },
  voting: { tally: {}, userVotes: {} }, // tally: { candidateId: count }, userVotes: { voterId: candidateId }
};

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function toast(msg, kind = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast toast-' + kind;
  t.hidden = false;
  clearTimeout(toast._tid);
  toast._tid = setTimeout(() => { t.hidden = true; }, 3500);
}

// ===== Rank helpers =====
const TIER_COLORS = {
  IRON: '#5d5752',
  BRONZE: '#a07746',
  SILVER: '#9ba1a8',
  GOLD: '#d4af37',
  PLATINUM: '#4eb6a8',
  EMERALD: '#0fae67',
  DIAMOND: '#b09cff',
  MASTER: '#9d4dca',
  GRANDMASTER: '#e84057',
  CHALLENGER: '#f4c84a',
  UNRANKED: '#666',
};

function rankBadge(rank) {
  if (!rank || !rank.tier) {
    return `<span class="rank rank-unknown" title="Rank necunoscut">?</span>`;
  }
  if (rank.tier === 'UNRANKED') {
    return `<span class="rank rank-unranked">UR</span>`;
  }
  const t = rank.tier;
  const short = {
    IRON: 'I', BRONZE: 'B', SILVER: 'S', GOLD: 'G', PLATINUM: 'P',
    EMERALD: 'E', DIAMOND: 'D', MASTER: 'M', GRANDMASTER: 'GM', CHALLENGER: 'C',
  }[t] || '?';
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(t);
  const labelInner = apex ? `${short}` : `${short}${rank.division ?? ''}`;
  const tooltip = apex
    ? `${t} ${rank.lp ?? 0} LP`
    : `${t} ${rank.division ?? ''}${rank.lp != null ? ' • ' + rank.lp + ' LP' : ''}`;
  return `<span class="rank rank-${t.toLowerCase()}" style="background:${TIER_COLORS[t] || '#666'}" title="${escapeHtml(tooltip)}">${labelInner}</span>`;
}

function rankFullLabel(rank) {
  if (!rank || !rank.tier) return 'Necunoscut';
  if (rank.tier === 'UNRANKED') return 'Unranked';
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(rank.tier);
  const t = rank.tier.charAt(0) + rank.tier.slice(1).toLowerCase();
  if (apex) return `${t} • ${rank.lp ?? 0} LP`;
  return `${t} ${rank.division ?? ''}${rank.lp != null ? ' • ' + rank.lp + ' LP' : ''}`;
}

async function init() {
  const meRes = await fetch('/api/me');
  if (!meRes.ok) {
    window.location.href = '/';
    return;
  }
  state.me = await meRes.json();
  $('me-username').textContent = state.me.username;
  if (state.me.is_admin) {
    $('me-badge').hidden = false;
    $('admin-panel').hidden = false;
  }

  $('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

  setupChat();
  setupAdmin();
  setupModal();
  connectSocket();
}

// ===== Socket =====
let socket;
function connectSocket() {
  socket = io({ withCredentials: true });

  socket.on('connect', () => {
    socket.emit('lobby:request');
  });

  socket.on('error', (err) => {
    toast(err?.message || 'Eroare', 'error');
  });

  socket.on('lobby:state', (snap) => {
    state.users = snap.users || [];
    state.lobby = snap.state || state.lobby;
    state.teams = snap.teams || { team1: [], team2: [] };
    state.voting = snap.voting || { tally: {}, userVotes: {} };
    renderAll();
  });

  socket.on('chat:history', (msgs) => {
    const box = $('chat-messages');
    box.innerHTML = '';
    msgs.forEach(renderMessage);
    scrollChat();
  });

  socket.on('chat:message', (msg) => {
    renderMessage(msg);
    scrollChat();
  });

  socket.on('draft:pick:made', (info) => {
    toast(`Pick: ${info.user.username} -> Team ${info.team}`, 'success');
  });

  socket.on('draft:auto-started', (info) => {
    toast(`Draft pornit! Capitani: ${info.captain1.username} vs ${info.captain2.username}`, 'success');
  });
}

// ===== Chat =====
function setupChat() {
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const content = input.value.trim();
    if (!content) return;
    socket.emit('chat:send', { content });
    input.value = '';
  });
}

function renderMessage(msg) {
  const box = $('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg' + (msg.is_admin ? ' msg-admin' : '');
  const time = new Date(msg.created_at).toLocaleTimeString('ro-RO', {
    hour: '2-digit', minute: '2-digit'
  });
  div.innerHTML =
    `<span class="msg-time">${time}</span>` +
    `<span class="msg-user">${escapeHtml(msg.username)}${msg.is_admin ? ' &#x1F451;' : ''}:</span> ` +
    `<span class="msg-content">${escapeHtml(msg.content)}</span>`;
  box.appendChild(div);
}

function scrollChat() {
  const box = $('chat-messages');
  box.scrollTop = box.scrollHeight;
}

// ===== Render =====
function renderAll() {
  renderPlayers();
  renderVotingInfo();
  renderPhase();
  renderAdminControls();
}

function renderVotingInfo() {
  const total = state.users.length;
  const voted = Object.keys(state.voting.userVotes || {}).length;
  $('vote-progress').textContent = `${voted}/${total}`;
  $('voting-info').hidden = state.lobby.phase !== 'idle';
}

function renderPlayers() {
  const list = $('players-list');
  list.innerHTML = '';
  $('player-count').textContent = state.users.length;
  const inTeamIds = new Set([
    ...state.teams.team1.map((p) => p.user_id),
    ...state.teams.team2.map((p) => p.user_id),
  ]);
  const myVote = state.me ? state.voting.userVotes?.[state.me.id] : null;
  const showVote = state.lobby.phase === 'idle';

  state.users.forEach((u) => {
    const li = document.createElement('li');
    li.className = 'player-row';
    if (state.lobby.captain1_id === u.id) li.classList.add('is-cap1');
    if (state.lobby.captain2_id === u.id) li.classList.add('is-cap2');
    if (inTeamIds.has(u.id)) li.classList.add('is-picked');
    if (state.me && u.id === state.me.id) li.classList.add('is-me');

    const voteCount = state.voting.tally?.[u.id] || 0;
    const iVotedForThis = myVote === u.id;
    const canVoteForThis = state.me && u.id !== state.me.id && showVote;

    const voteBtnHtml = showVote
      ? `<button class="vote-btn ${iVotedForThis ? 'voted' : ''}" data-vote-user="${u.id}" ${
          canVoteForThis ? '' : 'disabled'
        } title="${iVotedForThis ? 'Click sa anulezi votul' : 'Voteaza captain'}">
          ${iVotedForThis ? '\u2713' : '\u261D'}
          <span class="vote-count">${voteCount}</span>
        </button>`
      : '';

    li.innerHTML = `
      ${voteBtnHtml}
      ${rankBadge(u.rank)}
      <span class="player-name" data-player-id="${u.id}">${escapeHtml(u.username)}${u.is_admin ? ' &#x1F451;' : ''}</span>
      <a class="opgg-link" href="${escapeHtml(u.opgg_url)}" target="_blank" rel="noopener">op.gg</a>
    `;

    // Vote button click
    const voteBtn = li.querySelector('.vote-btn');
    if (voteBtn && canVoteForThis) {
      voteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        socket.emit('vote:cast', { candidateId: u.id });
      });
    }

    // Click pe nume -> player modal
    const nameEl = li.querySelector('.player-name');
    nameEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlayerModal(u.id);
    });
    nameEl.style.cursor = 'pointer';

    list.appendChild(li);
  });
}

function renderAdminControls() {
  if (!state.me?.is_admin) return;
  // Buton "Forteaza start" - activ daca avem >= 2 candidati cu voturi
  const tally = state.voting.tally || {};
  const candidates = Object.entries(tally).filter(([, c]) => c > 0);
  const btn = $('force-start-btn');
  if (btn) {
    btn.disabled = candidates.length < 2 || state.lobby.phase !== 'idle';
  }
}

// ===== Phase rendering (draft + final) =====
function renderPhase() {
  $('draft-idle').hidden = state.lobby.phase !== 'idle';
  $('draft-active').hidden = state.lobby.phase !== 'drafting';
  $('draft-done').hidden = state.lobby.phase !== 'done';

  if (state.lobby.phase === 'drafting') renderDraft();
  if (state.lobby.phase === 'done') renderTeamsFinal();
}

function userById(id) {
  return state.users.find((u) => u.id === id);
}

function renderDraft() {
  const cap1 = userById(state.lobby.captain1_id);
  const cap2 = userById(state.lobby.captain2_id);
  $('team1-captain').innerHTML = cap1
    ? `<span class="cap-label">CAPTAIN:</span> ${rankBadge(cap1.rank)} ${escapeHtml(cap1.username)} <a href="${escapeHtml(cap1.opgg_url)}" target="_blank">op.gg</a>`
    : '';
  $('team2-captain').innerHTML = cap2
    ? `<span class="cap-label">CAPTAIN:</span> ${rankBadge(cap2.rank)} ${escapeHtml(cap2.username)} <a href="${escapeHtml(cap2.opgg_url)}" target="_blank">op.gg</a>`
    : '';

  const renderTeam = (listEl, members) => {
    listEl.innerHTML = '';
    members.forEach((m) => {
      const u = userById(m.user_id);
      const li = document.createElement('li');
      li.innerHTML = `<span class="pick-num">#${m.pick_order}</span> ${rankBadge(u?.rank)} ${escapeHtml(m.username)} <a href="${escapeHtml(m.opgg_url)}" target="_blank">op.gg</a>`;
      listEl.appendChild(li);
    });
  };
  renderTeam($('team1-members'), state.teams.team1);
  renderTeam($('team2-members'), state.teams.team2);

  const turnTeam = state.lobby.current_turn;
  const turnCap = turnTeam === 1 ? cap1 : cap2;
  $('turn-cap').textContent = turnCap ? turnCap.username + ' (Team ' + turnTeam + ')' : '-';
  $('pick-num').textContent = (state.lobby.pick_index || 0) + 1;

  const myTurn =
    state.me &&
    ((turnTeam === 1 && state.lobby.captain1_id === state.me.id) ||
      (turnTeam === 2 && state.lobby.captain2_id === state.me.id));
  $('pick-prompt').hidden = !myTurn;

  const pickedIds = new Set([
    state.lobby.captain1_id,
    state.lobby.captain2_id,
    ...state.teams.team1.map((p) => p.user_id),
    ...state.teams.team2.map((p) => p.user_id),
  ]);
  const pickable = state.users.filter((u) => !pickedIds.has(u.id));
  const box = $('pickable-list');
  box.innerHTML = '';
  pickable.forEach((u) => {
    const btn = document.createElement('button');
    btn.className = 'pick-btn';
    btn.disabled = !myTurn;
    btn.innerHTML = `${rankBadge(u.rank)} ${escapeHtml(u.username)} <a class="opgg-link" href="${escapeHtml(u.opgg_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">op.gg</a>`;
    btn.addEventListener('click', () => {
      socket.emit('draft:pick', { targetUserId: u.id });
    });
    box.appendChild(btn);
  });
}

function renderTeamsFinal() {
  const cap1 = userById(state.lobby.captain1_id);
  const cap2 = userById(state.lobby.captain2_id);
  const renderFinal = (listEl, captain, members) => {
    listEl.innerHTML = '';
    if (captain) {
      const li = document.createElement('li');
      li.className = 'final-cap';
      li.innerHTML = `&#x1F451; ${rankBadge(captain.rank)} <strong>${escapeHtml(captain.username)}</strong> <a href="${escapeHtml(captain.opgg_url)}" target="_blank">op.gg</a>`;
      listEl.appendChild(li);
    }
    members.forEach((m) => {
      const u = userById(m.user_id);
      const li = document.createElement('li');
      li.innerHTML = `${rankBadge(u?.rank)} ${escapeHtml(m.username)} <a href="${escapeHtml(m.opgg_url)}" target="_blank">op.gg</a>`;
      listEl.appendChild(li);
    });
  };
  renderFinal($('final-team1'), cap1, state.teams.team1);
  renderFinal($('final-team2'), cap2, state.teams.team2);
}

// ===== Admin =====
function setupAdmin() {
  $('force-start-btn').addEventListener('click', async () => {
    // Folosim top 2 din tally curent
    const tally = state.voting.tally || {};
    const sorted = Object.entries(tally)
      .map(([id, c]) => ({ id: parseInt(id, 10), c }))
      .sort((a, b) => b.c - a.c || a.id - b.id);
    if (sorted.length < 2) return toast('Nu sunt destule voturi', 'error');
    const c1 = sorted[0].id;
    const c2 = sorted[1].id;
    if (!confirm(`Pornesc draftul cu top 2 voturi?\n${userById(c1)?.username} vs ${userById(c2)?.username}`)) return;
    const res = await fetch('/api/admin/captains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captain1Id: c1, captain2Id: c2 }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error || 'Eroare', 'error');
    }
  });

  $('reset-btn').addEventListener('click', async () => {
    if (!confirm('Sigur faci reset la lobby? Pierzi echipele actuale si voturile.')) return;
    const res = await fetch('/api/admin/reset', { method: 'POST' });
    if (!res.ok) toast('Reset esuat', 'error');
  });
}

// ===== Player Modal =====
function setupModal() {
  const modal = $('player-modal');
  modal.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => { modal.hidden = true; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') modal.hidden = true;
  });
}

async function openPlayerModal(userId) {
  const modal = $('player-modal');
  modal.hidden = false;
  // loading state
  $('pm-username').textContent = 'Loading...';
  $('pm-rank').textContent = '...';
  $('pm-wl').textContent = '...';
  $('pm-opgg').textContent = '...';
  $('pm-opgg').removeAttribute('href');
  $('pm-since').textContent = '...';
  $('pm-created').textContent = '...';
  $('pm-votes').textContent = '...';
  $('pm-team').textContent = '...';
  $('pm-lastmsg').textContent = '...';

  try {
    const res = await fetch(`/api/player/${userId}`);
    if (!res.ok) {
      toast('Nu pot incarca info-ul jucatorului', 'error');
      modal.hidden = true;
      return;
    }
    const d = await res.json();
    $('pm-username').textContent = d.username;
    $('pm-admin-badge').hidden = !d.is_admin;
    const onBadge = $('pm-online-badge');
    onBadge.textContent = d.online ? 'ONLINE' : 'OFFLINE';
    onBadge.className = 'badge ' + (d.online ? 'badge-online-on' : 'badge-online');

    if (d.rank && d.rank.tier) {
      $('pm-rank').innerHTML = `${rankBadge(d.rank)} <span>${escapeHtml(rankFullLabel(d.rank))}</span>`;
      if (d.rank.wins != null && d.rank.losses != null) {
        const total = d.rank.wins + d.rank.losses;
        const wr = total > 0 ? Math.round((d.rank.wins / total) * 100) : 0;
        $('pm-wl').textContent = `${d.rank.wins}W / ${d.rank.losses}L (${wr}% WR)`;
      } else {
        $('pm-wl').textContent = '-';
      }
    } else {
      $('pm-rank').textContent = 'Necunoscut (inca se incarca de pe op.gg?)';
      $('pm-wl').textContent = '-';
    }

    $('pm-opgg').textContent = d.opgg_url;
    $('pm-opgg').href = d.opgg_url;
    $('pm-since').textContent = d.in_lobby_since ? new Date(d.in_lobby_since).toLocaleString('ro-RO') : '-';
    $('pm-created').textContent = d.created_at ? new Date(d.created_at).toLocaleString('ro-RO') : '-';
    $('pm-votes').textContent = d.captain_votes_received;
    $('pm-team').textContent = d.team
      ? `Team ${d.team.team_num} (pick #${d.team.pick_order})`
      : '-';
    $('pm-lastmsg').textContent = d.last_message
      ? `"${d.last_message.content}" (${new Date(d.last_message.created_at).toLocaleString('ro-RO')})`
      : '-';
  } catch (e) {
    toast('Eroare la incarcare', 'error');
    modal.hidden = true;
  }
}

init();
