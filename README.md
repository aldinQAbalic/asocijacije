# Asocijacije

Online Asocijacije za 2–4 igrača. Domaćin napravi sobu i pošalje link, ostali uđu, a prazna mjesta mogu popuniti botovi.
Radi na Cloudflare Workers + Durable Objects (isti nalog kao Termin i Čovječe ne ljuti se), isto kao `covjece-ne-ljuti-se`.

## Struktura

- `src/index.html`: izgled i igra u browseru (HTML, CSS, JS, bez biblioteka)
- `src/worker.js`: ulaz: stranica, pravljenje sobe, WebSocket
- `src/room.js`: jedna soba = jedan Durable Object (igrači, botovi, tajmer, stanje)
- `src/lobby.js`: lista otvorenih soba (jedan Durable Object za cijelu aplikaciju)
- `src/game.js`: pravila igre (samo logika, server je sudija)
- `src/puzzles.js`: teme i asocijacije (ovdje dodaješ nove)
- `src/sw.txt`: service worker za aplikaciju na mobitelu
- zvukovi se prave u browseru (Web Audio), nema zvučnih fajlova
- `src/assets/`: ikone aplikacije
- `test/sim.mjs`: test pravila i asocijacija: ciljani slučajevi + 3000 nasumičnih partija botova
- `test/online.mjs`: test preko mreže s pravim WebSocket klijentima (treba `npm run dev`)

## Prvo postavljanje (jednom)

```
npm install
npx wrangler login
npx wrangler deploy
```

Baza ne treba: svaka soba čuva svoje stanje sama. Durable Objects (SQLite) rade i na besplatnom planu.
Link će biti `https://asocijacije.<tvoj-subdomen>.workers.dev`.

## Svaki put kad nešto promijeniš

```
npm test
npx wrangler deploy
```

## Lokalno testiranje

```
npx wrangler dev
```

Otvori http://localhost:8787 u dva prozora (jedan običan, jedan privatni) da glumiš dva igrača.
U drugom terminalu: `node test/online.mjs` odigra partiju od 3 runde preko mreže (traje oko minut).

## Teme

Teme se biraju samo na početnoj stranici, prije „Napravi novu sobu“ (može više njih, ili „Sve teme“). U sobi se samo prikazuju i ne mogu se mijenjati.
Izbor se pamti u browseru. Broj rundi je ograničen brojem asocijacija u izabranim temama.
Trenutno: 🏠 Svakodnevica (7), 🌿 Priroda (6), ⚽ Sport (5), 🌉 Naše (5), 🎭 Kultura (5).

Nova tema: dodaj je u `THEMES` na vrhu `src/puzzles.js` (`id: 'naziv'`) i napiši bar 5 asocijacija s tim `T`.
`npm test` provjerava da svaka tema ima bar 5.

## Nove asocijacije

U `src/puzzles.js` dodaj novi blok:

```js
{ T: 'sport', F: 'KONAČNO|druga varijanta',
  A: ['RJEŠENJE A|varijanta', 'polje1', 'polje2', 'polje3', 'polje4'],
  B: [...], C: [...], D: [...] },
```

- Prvo u listi je rješenje koje se prikazuje, ostalo iza `|` se takođe priznaje.
- Kvačice, velika slova i razmaci se ne gledaju. Kod riječi od 5+ slova prolazi i jedna greška u kucanju.
- `npm test` provjeri da svaka kolona ima rješenje i tačno 4 polja.
- Broj rundi u sobi može ići do broja asocijacija; u jednoj partiji se ne ponavljaju.

## Pravila

- Na potezu otvoriš jedno polje, pa pogađaš rješenje neke kolone ili konačno rješenje, ili kažeš **Dalje**.
- Pogodak: pogađaš dalje (bez otvaranja novog polja). Promašaj: potez ide sljedećem igraču.
- **Kolona:** 2 boda + 1 za svako neotvoreno polje u toj koloni.
- **Konačno rješenje:** 7 bodova + bodovi svih neriješenih kolona. Runda se tada završava.
- Kad su sva polja otvorena, odmah se pogađa. Ako niko ne zna, igrač na potezu može otkriti rješenje (bez bodova).
- Svaku rundu počinje sljedeći igrač. Teme se biraju pri pravljenju sobe; domaćin u sobi bira broj rundi i da li je soba javna.
- **Vrijeme:** 25 s za otvaranje, 45 s za pogađanje (8 s ako je igrač ispao s mreže).
  Kad istekne: otvori se nasumično polje, odnosno igrač kaže dalje.
- Između rundi je pauza od 9 s (vidi se rješenje); domaćin je može preskočiti.
- Ako igrač izađe usred partije, mjesto preuzima bot.
- **Botovi** "znaju" rješenje kolone s vjerovatnoćom koja raste s brojem otvorenih polja (`botAction` u `src/game.js`),
  a konačno sve sigurnije što je više kolona riješeno. Ponekad i promaše.
- Browser nikad ne dobije neotvorena polja ni nepogođena rješenja (to provjerava i `test/online.mjs`).
- Reakcije (emoji) se šalju svima u sobi.
