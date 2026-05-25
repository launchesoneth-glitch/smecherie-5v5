// Snake draft 1-2-2-2-2-1 pentru 8 pickable players (10 total - 2 capitani)
//
// Pattern picks:
//   Pick #:  1  2  3  4  5  6  7  8
//   Cap:    C1 C2 C2 C1 C1 C2 C2 C1
//
// pickIndex e zero-based. La pickIndex == 8 draft-ul e gata.
const PICK_ORDER = [1, 2, 2, 1, 1, 2, 2, 1];
const TOTAL_PICKS = PICK_ORDER.length;

function captainForPick(pickIndex) {
  if (pickIndex < 0 || pickIndex >= TOTAL_PICKS) return null;
  return PICK_ORDER[pickIndex];
}

function isDraftDone(pickIndex) {
  return pickIndex >= TOTAL_PICKS;
}

// pentru un pick afisam pe ce echipa merge user-ul (acelasi cu capitanul curent)
function teamForPick(pickIndex) {
  return captainForPick(pickIndex);
}

module.exports = {
  PICK_ORDER,
  TOTAL_PICKS,
  captainForPick,
  teamForPick,
  isDraftDone,
};
