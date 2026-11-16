# Asocijacije

Online Asocijacije za 2–4 igrača. Domaćin napravi sobu i pošalje link, ostali uđu, a prazna mjesta mogu popuniti botovi.
Radi na Cloudflare Workers + Durable Objects (isti nalog kao Termin i Čovječe ne ljuti se), isto kao `covjece-ne-ljuti-se`.

## Struktura

- `src/index.html`: izgled i igra u browseru (HTML, CSS, JS, bez biblioteka)
- `src/worker.js`: ulaz: stranica, pravljenje sobe, WebSocket
- `src/room.js`: jedna soba = jedan Durable Object (igrači, botovi, tajmer, stanje)
- `src/lobby.js`: lista otvorenih soba (jedan Durable Object za cijelu aplikaciju)
- `src/game.js`: pravila igre (samo logika, server je sudija)
- `src/puzzles.js`: teme i asocijacije koje su u igri (ovdje dodaješ nove)
- `src/images.js`: slika pogođenog pojma sa Wikimedia Commons
- `src/puzzles-ostalo.js`: arhiva asocijacija koje nisu u igri (more, škola, zima…, fudbalski pojmovi), trenutno se ne koristi
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
U drugom terminalu: `node test/online.mjs` odigra partiju od 4 runde preko mreže (traje oko minut i po).

## Teme

Teme se biraju samo na početnoj stranici, prije „Napravi novu sobu“ (može više njih, ili „Sve teme“). U sobi se samo prikazuju i ne mogu se mijenjati.
Izbor se pamti u browseru.
Za sada postoji samo tema ⚽ Fudbal (76 asocijacija). Kad je tema samo jedna, na početnoj se prikazuje samo ona.
Stare teme (Svakodnevica, Priroda, Sport, Naše, Kultura, Pojmovi i pravila) su u `src/puzzles-ostalo.js`; da ih vratiš, prekopiraj teme u `THEMES` i asocijacije u `PUZZLES`.

Nova tema: dodaj je u `THEMES` na vrhu `src/puzzles.js` (`id: 'naziv'`) i napiši bar 5 asocijacija s tim `T`.
`npm test` provjerava da svaka tema ima bar 5 i da nijedno polje samo po sebi ne odaje rješenje.

## Težine

Asocijacije imaju oznaku težine (`L: 'srednje'`; bez `L` = lako), ali se težina za sada ne bira:
igra nasumično uzima iz svih asocijacija (39 lakih + 37 srednjih). Oznake su tu ako se izbor kasnije vrati.

## Slika pojma

Kad se otkrije konačno rješenje, soba na Wikimedia Commons potraži slobodne fotografije za pojam (polje `W` u asocijaciji,
npr. `W: 'Lionel Messi'`), izabere nasumičnu i pošalje svima isti link. Ništa se ne čuva u projektu.
Ispod slike piše autor, licenca i link na Commons. Grbovi, zastave, potpisi i slične slike se preskaču;
za klubove `W` je njihov stadion. Server čeka najviše 8 s.

Ako server ne dobije sliku, browser svakog igrača pokuša sam (tada igrači mogu vidjeti različite slike).
Ako ni to ne uspije, prikaže se emoji iz polja `E` i ispod sitno piše razlog, npr. „server: http 403 · browser: ok“.

Zašto server nije dobio sliku vidi se uživo dok igraš:

```
npx wrangler tail
```

Za svaku rundu ispiše npr. `slika [Lionel Messi]: ok` ili `slika [Lionel Messi]: http 403`.

## Nove asocijacije

U `src/puzzles.js` dodaj novi blok:

```js
{ T: 'fudbal', L: 'srednje', F: 'KONAČNO|druga varijanta', W: 'Engleski naziv za sliku', E: '⚽',
  A: ['RJEŠENJE A|varijanta', 'polje1', 'polje2', 'polje3', 'polje4'],
  B: [...], C: [...], D: [...] },
```

- Prvo u listi je rješenje koje se prikazuje, ostalo iza `|` se takođe priznaje.
- Kvačice, velika slova i razmaci se ne gledaju. Kod riječi od 5+ slova prolazi i jedna greška u kucanju.
- `npm test` provjeri da svaka kolona ima rješenje i tačno 4 polja.
- Asocijacije se u jednoj partiji ne ponavljaju.

## Pravila

- Na potezu otvoriš jedno polje, pa pogađaš rješenje neke kolone ili konačno rješenje, ili kažeš **Dalje**.
- Pogodak: pogađaš dalje (bez otvaranja novog polja). Promašaj: potez ide sljedećem igraču.
- **Kolona:** 2 boda + 1 za svako neotvoreno polje u toj koloni.
- **Konačno rješenje:** 7 bodova + bodovi svih neriješenih kolona. Runda se tada završava.
- Kad su sva polja otvorena, odmah se pogađa. Ako niko ne zna, igrač na potezu može otkriti rješenje (bez bodova).
- Svaku rundu počinje sljedeći igrač. Teme se biraju pri pravljenju sobe; domaćin u sobi bira broj rundi (4, 8 ili 12) i da li je soba javna.
- **Vrijeme:** 25 s za otvaranje, 45 s za pogađanje (8 s ako je igrač ispao s mreže).
  Kad istekne: otvori se nasumično polje, odnosno igrač kaže dalje.
- Između rundi je pauza od 12 s (vidi se rješenje i slika); domaćin je može preskočiti.
- Ako igrač izađe usred partije, mjesto preuzima bot.
- **Botovi** "znaju" rješenje kolone s vjerovatnoćom koja raste s brojem otvorenih polja (`botAction` u `src/game.js`),
  a konačno sve sigurnije što je više kolona riješeno. Ponekad i promaše.
- Browser nikad ne dobije neotvorena polja ni nepogođena rješenja (to provjerava i `test/online.mjs`).
- Reakcije (emoji) se šalju svima u sobi.
