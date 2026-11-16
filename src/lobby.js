// Lista otvorenih soba: jedan Durable Object za cijelu aplikaciju.
// Sobe mu same javljaju kad se otvore, napune, počnu igru ili isprazne.
import { DurableObject } from 'cloudflare:workers';

const STALE_MS = 3 * 3600_000;   // sigurnosno: sobu koja se dugo nije javila skloni
const MAX_LIST = 20;

export class Lobby extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/set' && request.method === 'POST') {
      const { code, entry } = await request.json();
      if (typeof code !== 'string' || !/^[A-Z0-9]{5}$/.test(code)) return new Response('bad', { status: 400 });
      if (entry) await this.ctx.storage.put('r:' + code, { ...entry, updated: Date.now() });
      else await this.ctx.storage.delete('r:' + code);
      return new Response('ok');
    }
    if (url.pathname === '/list') {
      const now = Date.now();
      const all = await this.ctx.storage.list({ prefix: 'r:' });
      const rooms = [], stale = [];
      for (const [k, v] of all) { if (now - v.updated > STALE_MS) stale.push(k); else rooms.push(v); }
      if (stale.length) await this.ctx.storage.delete(stale);
      rooms.sort((a, b) => b.updated - a.updated);
      // šalje se samo ono što početna stranica prikazuje
      const out = rooms.slice(0, MAX_LIST).map(r => ({ code: r.code, host: r.host, players: r.players, free: r.free, over: r.over, rounds: r.rounds, themes: r.themes || [] }));
      return new Response(JSON.stringify({ rooms: out }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    return new Response('not found', { status: 404 });
  }
}
