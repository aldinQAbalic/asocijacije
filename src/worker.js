// Ulaz u aplikaciju: servira stranicu, pravi sobe i prosljeđuje WebSocket u sobu (Durable Object).
import html from './index.html';
import icon192 from './assets/icon-192.png';
import icon512 from './assets/icon-512.png';
import iconMask from './assets/icon-maskable.png';
import appleIcon from './assets/apple-touch-icon.png';
import swCode from './sw.txt';
import { THEMES, LEVELS, PUZZLES } from './puzzles.js';
export { Room } from './room.js';
export { Lobby } from './lobby.js';
export { Stats } from './stats.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez 0/O i 1/I zabune
const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const MANIFEST = JSON.stringify({
  name: 'Asocijacije',
  short_name: 'Asocijacije',
  description: 'Online Asocijacije s prijateljima',
  lang: 'bs',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0a1633',
  theme_color: '#0a1633',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});

const STATIC = {
  '/icon-192.png': [icon192, 'image/png'],
  '/icon-512.png': [icon512, 'image/png'],
  '/icon-maskable.png': [iconMask, 'image/png'],
  '/apple-touch-icon.png': [appleIcon, 'image/png'],
  '/manifest.webmanifest': [MANIFEST, 'application/manifest+json'],
};

const THEME_LIST = Object.entries(THEMES).map(([id, label]) => ({ id, label, count: PUZZLES.filter(p => p.T === id).length }));
const LEVEL_LIST = Object.entries(LEVELS).map(([id, label]) => ({ id, label, count: PUZZLES.filter(p => (p.L || 'lako') === id).length }));

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return [...b].map(x => CODE_CHARS[x % CODE_CHARS.length]).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/rooms' && request.method === 'POST') {
      // izbor tema s početne stranice (soba sama provjeri da su ispravne)
      const text = await request.text().catch(() => '');
      let body = {};
      if (text.length < 1000) { try { body = JSON.parse(text) || {}; } catch {} }
      const init = JSON.stringify({ themes: Array.isArray(body.themes) ? body.themes.slice(0, 20) : [], levels: Array.isArray(body.levels) ? body.levels.slice(0, 10) : [], rounds: Number.isInteger(body.rounds) ? body.rounds : undefined });
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch('https://room/init', { method: 'POST', body: init });
        if (r.status === 201) return json({ code }, 201);
      }
      return json({ error: 'Nije uspjelo praviti sobu, pokušaj ponovo' }, 503);
    }

    if (path === '/api/open' && request.method === 'GET') {
      const r = await env.LOBBY.get(env.LOBBY.idFromName('main')).fetch('https://lobby/list');
      // uz listu soba ide i lista tema (za izbor na početnoj stranici)
      return json({ ...(await r.json()), themes: THEME_LIST, levels: LEVEL_LIST });
    }

    if (path === '/api/top' && request.method === 'GET') {
      const name = (url.searchParams.get('name') || '').slice(0, 40);
      const r = await env.STATS.get(env.STATS.idFromName('main')).fetch('https://stats/top?name=' + encodeURIComponent(name));
      return json(await r.json());
    }

    const info = path.match(/^\/api\/rooms\/([^/]+)$/);
    if (info && request.method === 'GET') {
      const code = info[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'Neispravan kod sobe' }, 400);
      const r = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch('https://room/exists');
      return r.status === 200 ? json({ code }) : json({ error: 'Soba ne postoji ili je istekla' }, 404);
    }

    const ws = path.match(/^\/ws\/([^/]+)$/);
    if (ws) {
      const code = ws[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'Neispravan kod sobe' }, 400);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Očekivan WebSocket' }, 426);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(request);
    }

    if (STATIC[path]) {
      const [body, type] = STATIC[path];
      return new Response(body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' } });
    }
    if (path === '/sw.js') {
      // service worker se ne smije dugo keširati, inače nove verzije kasne
      return new Response(swCode, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' } });
    }

    if (path.startsWith('/api/')) return json({ error: 'Ne postoji' }, 404);

    // Sve ostalo (/, /ABCDE) je ista stranica; kod sobe čita browser iz adrese.
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
    });
  },
};
