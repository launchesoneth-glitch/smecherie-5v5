// Scraper op.gg: extrage rank-ul (Solo Q) din meta description tag
// E sursa cea mai stabila pentru ca e meta SEO (nu se schimba la fiecare deploy frontend)
//
// Format meta:
//   "Name#TAG / Challenger 1 1932LP / 249Win 188Lose Win rate 57% / ..."
//   "Name#TAG / Unranked / ..."

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minute
const NEG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min daca a esuat
const FETCH_TIMEOUT_MS = 8000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const cache = new Map(); // opggUrl -> { data, fetched_at }

async function fetchHtml(url) {
  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

function parseRankFromMeta(html) {
  // Cauta meta description (sau og:description, sau twitter:description)
  const re = /<meta[^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]+content=["']([^"']+)["']/i;
  const m = html.match(re);
  if (!m) return null;
  const desc = m[1];
  if (/\/\s*Unranked\s*\//i.test(desc) || /\bUnranked\b/i.test(desc.split('/')[1] || '')) {
    return { tier: 'UNRANKED', division: null, lp: 0, wins: 0, losses: 0, raw: desc };
  }
  // Pattern: "/ <Tier> [Division] <LP>LP / <wins>Win <losses>Lose"
  const r = desc.match(
    /\/\s*(Iron|Bronze|Silver|Gold|Platinum|Emerald|Diamond|Master|Grandmaster|Challenger)(?:\s+(\d))?\s+(\d+)LP\s*\/\s*(\d+)\s*Win\s+(\d+)\s*Lose/i
  );
  if (!r) return null;
  return {
    tier: r[1].toUpperCase(),
    division: r[2] ? parseInt(r[2], 10) : null,
    lp: parseInt(r[3], 10),
    wins: parseInt(r[4], 10),
    losses: parseInt(r[5], 10),
    raw: desc,
  };
}

async function fetchRank(opggUrl, { force = false } = {}) {
  const cached = cache.get(opggUrl);
  const now = Date.now();
  if (!force && cached) {
    const ttl = cached.data ? CACHE_TTL_MS : NEG_CACHE_TTL_MS;
    if (now - cached.fetched_at < ttl) return cached.data;
  }
  const html = await fetchHtml(opggUrl);
  let rank = null;
  if (html) {
    rank = parseRankFromMeta(html);
  }
  cache.set(opggUrl, { data: rank, fetched_at: now });
  return rank;
}

// Format afisare: "G 4 (250 LP)" sau "Diamond 2" sau "Master 145 LP" sau "Unranked"
function formatRank(rank) {
  if (!rank) return null;
  if (rank.tier === 'UNRANKED') return 'Unranked';
  const tierShort = {
    IRON: 'Iron',
    BRONZE: 'Bronze',
    SILVER: 'Silver',
    GOLD: 'Gold',
    PLATINUM: 'Platinum',
    EMERALD: 'Emerald',
    DIAMOND: 'Diamond',
    MASTER: 'Master',
    GRANDMASTER: 'GM',
    CHALLENGER: 'Challenger',
  }[rank.tier] || rank.tier;
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(rank.tier);
  if (apex) {
    return `${tierShort} ${rank.lp ?? 0} LP`;
  }
  return `${tierShort} ${rank.division ?? ''}`.trim();
}

module.exports = { fetchRank, parseRankFromMeta, formatRank };
