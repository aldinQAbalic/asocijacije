import * as G from '../src/game.js';
import { PUZZLES, THEMES } from '../src/puzzles.js';
import assert from 'node:assert';

// ---------- asocijacije su ispravno upisane ----------
PUZZLES.forEach((p, n) => {
  assert.ok(typeof p.F === 'string' && p.F.length, `asocijacija ${n}: nema konačnog rješenja`);
  for (const c of G.COLS) {
    assert.equal(p[c].length, 5, `asocijacija ${n} kolona ${c}: treba rješenje + 4 polja`);
    p[c].forEach(x => assert.ok(typeof x === 'string' && x.trim(), `asocijacija ${n} kolona ${c}: prazno polje`));
  }
});
for (const p of PUZZLES) assert.ok(Object.hasOwn(THEMES, p.T), `nepoznata tema ${p.T} kod ${p.F}`);
for (const t of Object.keys(THEMES)) assert.ok(PUZZLES.filter(p => p.T === t).length >= 5, `tema ${t} treba bar 5 asocijacija`);
const finalWords = PUZZLES.map(p => G.norm(G.label(p.F)));
assert.equal(new Set(finalWords).size, finalWords.length, 'dva puta isto konačno rješenje');
console.log('asocijacija:', PUZZLES.length, '·', Object.keys(THEMES).map(t => `${t}: ${PUZZLES.filter(p => p.T === t).length}`).join(', '));

// ---------- teme ----------
assert.deepEqual(G.cleanThemes(['sport', 'sport', 'xxx', 5]), ['sport']);
assert.deepEqual(G.cleanThemes(Object.keys(THEMES)), [], 'sve teme izabrane = prazna lista');
assert.deepEqual(G.cleanThemes('sport'), []);
assert.equal(G.poolFor([]).length, PUZZLES.length);
assert.equal(G.maxRoundsFor(['sport']), PUZZLES.filter(p => p.T === 'sport').length);
for (let k = 0; k < 50; k++) {
  const gg = G.newGame([{}, {}, null, null], { themes: ['sport', 'bih'], rounds: 99 });
  assert.equal(gg.rounds, G.maxRoundsFor(['sport', 'bih']), 'runde ograničene brojem asocijacija u temama');
  assert.ok(gg.order.every(i => ['sport', 'bih'].includes(PUZZLES[i].T)), 'samo izabrane teme');
  assert.equal(G.publicView(gg).theme, THEMES[PUZZLES[gg.order[0]].T]);
}

// ---------- provjera odgovora ----------
assert.ok(G.matches('plaza', 'PLAŽA'));
assert.ok(G.matches('  Džezva ', 'DŽEZVA'));
assert.ok(G.matches('dzezva', 'DŽEZVA'));
assert.ok(G.matches('nogomet', 'FUDBAL|nogomet'));
assert.ok(G.matches('vatrogasc', 'VATROGASAC'), 'jedna greška u dužoj riječi prolazi');
assert.ok(!G.matches('vatrogsc', 'VATROGASAC'), 'dvije greške ne prolaze');
assert.ok(G.matches('so', 'SO|sol'));
assert.ok(!G.matches('sa', 'SO|sol'), 'kratke riječi moraju biti tačne');
assert.ok(G.matches('Deda Mraz', 'DJED MRAZ|deda mraz'));
assert.ok(G.matches('djedmraz', 'DJED MRAZ'));
assert.ok(G.matches('Đak', 'DJAK'));
assert.ok(!G.matches('', 'SO'));
assert.equal(G.cleanGuess('<b>  x'.padEnd(80, 'y')).length, 30);

// ---------- ciljani testovi pravila ----------
const seats = n => [0, 1, 2, 3].map(i => (i < n ? { name: 'P' + i } : null));
let g = G.newGame(seats(3), { order: [0, 1, 2], rounds: 3 });
assert.deepEqual(g.players, [0, 1, 2]);
assert.equal(g.turn, 0); assert.equal(g.stage, 'open');
assert.throws(() => G.guess(g, 'A', 'plaza'), /Prvo otvori/);
assert.throws(() => G.pass(g), /Prvo otvori/);
assert.throws(() => G.open(g, 'E', 0)); assert.throws(() => G.open(g, 'A', 4));
G.open(g, 'A', 0);
assert.equal(g.stage, 'guess'); assert.equal(g.last.word, 'pijesak');
assert.throws(() => G.open(g, 'A', 1), /pogađa/);
assert.equal(G.colPts(g, 'A'), 5, '2 + 3 neotvorena');
assert.equal(G.guess(g, 'A', 'plaza'), true);
assert.equal(g.scores[0], 5); assert.equal(g.solved.A, 0); assert.deepEqual(g.opened.A, [1, 1, 1, 1]);
assert.equal(g.turn, 0, 'pogodak: isti igrač pogađa dalje'); assert.equal(g.stage, 'guess');
assert.throws(() => G.guess(g, 'A', 'plaza'), /već riješena/);
assert.throws(() => G.open(g, 'A', 1));
assert.equal(G.guess(g, 'B', 'avion'), false);
assert.equal(g.turn, 1, 'promašaj: sljedeći'); assert.equal(g.stage, 'open');
G.open(g, 'B', 0); G.pass(g); assert.equal(g.turn, 2);
G.open(g, 'C', 0);
// konačno: 7 + B(2+3) + C(2+3) + D(2+4) = 7+5+5+6 = 23
assert.equal(G.finalPts(g), 23);
assert.equal(G.guess(g, 'F', 'more'), true);
assert.equal(g.scores[2], 23); assert.equal(g.phase, 'roundOver');
assert.ok(['A', 'B', 'C', 'D'].every(c => g.solved[c] >= 0));
assert.equal(g.solved.A, 0, 'kolona koju je neko već riješio ostaje njegova');
assert.equal(g.solved.B, 2);
assert.throws(() => G.open(g, 'D', 0), /nije u toku/);
// pogled: neotkriveno se ne vidi
G.nextRound(g);
assert.equal(g.round, 1); assert.equal(g.turn, 1, 'druga runda: počinje sljedeći igrač'); assert.equal(g.phase, 'play');
let v = G.publicView(g);
assert.ok(!JSON.stringify(v).includes('ŠKOLA'), 'konačno rješenje se ne šalje');
assert.ok(!JSON.stringify(v).toLowerCase().includes('kreda'), 'neotvorena polja se ne šalju');
G.open(g, 'A', 0);
v = G.publicView(g);
assert.equal(v.fields.A[0], 'kreda'); assert.equal(v.fields.A[1], null); assert.equal(v.sols.A, null);
assert.ok(!JSON.stringify(v).includes('TABLA'));
// otkrivanje: tek kad su sva polja otvorena
assert.throws(() => G.reveal(g), /neotvorenih/);
G.pass(g);
for (const c of G.COLS) for (let i = 0; i < 4; i++) if (!g.opened[c][i]) { G.open(g, c, i); G.pass(g); }
assert.equal(g.stage, 'guess', 'sve otvoreno: odmah se pogađa');
assert.equal(G.finalPts(g), 7 + 4 * 2);
G.reveal(g);
assert.equal(g.phase, 'roundOver'); assert.equal(g.solved.F, -2); assert.equal(g.last.answer, 'ŠKOLA');
G.nextRound(g); assert.equal(g.turn, 2);
G.timeout(g); assert.equal(g.stage, 'guess', 'istek vremena: otvori se nasumično polje');
G.timeout(g); assert.equal(g.turn, 0, 'istek vremena u pogađanju: dalje');
// kraj
G.open(g, 'D', g.opened.D.indexOf(0)); G.guess(g, 'F', 'zima');
G.nextRound(g); assert.equal(g.phase, 'over');
assert.throws(() => G.nextRound(g));
assert.throws(() => G.newGame(seats(1)), /najmanje 2/);
assert.equal(G.newGame(seats(2), { rounds: 99 }).rounds, PUZZLES.length);
assert.equal(new Set(G.newGame(seats(2), { rounds: PUZZLES.length }).order).size, PUZZLES.length, 'asocijacije se ne ponavljaju');
console.log('ciljani testovi OK');

// ---------- nasumične partije samih botova ----------
let rounds = 0, finals = 0, reveals = 0, maxActions = 0;
for (let n = 0; n < 3000; n++) {
  const k = 2 + (n % 3);
  const gg = G.newGame(seats(k), { rounds: 1 + (n % PUZZLES.length) });
  let actions = 0;
  while (gg.phase !== 'over') {
    if (gg.phase === 'roundOver') {
      rounds++;
      if (gg.solved.F >= 0) finals++; else reveals++;
      const sum = gg.scores.reduce((a, b) => a + b, 0);
      assert.ok(sum >= 0);
      G.nextRound(gg); continue;
    }
    assert.ok(gg.players.includes(gg.turn));
    const before = JSON.stringify(gg.opened);
    const a = G.botAction(gg);
    G.applyBot(gg, a);
    if (a.t === 'open') assert.notEqual(JSON.stringify(gg.opened), before);
    if (++actions > 2000) throw new Error('partija se ne završava');
  }
  maxActions = Math.max(maxActions, actions);
  // najviše bodova u jednoj rundi: 7 + 4 * 6 = 31
  assert.ok(gg.scores.reduce((a, b) => a + b, 0) <= gg.rounds * 31);
}
console.log(`3000 partija OK · rundi: ${rounds} · konačno pogođeno: ${finals} · otkriveno: ${reveals} · najviše poteza u partiji: ${maxActions}`);
