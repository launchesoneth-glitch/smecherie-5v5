// Voting in-memory pentru capitani
// Fiecare user are 1 vot. Click pe acelasi candidat = anuleaza votul.
// Voturile useri offline sunt sterse automat.

const votes = new Map(); // voterId -> candidateId

function castVote(voterId, candidateId) {
  if (!voterId || !candidateId) return;
  if (voterId === candidateId) return; // nu te poti vota singur
  const existing = votes.get(voterId);
  if (existing === candidateId) {
    // toggle off (acelasi candidat -> remove vote)
    votes.delete(voterId);
  } else {
    votes.set(voterId, candidateId);
  }
}

function clearVoter(voterId) {
  votes.delete(voterId);
}

// Daca un user iese din lobby, sterge votul ce-l avea pe el (nu mai are sens)
function clearVotesForCandidate(candidateId) {
  for (const [voter, cand] of votes.entries()) {
    if (cand === candidateId) votes.delete(voter);
  }
}

function reset() {
  votes.clear();
}

// returneaza Map<candidateId, count> sortat descrescator
function tallyVotes(onlineUserIds) {
  const onlineSet = new Set(onlineUserIds);
  const tally = new Map();
  for (const [voter, cand] of votes.entries()) {
    // ignoram voturile de la useri offline sau pentru candidati offline
    if (!onlineSet.has(voter) || !onlineSet.has(cand)) continue;
    tally.set(cand, (tally.get(cand) || 0) + 1);
  }
  return tally;
}

// Returneaza array [{ candidateId, count }] sortat desc
function getRanking(onlineUserIds) {
  const tally = tallyVotes(onlineUserIds);
  return Array.from(tally.entries())
    .map(([candidateId, count]) => ({ candidateId, count }))
    .sort((a, b) => b.count - a.count || a.candidateId - b.candidateId);
}

function getVoteOf(voterId) {
  return votes.get(voterId) || null;
}

// Determina capitanii: top 2 fara egalitate la pozitia 2
// Returneaza { c1, c2 } sau null daca conditia nu e indeplinita
function getTopTwo(onlineUserIds) {
  const r = getRanking(onlineUserIds);
  if (r.length < 2) return null;
  // verifica sa nu fie tie la pozitia 2 (positions 2 si 3 cu count egal)
  if (r.length >= 3 && r[1].count === r[2].count) return null;
  // si sa avem cel putin 1 vot (nu pornim cu 0 voturi)
  if (r[0].count < 1) return null;
  return { c1: r[0].candidateId, c2: r[1].candidateId };
}

function allOnlineVoted(onlineUserIds) {
  for (const uid of onlineUserIds) {
    if (!votes.has(uid)) return false;
  }
  return onlineUserIds.length > 0;
}

module.exports = {
  castVote,
  clearVoter,
  clearVotesForCandidate,
  reset,
  tallyVotes,
  getRanking,
  getVoteOf,
  getTopTwo,
  allOnlineVoted,
  // expune voturile (read-only) pt snapshot
  snapshot: (onlineUserIds) => {
    const tally = tallyVotes(onlineUserIds);
    const userVotes = {};
    for (const [voter, cand] of votes.entries()) {
      if (!onlineUserIds.includes(voter)) continue;
      userVotes[voter] = cand;
    }
    return {
      tally: Object.fromEntries(tally), // candidateId -> count
      userVotes, // voterId -> candidateId
    };
  },
};
