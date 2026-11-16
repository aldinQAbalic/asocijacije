// Tabela pobjeda: jedan Durable Object za cijelu aplikaciju.
// Soba mu javi rezultat kad se partija završi (samo ako su igrala bar 2 čovjeka).
// Igrači se prepoznaju po imenu: velika/mala slova, kvačice i razmaci se ne gledaju ("Aldin" = "aldin" = "ALDIN").
import { DurableObject } from 'cloudflare:workers';

const TOP = 10;
const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'juni', 'juli', 'august', 'septembar', 'oktobar', 'novembar', 'decembar'];

export function nameKey(name) {
  return String(name || '').toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 32);
}

// Mjesec po našem vremenu (Sarajevo), npr. "2026-11"
export function monthId(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sarajevo', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${p.find(x => x.type === 'year').value}-${p.find(x => x.type === 'month').value}`;
}
export const monthLabel = id => `${MONTHS[+id.slice(5, 7) - 1]} ${id.slice(0, 4)}`;
const MONTHS_IN = ['januaru', 'februaru', 'martu', 'aprilu', 'maju', 'junu', 'julu', 'augustu', 'septembru', 'oktobru', 'novembru', 'decembru'];
export const monthIn = id => 'u ' + MONTHS_IN[+id.slice(5, 7) - 1];

// Redoslijed: više pobjeda, pa manje partija (bolji omjer), pa više bodova
const byRank = (a, b) => b.wins - a.wins || a.games - b.games || b.points - a.points || a.name.localeCompare(b.name);

function table(list, meKey) {
  list.sort(byRank);
  const rows = list.map((r, i) => ({ rank: i + 1, name: r.name, wins: r.wins, games: r.games, points: r.points, finals: r.finals, me: r.key === meKey }));
  const me = meKey ? rows.find(r => r.me) || null : null;
  return { rows: rows.slice(0, TOP), me: me && me.rank > TOP ? me : null, myRank: me ? me.rank : null, myWins: me ? me.wins : 0 };
}

export class Stats extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/record' && request.method === 'POST') {
      const { players } = await request.json().catch(() => ({}));
      if (!Array.isArray(players) || players.length < 2 || players.length > 4) return new Response('bad', { status: 400 });
      const month = monthId();
      for (const p of players) {
        const key = nameKey(p && p.name);
        if (!key) continue;
        for (const prefix of ['a:', `m:${month}:`]) {
          const k = prefix + key;
          const r = (await this.ctx.storage.get(k)) || { key, name: p.name, wins: 0, games: 0, points: 0, finals: 0 };
          r.name = String(p.name).slice(0, 16);          // zadnje korišteno pisanje imena
          r.games += 1;
          if (p.win) r.wins += 1;
          r.points += Math.max(0, Math.floor(+p.points || 0));
          r.finals += Math.max(0, Math.floor(+p.finals || 0));
          await this.ctx.storage.put(k, r);
        }
      }
      return new Response('ok');
    }

    if (url.pathname === '/top') {
      const meKey = nameKey(url.searchParams.get('name'));
      const month = monthId();
      const all = [...(await this.ctx.storage.list({ prefix: 'a:' })).values()];
      const mon = [...(await this.ctx.storage.list({ prefix: `m:${month}:` })).values()];
      const out = { month: { id: month, label: monthLabel(month), in: monthIn(month), ...table(mon, meKey) }, all: table(all, meKey) };
      return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    }

    return new Response('not found', { status: 404 });
  }
}
