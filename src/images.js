// Slika za pogođeni pojam: nasumična slobodna fotografija sa Wikimedia Commons.
// Ništa se ne čuva u projektu; server samo zapamti link do slike za tu rundu (da svi vide istu).
// Ako server ne dobije sliku, browser svakog igrača pokuša sam (vidi index.html), a na kraju ostaje emoji.

const API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia traži da se aplikacija predstavi (ime + kontakt link)
const UA = 'Asocijacije/1.0 (https://github.com/aldinQAbalic/asocijacije)';
export const TIMEOUT_MS = 8000;
// Fajlovi koji nisu fotografija pojma (grbovi, zastave, potpisi, mape…)
const SKIP = /\b(logo|crest|badge|emblem|coat of arms|grb|flag|zastava|map|signature|autograph|icon|diagram|chart|stamp)\b/i;

export function searchUrl(query, bitmapOnly = true) {
  const p = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    generator: 'search', gsrsearch: bitmapOnly ? `${query} filetype:bitmap` : query, gsrnamespace: '6', gsrlimit: '30',
    prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '640',
    iiextmetadatafilter: 'Artist|LicenseShortName',
  });
  return `${API}?${p}`;
}

function clean(html, max) {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function pagesOf(json) {
  let pages = json && json.query && json.query.pages;
  if (!pages) return [];
  if (!Array.isArray(pages)) pages = Object.values(pages);   // stari format odgovora
  return pages.sort((a, b) => (a.index || 0) - (b.index || 0));
}

// Iz odgovora Commons API-ja izabere jednu odgovarajuću fotografiju (nasumično među prvih 15).
export function pickImage(json, rnd = Math.random) {
  const ok = pagesOf(json)
    .filter(p => {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || !ii.thumburl || !/^https:\/\/upload\.wikimedia\.org\//.test(ii.thumburl)) return false;
      if (!/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) return false;
      if ((ii.width || 0) < 300 || (ii.height || 0) < 200) return false;
      return !SKIP.test((p.title || '').replace(/[_.\-]/g, ' '));
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

async function getJson(url, fetchFn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchFn(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) return { status: 'http ' + r.status };
    return { json: await r.json() };
  } catch (e) {
    return { status: e && e.name === 'AbortError' ? 'isteklo vrijeme' : 'greška mreže' };
  } finally {
    clearTimeout(t);
  }
}

// Vraća { image: {url, page, author, license} | null, status: 'ok' | razlog }. Nikad ne baca grešku.
// Prvo traži samo fotografije; ako ništa ne nađe, traži bez tog filtera.
export async function findImage(query, fetchFn = fetch, rnd = Math.random) {
  if (!query) return { image: null, status: 'nema pojma za pretragu' };
  let last = 'nema rezultata';
  for (const bitmapOnly of [true, false]) {
    const r = await getJson(searchUrl(query, bitmapOnly), fetchFn);
    if (!r.json) return { image: null, status: r.status };   // mreža/HTTP greška: drugi pokušaj ne bi pomogao
    if (!pagesOf(r.json).length) { last = 'nema rezultata'; continue; }
    const image = pickImage(r.json, rnd);
    if (image) return { image, status: 'ok' };
    last = 'nema odgovarajuće slike';
  }
  return { image: null, status: last };
}
