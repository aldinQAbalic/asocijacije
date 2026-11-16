// Test preko prave mreže: wrangler dev mora biti pokrenut (npm run dev).
import assert from 'node:assert';
import { PUZZLES } from '../src/puzzles.js';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const WSB = BASE.replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client(code, pid, name) {
  const ws = new WebSocket(`${WSB}/ws/${code}`);
  const c = { ws, state: null, errors: [], states: 0, reacts: [], raw: [] };
  c.ready = new Promise(r => ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', pid, name })); r(); });
  ws.onmessage = e => { c.raw.push(e.data); const m = JSON.parse(e.data); if (m.t === 'state') { c.state = m; c.states++; } else if (m.t === 'error') c.errors.push(m.message); else if (m.t === 'react') c.reacts.push(m); };
  c.send = o => ws.send(JSON.stringify(o));
  c.until = async (fn, ms = 6000) => { const t = Date.now(); while (!(c.state && fn(c.state))) { if (Date.now() - t > ms) throw new Error('timeout'); await sleep(20); } return c.state; };
  return c;
}

// HTTP provjere
let r = await fetch(`${BASE}/api/rooms/abc`); assert.equal(r.status, 400);
r = await fetch(`${BASE}/api/rooms/ZZZZZ`); assert.equal(r.status, 404);
r = await fetch(`${BASE}/api/nesto`); assert.equal(r.status, 404);
r = await fetch(`${BASE}/ws/ZZZZZ`); assert.equal(r.status, 426);
r = await fetch(`${BASE}/manifest.webmanifest`); assert.equal(r.status, 200);
r = await fetch(`${BASE}/icon-192.png`); assert.equal(r.headers.get('content-type'), 'image/png');
const open0 = await (await fetch(`${BASE}/api/open`)).json();
assert.ok(open0.themes.length >= 2 && open0.themes.every(t => t.id && t.label && t.count >= 5), 'lista tema stiže uz sobe');
// soba s temama izabranim na početnoj
const [th1, th2] = open0.themes.map(t => t.id);
const { code: c2 } = await (await fetch(`${BASE}/api/rooms`, { method: 'POST', body: JSON.stringify({ themes: [th1, 'xxx'] }) })).json();
const T = client(c2, 'tttttttttttttttttttt9', 'Tema');
await T.ready; await T.until(s => s.you.host);
assert.deepEqual(T.state.options.themes, [th1]); assert.equal(T.state.maxRounds, open0.themes.find(t => t.id === th1).count);
T.send({ t: 'opt', rounds: T.state.maxRounds + 1 }); await sleep(200); assert.equal(T.state.options.rounds, 4, 'runde ne mogu preko broja asocijacija u temi');
assert.ok(PUZZLES.filter(p => p.T === th1).every(p => !JSON.stringify(T.state).includes(p.F.split('|')[0])), 'asocijacije se ne šalju unaprijed');
T.ws.close();
r = await fetch(`${BASE}/api/rooms`, { method: 'POST', body: 'nije json' }); assert.equal(r.status, 201, 'loš body: soba sa svim temama');
const { code } = await (await fetch(`${BASE}/api/rooms`, { method: 'POST' })).json();
r = await fetch(`${BASE}/api/rooms/${code.toLowerCase()}`); assert.equal(r.status, 200);
console.log('HTTP OK, soba', code);

const A = client(code, 'aaaaaaaaaaaaaaaaaaaa1', 'Aldin');
await A.ready; await A.until(s => s.you.host);
const B = client(code, 'bbbbbbbbbbbbbbbbbbbb2', 'Brat');
await B.ready; await B.until(s => !s.you.host);
assert.ok(!JSON.stringify(B.state).includes('aaaaaaaa'), 'pid drugih se ne smije slati');

B.send({ t: 'start' }); B.send({ t: 'bot', seat: 1 }); B.send({ t: 'opt', rounds: 2 });
await sleep(300); assert.deepEqual(B.errors, ['Samo domaćin pokreće igru', 'Samo domaćin dodaje botove', 'Samo domaćin mijenja postavke']);
assert.deepEqual(A.state.options, { rounds: 4, public: true, themes: [] }, 'zadane postavke');

// Lista otvorenih soba
const listed = async () => (await (await fetch(`${BASE}/api/open`)).json()).rooms.find(x => x.code === code);
let e = await listed(); assert.ok(e, 'javna soba je na listi'); assert.equal(e.host, 'Aldin'); assert.equal(e.free, 4);
assert.deepEqual(Object.keys(e).sort(), ['code', 'free', 'host', 'over', 'players', 'rounds', 'themes'], 'lista ne šalje višak podataka');
// teme se biraju samo pri pravljenju sobe: u sobi se ne mogu promijeniti
A.send({ t: 'opt', themes: [th2] }); await sleep(200); assert.deepEqual(A.state.options.themes, [], 'teme se ne mijenjaju u sobi');
A.send({ t: 'opt', public: false }); await A.until(s => !s.options.public); await sleep(100);
assert.equal(await listed(), undefined, 'privatna soba nije na listi');
A.send({ t: 'opt', public: true, rounds: 3, nesto: 1 }); await A.until(s => s.options.public && s.options.rounds === 3); await sleep(100);
A.send({ t: 'opt', rounds: 999 }); await sleep(150); assert.equal(A.state.options.rounds, 3, 'neispravan broj rundi se ignoriše');
assert.ok(await listed()); assert.equal(A.state.options.nesto, undefined);
console.log('postavke i lista soba OK');

A.send({ t: 'sit', seat: 0 }); await A.until(s => s.seats[0]);
B.send({ t: 'sit', seat: 0 }); await sleep(250); assert.ok(B.errors.includes('Mjesto je zauzeto'));
B.send({ t: 'sit', seat: 2 }); A.send({ t: 'bot', seat: 1 });
await A.until(s => s.seats[1] && s.seats[2]);
B.send({ t: 'react', e: '😂' }); B.send({ t: 'react', e: '😂' }); B.send({ t: 'react', e: '<script>' });
A.send({ t: 'start' });
await A.until(s => s.game && s.game.phase === 'play');
assert.equal(A.reacts.length, 1, 'reakcije: rate limit i samo dozvoljene');
assert.deepEqual(A.state.game.players, [0, 1, 2]);
assert.equal(A.state.game.turn, 0); assert.equal(A.state.game.stage, 'open');
await sleep(100); assert.equal(await listed(), undefined, 'soba u igri nije na listi');

B.send({ t: 'open', col: 'A', i: 0 }); await sleep(200); assert.ok(B.errors.includes('Nisi na potezu'));
A.send({ t: 'guess', target: 'A', text: 'x' }); await sleep(200); assert.ok(A.errors.includes('Prvo otvori jedno polje'));
A.send({ t: 'open', col: 'Z', i: 0 }); await sleep(200); assert.ok(A.errors.includes('Neispravno polje'));
A.errors.length = 0; B.errors.length = 0;
A.send({ t: 'open', col: 'A', i: 0 }); await A.until(s => s.game.stage === 'guess');
assert.ok(A.state.game.fields.A[0]); assert.equal(A.state.game.fields.A[1], null);
A.send({ t: 'sit', seat: 3 }); await sleep(200); assert.ok(A.errors.includes('Igra je u toku')); A.errors.length = 0;
A.send({ t: 'guess', target: 'B', text: 'sigurnonetacno' }); await A.until(s => s.game.turn === 1);
console.log('pravila sobe OK');

// Reconnect: B se odspoji i vrati na isto mjesto
B.ws.close(); await sleep(300);
await A.until(s => !s.seats[2].online);
const B2 = client(code, 'bbbbbbbbbbbbbbbbbbbb2', 'Brat');
await B2.ready; await B2.until(s => s.you.seat === 2);
await A.until(s => s.seats[2].online);
console.log('reconnect OK');

// Igraj do kraja: ljudi otvaraju polje pa kažu dalje (ili otkriju kad je sve otvoreno), bot igra sam.
const t0 = Date.now(); let actions = 0, sawRoundOver = 0;
// Nijedno neotkriveno rješenje ne smije stići u browser
const leakCheck = c => {
  for (const raw of c.raw) {
    const m = JSON.parse(raw); if (m.t !== 'state' || !m.game) continue;
    const g = m.game;
    if (g.phase !== 'play') continue;
    // dok traje runda: konačno i neriješene kolone se ne šalju
    assert.equal(g.sols.F, null, 'konačno se ne šalje dok traje runda');
    for (const k of ['A', 'B', 'C', 'D']) if (g.solved[k] === -1) assert.equal(g.sols[k], null);

  }
};
while (true) {
  const s = A.state;
  if (s.game.phase === 'over') break;
  if (Date.now() - t0 > 240000) throw new Error('predugo');
  if (s.game.phase === 'roundOver' && !A.sentNext) { sawRoundOver++; A.sentNext = s.game.round; A.send({ t: 'next' }); }
  if (s.game.phase === 'play') A.sentNext = false;
  for (const [c, seat] of [[A, 0], [B2, 2]]) {
    const g = c.state.game;
    const key = g.seq + ':' + g.stage;
    if (g.phase === 'play' && g.turn === seat && c.lastKey !== key) {
      c.lastKey = key;
      if (g.stage === 'open') {
        const k = ['A', 'B', 'C', 'D'].find(x => g.solved[x] === -1 && g.fields[x].some(w => w === null));
        c.send({ t: 'open', col: k, i: g.fields[k].findIndex(w => w === null) });
      } else if (g.allOpen) c.send({ t: 'reveal' });
      else c.send({ t: 'pass' });
      actions++;
    }
  }
  await sleep(15);
}
leakCheck(A); leakCheck(B2);
const g = A.state.game;
console.log('partija gotova za', Math.round((Date.now() - t0) / 1000), 's · akcija ljudi:', actions, '· bodovi:', g.scores);
assert.equal(g.round, 2); assert.ok(sawRoundOver >= 2); assert.ok(actions > 0, 'ljudi su igrali');
const unexpected = [...A.errors, ...B2.errors].filter(x => !['Nisi na potezu', 'Runda nije u toku', 'Runda još traje', 'Samo domaćin pokreće sljedeću rundu'].includes(x));
assert.deepEqual(unexpected, [], 'neočekivane greške: ' + unexpected);

// U predvorju nakon partije: soba je ponovo na listi, nova partija radi
await sleep(150); e = await listed(); assert.ok(e && e.over, 'između partija soba je na listi');
A.send({ t: 'start' }); await A.until(s => s.game.phase === 'play' && s.game.round === 0 && s.game.seq === 1);
console.log('nova partija OK');
A.ws.close(); B2.ws.close(); await sleep(400);
assert.equal(await listed(), undefined, 'prazna soba nestaje s liste');
console.log('prazna soba skinuta s liste OK');
