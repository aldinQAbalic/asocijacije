// Slika za pogođeni pojam: nasumična slobodna fotografija sa Wikimedia Commons.
// Ništa se ne čuva u projektu; server samo zapamti link do slike za tu rundu (da svi vide istu).
// Ako Commons ne odgovori ili nema dobre slike, igra prikaže emoji (E iz puzzles.js).

const API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia traži da se aplikacija predstavi
const UA = 'Asocijacije/1.0 (https://github.com/aldinQAbalic/asocijacije)';
// Fajlovi koji nisu fotografija pojma (grbovi, zastave, potpisi, mape…)
const SKIP = /logo|crest|badge|emblem|coat[ _]of[ _]arms|grb|flag|zastava|map|signature|autograph|kit|icon|diagram|chart|stamp|ticket|poster|card/i;

export function searchUrl(query) {
  const p = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '25',
    prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '640',
    iiextmetadatafilter: 'Artist|LicenseShortName',
  });
  return `${API}?${p}`;
}

function clean(html, max) {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Iz odgovora Commons API-ja izabere jednu odgovarajuću fotografiju (nasumično među prvih 15).
export function pickImage(json, rnd = Math.random) {
  let pages = json && json.query && json.query.pages;
  if (!pages) return null;
  if (!Array.isArray(pages)) pages = Object.values(pages);   // stari format odgovora
  const ok = pages
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .filter(p => {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || !ii.thumburl || !/^https:\/\/upload\.wikimedia\.org\//.test(ii.thumburl)) return false;
      if (!/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) return false;
      if ((ii.width || 0) < 400 || (ii.height || 0) < 300) return false;
      return !SKIP.test(p.title || '');
    })
    .slice(0, 15);
  if (!ok.length) return null;
  const p = ok[Math.floor(rnd() * ok.length)], ii = p.imageinfo[0], meta = ii.extmetadata || {};
  return {
    url: ii.thumburl,
    page: /^https:\/\/commons\.wikimedia\.org\//.test(ii.descriptionurl || '') ? ii.descriptionurl : null,
    author: clean(meta.Artist && meta.Artist.value, 60) || null,
    license: clean(meta.LicenseShortName && meta.LicenseShortName.value, 30) || null,
  };
}

// Vraća {url, page, author, license} ili null. Nikad ne baca grešku i ne čeka duže od ~4 s.
export async function findImage(query, fetchFn = fetch, rnd = Math.random) {
  if (!query) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetchFn(searchUrl(query), { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return pickImage(await r.json(), rnd);
  } catch {
    return null;
  }
}
