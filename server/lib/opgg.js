// Validare + normalizare link op.gg
const REGIONS = ['na', 'euw', 'eune', 'kr', 'br', 'jp', 'oce', 'ru', 'tr', 'las', 'lan', 'sg', 'ph', 'tw', 'vn', 'th'];

function validateOpgg(url) {
  if (typeof url !== 'string') return { ok: false, error: 'Link invalid' };
  let raw = url.trim();
  if (!raw) return { ok: false, error: 'Lipseste linkul de op.gg' };

  // adauga https daca lipseste
  if (!/^https?:\/\//i.test(raw)) {
    raw = 'https://' + raw;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (e) {
    return { ok: false, error: 'Linkul nu e un URL valid' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'op.gg') {
    return { ok: false, error: 'Linkul trebuie sa fie de pe op.gg' };
  }

  // path-uri acceptate:
  //   /summoners/{region}/{name}
  //   /lol/summoners/{region}/{name}
  const parts = parsed.pathname.split('/').filter(Boolean);
  let region, name;
  if (parts[0] === 'summoners' && parts.length >= 3) {
    region = parts[1];
    name = parts.slice(2).join('/');
  } else if (parts[0] === 'lol' && parts[1] === 'summoners' && parts.length >= 4) {
    region = parts[2];
    name = parts.slice(3).join('/');
  } else {
    return {
      ok: false,
      error: 'Format invalid. Exemplu: https://op.gg/lol/summoners/euw/NumeJucator-1234',
    };
  }

  region = region.toLowerCase();
  if (!REGIONS.includes(region)) {
    return { ok: false, error: 'Regiune necunoscuta: ' + region };
  }
  if (!name) {
    return { ok: false, error: 'Lipseste numele summonerului in link' };
  }

  // Normalize: scheme + host curat
  const normalized = `https://op.gg/lol/summoners/${region}/${name}`;
  return { ok: true, url: normalized, region, name };
}

module.exports = { validateOpgg, REGIONS };
