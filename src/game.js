// Pravila Asocijacija: samo logika, bez mreže. Server je sudija; browser nikad ne dobije neotkrivena rješenja.
import { PUZZLES, THEMES, LEVELS } from './puzzles.js';

export { THEMES, LEVELS };
export const COLS = ['A', 'B', 'C', 'D'];
export const MAX_ROUNDS = PUZZLES.length;

// ---------- teme ----------
// Prazna lista = sve teme. Nepoznate teme se izbace, duplikati takođe.
export function cleanThemes(list) {
  if (!Array.isArray(list)) return [];
  const out = [...new Set(list.filter(t => typeof t === 'string' && Object.hasOwn(THEMES, t)))];
  return out.length === Object.keys(THEMES).length ? [] : out;
}
// ---------- težine ----------
export const levelOf = p => p.L || 'lako';
// Prazna lista = sve težine (miješano)
export function cleanLevels(list) {
  if (!Array.isArray(list)) return [];
  const out = [...new Set(list.filter(t => typeof t === 'string' && Object.hasOwn(LEVELS, t)))];
  return out.length === Object.keys(LEVELS).length ? [] : out;
}

// Indeksi asocijacija iz izabranih tema i težina
export function poolFor(themes, levels) {
  const t = cleanThemes(themes), l = cleanLevels(levels);
  return PUZZLES.map((p, i) => ((t.length === 0 || t.includes(p.T)) && (l.length === 0 || l.includes(levelOf(p))) ? i : -1)).filter(i => i >= 0);
}
export const maxRoundsFor = (themes, levels) => poolFor(themes, levels).length;

// ---------- provjera odgovora ----------
// Bez kvačica, razmaka i znakova; đ = dj. Duža rješenja (5+ slova) praštaju jednu grešku u kucanju.
export function norm(s) {
  return String(s || '').toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[b.length];
}
export function matches(guess, sol) {
  const g = norm(guess);
  if (!g) return false;
  return sol.split('|').some(x => { const n = norm(x); return n === g || (n.length >= 5 && lev(n, g) <= 1); });
}
export const label = s => s.split('|')[0];

export function cleanGuess(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
}

function shuffle(a, rnd = Math.random) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- stanje ----------
export function newGame(seats, opts = {}) {
  const players = seats.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
  if (players.length < 2) throw new Error('Trebaju najmanje 2 igrača');
  const pool = poolFor(opts.themes, opts.levels);
  if (!pool.length) throw new Error('Nema asocijacija za izabranu temu i težinu');
  const rounds = Math.max(1, Math.min(pool.length, Math.floor(opts.rounds) || 4));
  const order = Array.isArray(opts.order) ? opts.order.slice(0, rounds) : shuffle(pool, opts.rnd).slice(0, rounds);
  const g = { phase: 'play', players, rounds, round: 0, order, scores: [0, 0, 0, 0], finals: [0, 0, 0, 0], seq: 0, last: null, log: [] };
  startRound(g);
  return g;
}

export const puzzleOf = g => PUZZLES[g.order[g.round]];
export const imageQuery = g => puzzleOf(g).W || null;
export const colPts = (g, c) => 2 + g.opened[c].filter(x => !x).length;
export const finalPts = g => 7 + COLS.filter(c => g.solved[c] === -1).reduce((a, c) => a + colPts(g, c), 0);
// Ima li još neotvorenih polja u neriješenim kolonama
export const anyClosed = g => COLS.some(c => g.solved[c] === -1 && g.opened[c].some(x => !x));

function startRound(g) {
  g.opened = { A: [0, 0, 0, 0], B: [0, 0, 0, 0], C: [0, 0, 0, 0], D: [0, 0, 0, 0] };
  g.solved = { A: -1, B: -1, C: -1, D: -1, F: -1 };   // -1 neriješeno, -2 niko (otkriveno), inače mjesto igrača
  g.turn = g.players[g.round % g.players.length];      // svaku rundu počinje sljedeći igrač
  g.image = null; g.imageTried = false; g.imageDone = false; g.imageStatus = null;   // slika pojma (traži je soba kad se otkrije konačno)
  g.stage = 'open';
  g.phase = 'play';
  bump(g, { type: 'round', round: g.round, seat: g.turn });
}

function bump(g, last) {
  g.seq++;
  g.last = { ...last, seq: g.seq };
  g.log = [g.last, ...g.log].slice(0, 10);
}

function nextTurn(g) {
  const i = g.players.indexOf(g.turn);
  g.turn = g.players[(i + 1) % g.players.length];
  g.stage = anyClosed(g) ? 'open' : 'guess';
}

function requirePlay(g) { if (!g || g.phase !== 'play') throw new Error('Runda nije u toku'); }

// ---------- potezi ----------
export function open(g, col, i) {
  requirePlay(g);
  if (g.stage !== 'open') throw new Error('Sad se pogađa, ne otvara');
  if (!COLS.includes(col) || !Number.isInteger(i) || i < 0 || i > 3) throw new Error('Neispravno polje');
  if (g.solved[col] !== -1) throw new Error('Kolona je već riješena');
  if (g.opened[col][i]) throw new Error('Polje je već otvoreno');
  g.opened[col][i] = 1;
  g.stage = 'guess';
  bump(g, { type: 'open', seat: g.turn, col, i, word: puzzleOf(g)[col][i + 1] });
}

// Vraća true ako je pogodio (igrač tada nastavlja pogađati).
export function guess(g, target, text) {
  requirePlay(g);
  if (g.stage !== 'guess') throw new Error('Prvo otvori jedno polje');
  if (target !== 'F' && !COLS.includes(target)) throw new Error('Neispravna kolona');
  text = cleanGuess(text);
  if (!text) throw new Error('Upiši rješenje');
  const P = puzzleOf(g), seat = g.turn;
  if (target === 'F') {
    if (matches(text, P.F)) {
      const pts = finalPts(g);
      g.scores[seat] += pts;
      for (const c of COLS) { if (g.solved[c] === -1) g.solved[c] = seat; g.opened[c] = [1, 1, 1, 1]; }
      g.solved.F = seat;
      if (g.finals) g.finals[seat] += 1;   // za tabelu: koliko je ko pogodio konačnih
      g.phase = 'roundOver'; g.stage = null;
      bump(g, { type: 'guess', seat, target, text, ok: true, pts, answer: label(P.F) });
      return true;
    }
  } else {
    if (g.solved[target] !== -1) throw new Error('Ta kolona je već riješena');
    if (matches(text, P[target][0])) {
      const pts = colPts(g, target);
      g.scores[seat] += pts;
      g.solved[target] = seat;
      g.opened[target] = [1, 1, 1, 1];
      bump(g, { type: 'guess', seat, target, text, ok: true, pts, answer: label(P[target][0]) });
      return true;
    }
  }
  bump(g, { type: 'guess', seat, target, text, ok: false });
  nextTurn(g);
  return false;
}

export function pass(g) {
  requirePlay(g);
  if (g.stage !== 'guess') throw new Error('Prvo otvori jedno polje');
  bump(g, { type: 'pass', seat: g.turn });
  nextTurn(g);
}

// Sva polja otvorena, a niko ne zna: igrač na potezu može otkriti rješenje (bez bodova).
export function reveal(g) {
  requirePlay(g);
  if (anyClosed(g)) throw new Error('Još ima neotvorenih polja');
  for (const c of COLS) { g.opened[c] = [1, 1, 1, 1]; if (g.solved[c] === -1) g.solved[c] = -2; }
  g.solved.F = -2;
  g.phase = 'roundOver'; g.stage = null;
  bump(g, { type: 'reveal', seat: g.turn, answer: label(puzzleOf(g).F) });
}

export function nextRound(g) {
  if (!g || g.phase !== 'roundOver') throw new Error('Runda još traje');
  if (g.round + 1 >= g.rounds) { g.phase = 'over'; g.stage = null; bump(g, { type: 'over' }); return; }
  g.round++;
  startRound(g);
}

// Kad igraču istekne vrijeme: otvori nasumično polje ili kaže dalje.
export function timeout(g, rnd = Math.random) {
  requirePlay(g);
  if (g.stage === 'open') { const f = randomClosed(g, rnd); open(g, f.col, f.i); }
  else pass(g);
}

function randomClosed(g, rnd = Math.random) {
  const list = [];
  for (const c of COLS) if (g.solved[c] === -1) g.opened[c].forEach((o, i) => { if (!o) list.push({ col: c, i }); });
  return list[Math.floor(rnd() * list.length)];
}

// ---------- bot ----------
// Bot "zna" rješenje sa vjerovatnoćom koja raste s brojem otvorenih polja.
const COL_P = [0, 0.08, 0.22, 0.4, 0.62];
export function botAction(g, rnd = Math.random) {
  if (g.stage === 'open') {
    // radije otvara u koloni gdje već ima otvorenih polja
    const list = [];
    for (const c of COLS) if (g.solved[c] === -1) {
      const k = g.opened[c].filter(Boolean).length;
      g.opened[c].forEach((o, i) => { if (!o) for (let w = 0; w <= k; w++) list.push({ col: c, i }); });
    }
    const f = list[Math.floor(rnd() * list.length)];
    return { t: 'open', col: f.col, i: f.i };
  }
  const P = puzzleOf(g);
  const solvedCols = COLS.filter(c => g.solved[c] !== -1).length;
  const allOpen = !anyClosed(g);
  const finalP = Math.min(0.9, 0.03 + solvedCols * 0.14 + (allOpen ? 0.2 : 0));
  if (rnd() < finalP) return { t: 'guess', target: 'F', text: label(P.F) };
  for (const c of COLS) {
    if (g.solved[c] !== -1) continue;
    const k = g.opened[c].filter(Boolean).length;
    if (rnd() < COL_P[k] * (allOpen ? 1.15 : 1)) return { t: 'guess', target: c, text: label(P[c][0]) };
  }
  // ponekad bot promaši, da igra bude živa
  if (rnd() < 0.12) {
    const c = COLS.find(x => g.solved[x] === -1) || 'F';
    return { t: 'guess', target: c, text: '???' };
  }
  if (allOpen && rnd() < 0.15) return { t: 'reveal' };
  return { t: 'pass' };
}

export function applyBot(g, a) {
  if (a.t === 'open') open(g, a.col, a.i);
  else if (a.t === 'guess') guess(g, a.target, a.text);
  else if (a.t === 'reveal') reveal(g);
  else pass(g);
}

// ---------- šta browser smije vidjeti ----------
// Samo otvorena polja i riješena rješenja; konačno tek kad je pogođeno ili otkriveno.
export function publicView(g) {
  const P = puzzleOf(g);
  const fields = {}, sols = {}, pts = {};
  for (const c of COLS) {
    fields[c] = g.opened[c].map((o, i) => (o ? P[c][i + 1] : null));
    sols[c] = g.solved[c] !== -1 ? label(P[c][0]) : null;
    pts[c] = colPts(g, c);
  }
  sols.F = g.solved.F !== -1 ? label(P.F) : null;
  pts.F = finalPts(g);
  return {
    phase: g.phase, players: g.players, round: g.round, rounds: g.rounds, scores: g.scores,
    theme: THEMES[P.T] || '',
    level: LEVELS[levelOf(P)] || '',
    turn: g.turn, stage: g.stage, seq: g.seq, last: g.last, log: g.log,
    fields, sols, solved: g.solved, pts, allOpen: !anyClosed(g),
    // slika i emoji tek kad je konačno otkriveno
    image: g.phase !== 'play' ? g.image || null : null,
    emoji: g.phase !== 'play' ? P.E || '⚽' : null,
    // ako server nije dobio sliku, browser pokuša sam s istim pojmom
    imageQuery: g.phase !== 'play' ? P.W || null : null,
    imageDone: g.phase !== 'play' ? !!g.imageDone : false,
    imageStatus: g.phase !== 'play' ? g.imageStatus || null : null,
  };
}
