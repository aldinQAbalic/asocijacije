// Jedna soba = jedan Durable Object. Drži stanje igre i sve WebSocket veze igrača u toj sobi.
import { DurableObject } from 'cloudflare:workers';
import * as G from './game.js';

const OPEN_MS = 25_000;          // koliko čovjek ima da otvori polje
const GUESS_MS = 45_000;         // koliko ima da pogađa
const OFFLINE_MS = 8_000;        // ako je igrač ispao s mreže, kraće se čeka
const BOT_OPEN_MS = 1400;
const BOT_GUESS_MS = 2300;
const ROUND_PAUSE_MS = 9_000;    // pauza između rundi (vidi se rješenje)
const ROOM_TTL_MS = 24 * 3600_000;
const MAX_SOCKETS = 30;
export const REACTIONS = ['😂', '🤔', '👏', '🙈', '😭', '🔥', '😎', '🤯', '😱', '🥳', '💀', '🤡', 'Bravo! 👏', 'Ma znam ja to! 😤', 'Nemam pojma 🤷'];
const DEFAULT_OPTIONS = { rounds: 4, public: true, themes: [] };   // themes: [] = sve teme
const BOT_NAMES = ['Bot Mujo', 'Bot Haso', 'Bot Fata', 'Bot Suljo'];

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.data = null;
  }

  async load() {
    if (!this.data) this.data = (await this.ctx.storage.get('room')) || null;
    if (this.data) this.data.options = { ...DEFAULT_OPTIONS, ...(this.data.options || {}) };
    return this.data;
  }

  async save() {
    this.data.lastActivity = Date.now();
    await this.ctx.storage.put('room', this.data);
  }

  async fetch(request) {
    const url = new URL(request.url);
    await this.load();

    if (url.pathname === '/init') {
      if (this.data) return new Response('postoji', { status: 409 });
      // teme i broj rundi se mogu izabrati već na početnoj stranici
      const body = await request.json().catch(() => ({}));
      const options = { ...DEFAULT_OPTIONS };
      setThemes(options, body && body.themes);
      if (body && Number.isInteger(body.rounds)) setRounds(options, body.rounds);
      this.data = { created: Date.now(), hostPid: null, seats: [null, null, null, null], game: null, due: null, options };
      await this.save();
      await this.schedule();
      return new Response('ok', { status: 201 });
    }

    if (!this.data) return new Response(JSON.stringify({ error: 'Soba ne postoji ili je istekla' }), { status: 404 });
    if (url.pathname === '/exists') return new Response('ok');
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('Soba je puna', { status: 429 });

    this.data.code = url.pathname.split('/').pop().toUpperCase();
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ pid: null, name: null });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // ---------- poruke od igrača ----------

  async webSocketMessage(ws, raw) {
    await this.load();
    if (!this.data) { ws.close(4004, 'Soba ne postoji'); return; }
    if (typeof raw !== 'string' || raw.length > 1000) return this.err(ws, 'Poruka prevelika');
    let msg;
    try { msg = JSON.parse(raw); } catch { return this.err(ws, 'Neispravna poruka'); }
    if (!msg || typeof msg !== 'object') return this.err(ws, 'Neispravna poruka');

    const att = ws.deserializeAttachment() || {};
    try {
      if (msg.t === 'hello') {
        const pid = typeof msg.pid === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(msg.pid) ? msg.pid : null;
        if (!pid) return this.err(ws, 'Neispravan identitet');
        att.pid = pid;
        att.name = cleanName(msg.name) || 'Igrač';
        ws.serializeAttachment(att);
        if (!this.data.hostPid) this.data.hostPid = pid;
        const seat = this.seatOf(pid);
        if (seat !== -1) this.data.seats[seat].name = att.name;
        await this.commit();
        return;
      }
      if (!att.pid) return this.err(ws, 'Prvo se predstavi');
      await this.handle(ws, att, msg);
    } catch (e) {
      this.err(ws, e.message || 'Greška');
    }
  }

  async handle(ws, att, msg) {
    const d = this.data;
    const isHost = att.pid === d.hostPid;
    const mySeat = this.seatOf(att.pid);
    const lobby = !d.game || d.game.phase === 'over';
    const seatArg = Number.isInteger(msg.seat) && msg.seat >= 0 && msg.seat < 4 ? msg.seat : null;

    switch (msg.t) {
      case 'name': {
        att.name = cleanName(msg.name) || att.name;
        ws.serializeAttachment(att);
        if (mySeat !== -1) d.seats[mySeat].name = att.name;
        break;
      }
      case 'sit': {
        if (!lobby) throw new Error('Igra je u toku');
        if (seatArg === null) throw new Error('Neispravno mjesto');
        if (d.seats[seatArg]) throw new Error('Mjesto je zauzeto');
        if (mySeat !== -1) d.seats[mySeat] = null;
        d.seats[seatArg] = { pid: att.pid, name: att.name, bot: false };
        d.game = null;
        break;
      }
      case 'stand': {
        if (!lobby) throw new Error('Igra je u toku');
        if (mySeat !== -1) d.seats[mySeat] = null;
        d.game = null;
        break;
      }
      case 'bot': {
        if (!isHost) throw new Error('Samo domaćin dodaje botove');
        if (!lobby) throw new Error('Igra je u toku');
        if (seatArg === null || d.seats[seatArg]) throw new Error('Mjesto je zauzeto');
        d.seats[seatArg] = { pid: null, name: BOT_NAMES[seatArg], bot: true };
        d.game = null;
        break;
      }
      case 'clear': {
        if (!isHost) throw new Error('Samo domaćin uklanja igrače');
        if (!lobby) throw new Error('Igra je u toku');
        if (seatArg === null) throw new Error('Neispravno mjesto');
        d.seats[seatArg] = null;
        d.game = null;
        break;
      }
      case 'opt': {
        if (!isHost) throw new Error('Samo domaćin mijenja postavke');
        if (!lobby) throw new Error('Igra je u toku');
        // teme se biraju samo pri pravljenju sobe (/init), ovdje se ne mijenjaju
        if (Number.isInteger(msg.rounds)) setRounds(d.options, msg.rounds);
        if (typeof msg.public === 'boolean') d.options.public = msg.public;
        break;
      }
      case 'start': {
        if (!isHost) throw new Error('Samo domaćin pokreće igru');
        if (!lobby) throw new Error('Igra je već u toku');
        if (d.seats.filter(Boolean).length < 2) throw new Error('Trebaju najmanje 2 igrača');
        if (!d.seats.some(s => s && !s.bot)) throw new Error('Treba bar jedan čovjek');
        d.game = G.newGame(d.seats, { rounds: d.options.rounds, themes: d.options.themes });
        break;
      }
      case 'open': {
        this.requireTurn(mySeat);
        if (!Number.isInteger(msg.i)) throw new Error('Neispravno polje');
        G.open(d.game, msg.col, msg.i);
        break;
      }
      case 'guess': {
        this.requireTurn(mySeat);
        G.guess(d.game, msg.target, msg.text);
        break;
      }
      case 'pass': {
        this.requireTurn(mySeat);
        G.pass(d.game);
        break;
      }
      case 'reveal': {
        this.requireTurn(mySeat);
        G.reveal(d.game);
        break;
      }
      case 'next': {
        // domaćin može preskočiti pauzu između rundi
        if (!isHost) throw new Error('Samo domaćin pokreće sljedeću rundu');
        G.nextRound(d.game);
        break;
      }
      case 'react': {
        const now = Date.now();
        if (!REACTIONS.includes(msg.e) || now - (att.lastReact || 0) < 1200) return;
        att.lastReact = now;
        ws.serializeAttachment(att);
        const out = JSON.stringify({ t: 'react', seat: mySeat, name: att.name, e: msg.e });
        for (const w of this.sockets()) { try { w.send(out); } catch {} }
        return;
      }
      case 'leave': {
        // Ako igrač napusti igru u toku, mjesto preuzima bot da ostali mogu nastaviti.
        if (mySeat === -1) break;
        if (lobby) d.seats[mySeat] = null;
        else d.seats[mySeat] = { pid: null, name: d.seats[mySeat].name + ' (bot)', bot: true };
        if (d.hostPid === att.pid) d.hostPid = this.pickNewHost(att.pid);
        if (!lobby && !d.seats.some(s => s && !s.bot)) d.game.phase = 'over';   // nema više ljudi
        break;
      }
      default:
        throw new Error('Nepoznata komanda');
    }
    await this.commit();
  }

  requireTurn(mySeat) {
    const g = this.data.game;
    if (!g || g.phase !== 'play') throw new Error('Runda nije u toku');
    if (mySeat !== g.turn) throw new Error('Nisi na potezu');
  }

  async webSocketClose(ws) {
    await this.load();
    if (!this.data) return;
    const att = ws.deserializeAttachment() || {};
    // Domaćin koji ode iz predvorja prepušta domaćinstvo nekom ko je još tu.
    if (att.pid && att.pid === this.data.hostPid && !this.online(att.pid, ws)) {
      const lobby = !this.data.game || this.data.game.phase === 'over';
      if (lobby) this.data.hostPid = this.pickNewHost(att.pid, ws);
    }
    await this.commit(ws);
    try { ws.close(1000, 'bye'); } catch {}
  }

  async webSocketError(ws) { return this.webSocketClose(ws); }

  // ---------- tajmer: botovi, istek vremena, pauza između rundi, čišćenje ----------

  async alarm() {
    await this.load();
    if (!this.data) return;
    const g = this.data.game;
    if (g && (g.phase === 'play' || g.phase === 'roundOver') && this.data.due && Date.now() >= this.data.due - 50) {
      try { this.autoAct(); } catch (e) { console.error('autoAct', e); }
      await this.commit();
      return;
    }
    if (Date.now() - (this.data.lastActivity || 0) > ROOM_TTL_MS && this.ctx.getWebSockets().length === 0) {
      if (this.data.reported && this.data.reported !== 'null') { this.data.options.public = false; await this.report(); }
      await this.ctx.storage.deleteAll();
      this.data = null;
      return;
    }
    await this.schedule();
  }

  autoAct() {
    const g = this.data.game;
    if (g.phase === 'roundOver') { G.nextRound(g); return; }
    const seat = this.data.seats[g.turn];
    if (!seat || seat.bot) G.applyBot(g, G.botAction(g));
    else G.timeout(g);
  }

  nextDue(except) {
    const g = this.data.game;
    if (!g) return null;
    const now = Date.now();
    if (g.phase === 'roundOver') return now + ROUND_PAUSE_MS;
    if (g.phase !== 'play') return null;
    const s = this.data.seats[g.turn];
    if (!s || s.bot) return now + (g.stage === 'open' ? BOT_OPEN_MS : BOT_GUESS_MS);
    if (!this.online(s.pid, except)) return now + OFFLINE_MS;
    return now + (g.stage === 'open' ? OPEN_MS : GUESS_MS);
  }

  async schedule() {
    const d = this.data;
    const t = d.due || (d.lastActivity || Date.now()) + ROOM_TTL_MS + 1000;
    await this.ctx.storage.setAlarm(t);
  }

  async commit(closing) {
    const d = this.data;
    const g = d.game;
    const s = g && d.seats[g.turn];
    const key = g && (g.phase === 'play' || g.phase === 'roundOver')
      ? `${g.seq}:${g.phase}:${g.turn}:${g.stage}:${s?.bot}:${this.online(s?.pid, closing)}` : null;
    if (key !== d.dueKey) { d.dueKey = key; d.due = this.nextDue(closing); }
    await this.save();
    await this.schedule();
    this.broadcast(closing);
    await this.report(closing);
  }

  // Javlja listi otvorenih soba (Lobby) samo kad se nešto promijeni.
  async report(closing) {
    const d = this.data;
    if (!d.code || !this.env.LOBBY) return;
    const lobby = !d.game || d.game.phase === 'over';
    const free = d.seats.filter(s => !s).length;
    let host = null;
    for (const w of this.sockets(closing)) { const a = w.deserializeAttachment() || {}; if (a.pid === d.hostPid) host = a.name; }
    const listed = d.options.public && lobby && free > 0 && host !== null;
    const entry = listed ? { code: d.code, host, players: 4 - free, free, over: !!d.game, rounds: d.options.rounds, themes: d.options.themes } : null;
    const key = JSON.stringify(entry);
    if (key === d.reported) return;
    try {
      const stub = this.env.LOBBY.get(this.env.LOBBY.idFromName('main'));
      await stub.fetch('https://lobby/set', { method: 'POST', body: JSON.stringify({ code: d.code, entry }) });
      d.reported = key;
      await this.ctx.storage.put('room', d);
    } catch {}   // lista soba nije bitna za samu igru
  }

  // ---------- pomoćno ----------

  seatOf(pid) { return this.data.seats.findIndex(s => s && !s.bot && s.pid === pid); }

  sockets(except) { return this.ctx.getWebSockets().filter(w => w !== except && w.readyState === 1); }

  online(pid, except) {
    if (!pid) return false;
    return this.sockets(except).some(w => (w.deserializeAttachment() || {}).pid === pid);
  }

  pickNewHost(oldPid, except) {
    const seated = this.data.seats.find(s => s && !s.bot && s.pid !== oldPid && this.online(s.pid, except));
    if (seated) return seated.pid;
    const any = this.sockets(except).map(w => (w.deserializeAttachment() || {}).pid).find(p => p && p !== oldPid);
    return any || null;
  }

  view(pid, except) {
    const d = this.data;
    const people = new Map();
    for (const w of this.sockets(except)) {
      const a = w.deserializeAttachment() || {};
      if (a.pid) people.set(a.pid, a.name);
    }
    return {
      t: 'state',
      code: d.code,
      you: { seat: this.seatOf(pid), host: pid === d.hostPid },
      hostName: people.get(d.hostPid) || null,
      hostSeat: d.seats.findIndex(s => s && !s.bot && s.pid === d.hostPid),
      // pid drugih igrača se nikad ne šalje (to je njihova "lozinka" za sjedište)
      options: d.options,
      maxRounds: G.maxRoundsFor(d.options.themes),
      themes: G.THEMES,
      seats: d.seats.map(s => s && { name: s.name, bot: s.bot, online: s.bot || people.has(s.pid) }),
      watching: [...people.keys()].filter(p => this.seatOf(p) === -1).length,
      game: d.game && G.publicView(d.game),
      due: d.due,
      now: Date.now(),
    };
  }

  broadcast(except) {
    for (const w of this.sockets(except)) {
      const a = w.deserializeAttachment() || {};
      if (!a.pid) continue;
      try { w.send(JSON.stringify(this.view(a.pid, except))); } catch {}
    }
  }

  err(ws, message) {
    try { ws.send(JSON.stringify({ t: 'error', message })); } catch {}
  }
}

// Teme: prazna lista = sve. Broj rundi se spusti ako izabrane teme nemaju dovoljno asocijacija.
function setThemes(o, list) {
  if (!Array.isArray(list)) return;
  const t = G.cleanThemes(list);
  if (list.length && !t.length && list.some(x => !Object.hasOwn(G.THEMES, x))) return;   // samo nepoznate teme: ignoriši
  o.themes = t;
  o.rounds = Math.min(o.rounds, G.maxRoundsFor(t));
}
function setRounds(o, n) {
  if (n >= 1 && n <= G.maxRoundsFor(o.themes)) o.rounds = n;
}

function cleanName(n) {
  if (typeof n !== 'string') return '';
  return n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
}
