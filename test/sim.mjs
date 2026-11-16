import * as G from '../src/game.js';
import { PUZZLES, THEMES, LEVELS } from '../src/puzzles.js';
import assert from 'node:assert';
import { pickImage, findImage, searchUrl } from '../src/images.js';

// ---------- asocijacije su ispravno upisane ----------
PUZZLES.forEach((p, n) => {
  assert.ok(typeof p.F === 'string' && p.F.length, `asocijacija ${n}: nema konačnog rješenja`);
  for (const c of G.COLS) {
    assert.equal(p[c].length, 5, `asocijacija ${n} kolona ${c}: treba rješenje + 4 polja`);
    p[c].forEach(x => assert.ok(typeof x === 'string' && x.trim(), `asocijacija ${n} kolona ${c}: prazno polje`));
  }
});
for (const p of PUZZLES) assert.ok(Object.hasOwn(THEMES, p.T), `nepoznata tema ${p.T} kod ${p.F}`);
for (const p of PUZZLES) assert.ok(Object.hasOwn(LEVELS, G.levelOf(p)), `nepoznata težina ${p.L} kod ${p.F}`);
for (const l of Object.keys(LEVELS)) assert.ok(PUZZLES.filter(p => G.levelOf(p) === l).length >= 5, `težina ${l} treba bar 5 asocijacija`);
for (const t of Object.keys(THEMES)) assert.ok(PUZZLES.filter(p => p.T === t).length >= 5, `tema ${t} treba bar 5 asocijacija`);
// nijedno polje ne smije samo po sebi biti prihvaćeno kao rješenje svoje kolone ili konačno
for (const p of PUZZLES) for (const c of G.COLS) for (const w of p[c].slice(1))
  assert.ok(!G.matches(w, p[c][0]) && !G.matches(w, p.F), `polje "${w}" odaje rješenje (${G.label(p.F)} ${c})`);
const finalWords = PUZZLES.map(p => G.norm(G.label(p.F)));
assert.equal(new Set(finalWords).size, finalWords.length, 'dva puta isto konačno rješenje');
console.log('asocijacija:', PUZZLES.length, '·', Object.keys(THEMES).map(t => `${t}: ${PUZZLES.filter(p => p.T === t).length}`).join(', '), '·', Object.keys(LEVELS).map(l => `${l}: ${PUZZLES.filter(p => G.levelOf(p) === l).length}`).join(', '));

// ---------- teme ----------
const ids = Object.keys(THEMES), [t1] = ids;
const one = ids.length === 1;
assert.deepEqual(G.cleanThemes([t1, t1, 'xxx', 5]), one ? [] : [t1], 'duplikati i nepoznate teme se izbace');
assert.deepEqual(G.cleanThemes(ids), [], 'sve teme izabrane = prazna lista');
assert.deepEqual(G.cleanThemes(t1), []);
assert.equal(G.poolFor([]).length, PUZZLES.length);
assert.equal(G.maxRoundsFor([t1]), PUZZLES.filter(p => p.T === t1).length);
for (let k = 0; k < 50; k++) {
  const gg = G.newGame([{}, {}, null, null], { themes: [t1], rounds: 99 });
  assert.equal(gg.rounds, G.maxRoundsFor([t1]), 'runde ograničene brojem asocijacija u temi');
  assert.ok(gg.order.every(i => PUZZLES[i].T === t1), 'samo izabrana tema');
  assert.equal(G.publicView(gg).theme, THEMES[PUZZLES[gg.order[0]].T]);
}

// ---------- težine ----------
const lvls = Object.keys(LEVELS);
assert.deepEqual(G.cleanLevels([lvls[0], lvls[0], 'xxx']), lvls.length > 1 ? [lvls[0]] : []);
assert.deepEqual(G.cleanLevels(lvls), []);
for (const l of lvls) {
  const gg = G.newGame([{}, {}, null, null], { levels: [l], rounds: 99 });
  assert.equal(gg.rounds, PUZZLES.filter(p => G.levelOf(p) === l).length);
  assert.ok(gg.order.every(i => G.levelOf(PUZZLES[i]) === l), 'samo izabrana težina');
  assert.equal(G.publicView(gg).level, LEVELS[l]);
}
assert.equal(G.maxRoundsFor([], []), PUZZLES.length);

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
// prve tri asocijacije iz puzzles.js, pa test ne zavisi od toga koje su upisane
const [P0, P1, P2] = PUZZLES, L = G.label;
let g = G.newGame(seats(3), { order: [0, 1, 2], rounds: 3 });
assert.deepEqual(g.players, [0, 1, 2]);
assert.equal(g.turn, 0); assert.equal(g.stage, 'open');
assert.throws(() => G.guess(g, 'A', L(P0.A[0])), /Prvo otvori/);
assert.throws(() => G.pass(g), /Prvo otvori/);
assert.throws(() => G.open(g, 'E', 0)); assert.throws(() => G.open(g, 'A', 4));
G.open(g, 'A', 0);
assert.equal(g.stage, 'guess'); assert.equal(g.last.word, P0.A[1]);
assert.throws(() => G.open(g, 'A', 1), /pogađa/);
assert.equal(G.colPts(g, 'A'), 5, '2 + 3 neotvorena');
assert.equal(G.guess(g, 'A', L(P0.A[0]).toLowerCase()), true);
assert.equal(g.scores[0], 5); assert.equal(g.solved.A, 0); assert.deepEqual(g.opened.A, [1, 1, 1, 1]);
assert.equal(g.turn, 0, 'pogodak: isti igrač pogađa dalje'); assert.equal(g.stage, 'guess');
assert.throws(() => G.guess(g, 'A', L(P0.A[0])), /već riješena/);
assert.throws(() => G.open(g, 'A', 1));
assert.equal(G.guess(g, 'B', 'sigurno netacno xyz'), false);
assert.equal(g.turn, 1, 'promašaj: sljedeći'); assert.equal(g.stage, 'open');
G.open(g, 'B', 0); G.pass(g); assert.equal(g.turn, 2);
G.open(g, 'C', 0);
// konačno: 7 + B(2+3) + C(2+3) + D(2+4) = 7+5+5+6 = 23
assert.equal(G.finalPts(g), 23);
assert.equal(G.guess(g, 'F', L(P0.F)), true);
assert.equal(g.scores[2], 23); assert.equal(g.phase, 'roundOver');
assert.ok(['A', 'B', 'C', 'D'].every(c => g.solved[c] >= 0));
assert.equal(g.solved.A, 0, 'kolona koju je neko već riješio ostaje njegova');
assert.equal(g.solved.B, 2);
assert.throws(() => G.open(g, 'D', 0), /nije u toku/);
// pogled: neotkriveno se ne vidi
G.nextRound(g);
assert.equal(g.round, 1); assert.equal(g.turn, 1, 'druga runda: počinje sljedeći igrač'); assert.equal(g.phase, 'play');
let v = G.publicView(g);
assert.ok(!JSON.stringify(v).includes(L(P1.F)), 'konačno rješenje se ne šalje');
assert.ok(!JSON.stringify(v).includes(JSON.stringify(P1.A[1])), 'neotvorena polja se ne šalju');
G.open(g, 'A', 0);
v = G.publicView(g);
assert.equal(v.fields.A[0], P1.A[1]); assert.equal(v.fields.A[1], null); assert.equal(v.sols.A, null);
assert.ok(!JSON.stringify(v).includes(L(P1.A[0])));
// otkrivanje: tek kad su sva polja otvorena
assert.throws(() => G.reveal(g), /neotvorenih/);
G.pass(g);
for (const c of G.COLS) for (let i = 0; i < 4; i++) if (!g.opened[c][i]) { G.open(g, c, i); G.pass(g); }
assert.equal(g.stage, 'guess', 'sve otvoreno: odmah se pogađa');
assert.equal(G.finalPts(g), 7 + 4 * 2);
G.reveal(g);
assert.equal(g.phase, 'roundOver'); assert.equal(g.solved.F, -2); assert.equal(g.last.answer, L(P1.F));
G.nextRound(g); assert.equal(g.turn, 2);
G.timeout(g); assert.equal(g.stage, 'guess', 'istek vremena: otvori se nasumično polje');
G.timeout(g); assert.equal(g.turn, 0, 'istek vremena u pogađanju: dalje');
// kraj
G.open(g, 'D', g.opened.D.indexOf(0)); G.guess(g, 'F', L(P2.F));
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

// ---------- slike (Wikimedia Commons), sa lažnim odgovorima ----------
for (const p of PUZZLES) assert.ok(p.E, `asocijacija ${G.label(p.F)}: fali E (emoji)`);
assert.ok(PUZZLES.filter(p => p.W).length >= 20, 'igrači i treneri imaju W (fotografija)');
const img = (title, extra = {}) => ({ title, index: 1, imageinfo: [{ thumburl: 'https://upload.wikimedia.org/x/640px-a.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:a.jpg', mime: 'image/jpeg', width: 2000, height: 1500, extmetadata: { Artist: { value: '<a href="x">Ivo <b>Ivić</b></a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } }, ...extra }] });
const resp = { query: { pages: [img('File:Club logo.png'), img('File:Messi signature.jpg'), img('File:Small.jpg', { width: 100 }), img('File:Video.webm', { mime: 'video/webm' }), img('File:Messi 2018.jpg')] } };
const chosen = pickImage(resp);
assert.deepEqual(chosen, { url: 'https://upload.wikimedia.org/x/640px-a.jpg', page: 'https://commons.wikimedia.org/wiki/File:a.jpg', author: 'Ivo Ivić', license: 'CC BY-SA 4.0' }, 'izbaci logo, potpis, male slike i video; očisti HTML autora');
assert.equal(pickImage({ query: { pages: [img('File:Logo.png')] } }), null, 'samo logo: nema slike');
assert.equal(pickImage({}), null);
assert.equal(pickImage({ query: { pages: [img('File:x.jpg', { thumburl: 'https://zlo.example/x.jpg' })] } }), null, 'samo slike sa upload.wikimedia.org');
assert.equal(pickImage({ query: { pages: { 5: img('File:Stari format.jpg') } } }).license, 'CC BY-SA 4.0', 'radi i stari format odgovora');
assert.ok(searchUrl('Lionel Messi').startsWith('https://commons.wikimedia.org/w/api.php?') && searchUrl('Lionel Messi').includes('Lionel+Messi+filetype%3Abitmap'));
let seenUA = null;
let r = await findImage('Lionel Messi', async (u, o) => { seenUA = o.headers['User-Agent']; return { ok: true, json: async () => resp }; });
assert.equal(r.status, 'ok'); assert.ok(r.image.url);
assert.ok(seenUA && seenUA.includes('Asocijacije'), 'šalje User-Agent');
r = await findImage('x', async () => { throw new Error('mreža'); }); assert.deepEqual(r, { image: null, status: 'greška mreže' }, 'greška mreže: bez rušenja');
r = await findImage('x', async () => ({ ok: false, status: 403 })); assert.deepEqual(r, { image: null, status: 'http 403' }, 'HTTP greška se vidi u statusu');
r = await findImage(null, async () => { throw new Error('ne smije zvati'); }); assert.equal(r.image, null);
// prvi pokušaj (samo fotografije) bez rezultata -> drugi bez filtera
const urls = [];
r = await findImage('Rijetko', async (u) => { urls.push(u); return { ok: true, json: async () => (urls.length === 1 ? { batchcomplete: true } : resp) }; });
assert.equal(urls.length, 2); assert.ok(urls[0].includes('filetype%3Abitmap') && !urls[1].includes('filetype')); assert.equal(r.status, 'ok');
r = await findImage('Samo grbovi', async () => ({ ok: true, json: async () => ({ query: { pages: [img('File:Club crest.png')] } }) }));
assert.deepEqual(r, { image: null, status: 'nema odgovarajuće slike' });
// riječ "map" u "Mapei" ne smije izbaciti sliku (samo cijela riječ)
assert.ok(pickImage({ query: { pages: [img('File:Mapei Stadium 2019.jpg')] } }), 'Mapei nije "map"');
// u igri: slika i emoji se ne šalju dok runda traje
{
  const gg = G.newGame([{}, {}, null, null], { rounds: 1 });
  assert.equal(G.publicView(gg).emoji, null); assert.equal(G.publicView(gg).image, null);
  G.open(gg, 'A', 0); G.guess(gg, 'F', G.label(PUZZLES[gg.order[0]].F));
  assert.equal(G.publicView(gg).emoji, PUZZLES[gg.order[0]].E); assert.equal(G.imageQuery(gg), PUZZLES[gg.order[0]].W || null);
}
console.log('slike OK');

