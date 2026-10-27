# Spellenkast

Vier klassieke solospellen in één installeerbare webapp die na de eerste keer openen volledig offline werkt:
**Blokval** (vallende blokken), **Woordzoeker**, **2048** en **Klondike**.
Nederlandstalig, geen account, geen advertenties, geen backend. Alles wordt alleen op het apparaat bewaard.

---

## 1. Lokaal starten (pc, Windows of macOS)

Vereist: [Node.js](https://nodejs.org) 18 of nieuwer (gratis). Er zijn **geen** pakketten nodig om de app te draaien.

```bash
cd spellenkast
node tools/serve.mjs          # of: npm start
```

Open daarna **http://localhost:8080** in Chrome, Edge of Safari.

> Dubbelklikken op `app/index.html` werkt niet: browsers staan offline-opslag (service worker) en modules alleen toe via `http://localhost` of `https://`.

## 2. Installeren

### Pc (Windows en macOS)

1. Start de server zoals hierboven en open http://localhost:8080.
2. Wacht tot onderaan de startpagina **"✓ Klaar voor offline gebruik"** staat.
3. Installeer:
   - **Chrome of Edge** (Windows/macOS): klik op het installatie-icoon rechts in de adresbalk, of menu ⋮ → *Apps* → *Spellenkast installeren*.
   - **Safari** (macOS Sonoma of nieuwer): *Archief* → *Voeg toe aan Dock*.
   - Firefox kan de app gewoon in een tabblad draaien (ook offline), maar installeert geen losse app.
4. Je kunt de server daarna stoppen. De geïnstalleerde app start voortaan uit het startmenu/Dock, ook zonder internet en zonder server.

### iPhone

Een iPhone installeert een webapp alleen offline-geschikt vanaf een **https**-adres. Een adres als `http://192.168.1.20:8080` uit je thuisnetwerk werkt wel om te spelen, maar **niet** offline. Kies één van deze twee routes:

**Route A — gratis statische hosting (eenvoudigst, ~5 minuten).**
Zet de inhoud van de map `app/` op een gratis statische host, bijvoorbeeld GitHub Pages, Cloudflare Pages of Netlify (map slepen). Dit is *publiceren*: het adres is openbaar bereikbaar (er staan geen persoonlijke gegevens in de app; je voortgang blijft op je telefoon). Ik heb dit niet voor je gedaan, omdat je daar eerst toestemming voor moet geven.

**Route B — volledig privé, alleen in je thuisnetwerk.**
Maak met [mkcert](https://github.com/FiloSottile/mkcert) een lokaal certificaat, draai een https-server op je pc, installeer het mkcert-rootcertificaat op de iPhone en zet het aan onder *Instellingen → Algemeen → Info → Certificaatvertrouwen*. Meer stappen, maar niets komt online.

Daarna, op de iPhone:

1. Open het https-adres in **Safari**.
2. Tik op **Deel** → **Zet op beginscherm**. Laat **"Open als webapp"** aan staan (standaard sinds iOS 26) → **Voeg toe**.
3. Open Spellenkast **één keer vanaf het beginscherm** terwijl je online bent en wacht op "✓ Klaar voor offline gebruik".
4. Klaar: vanaf nu start de app vanaf het beginscherm, ook in vliegtuigmodus.

Let op: de beginscherm-app heeft **eigen opslag**, los van Safari. Voortgang uit een Safari-tabblad verschijnt niet in de geïnstalleerde app. Installeer dus eerst en speel daarna.

### Is internet nodig?

Alleen bij de **eerste keer openen** (of bij een update): dan worden alle bestanden (± 180 kB) eenmalig binnengehaald. Daarna niet meer: geen CDN, geen woorden-API, geen externe lettertypen, geen geluidsbestanden (geluiden worden in de browser gesynthetiseerd).

## 3. Opslag: wat je moet weten

| Situatie | Wat gebeurt er met voortgang en scores? |
|---|---|
| App sluiten, telefoon herstarten | Blijft bewaard. Elke zet wordt meteen opgeslagen. |
| App-update | Blijft bewaard. Elk opgeslagen record heeft een formaatversie; oude formaten worden gemigreerd of netjes overgeslagen. |
| Beschadigde of onleesbare gegevens | De app crasht niet: het kapotte record wordt apart gezet (`…:kapot`), je krijgt een melding en begint dat spel opnieuw. |
| App van het beginscherm verwijderen (iPhone) | Ga ervan uit dat de gegevens weg zijn. |
| App verwijderen (Chrome/Edge) of browsergegevens / websitegegevens wissen | Gegevens zijn weg. |
| Privévenster | Opslag kan geblokkeerd zijn; de app werkt dan alleen voor die sessie (je krijgt dat te zien bij Instellingen). |
| Ander adres (bijv. localhost vs. https-host) | Elk adres heeft eigen, gescheiden opslag. |
| Weinig vrije schijfruimte | Browsers mogen in uitzonderlijke gevallen opslag opruimen. De app vraagt bij de browser "blijvende opslag" aan (`navigator.storage.persist()`) om dat te voorkomen. Beginscherm-apps op iOS vallen niet onder Safari's 7-dagen-opruimregel. |

**Reservekopie:** Instellingen (⚙︎) → *Reservekopie maken* bewaart alles als JSON-bestand; *Terugzetten* zet het terug, ook op een ander apparaat. Synchronisatie tussen apparaten zit niet in deze versie.

## 4. De spellen

| Spel | Bediening | Bijzonderheden |
|---|---|---|
| **Blokval** | Schermknoppen (ingedrukt houden herhaalt), tikken/slepen/vegen op het bord, toetsen ← → ↓, ↑/X, Z, spatie, P/Esc | 7-blokkenzak, muurschoppen, schaduw van landingsplek, vertraagd vastzetten, niveau per 10 rijen, pauze (ook automatisch bij wegschakelen), hervat altijd gepauzeerd |
| **Woordzoeker** | Slepen (vinger/muis), tik-tik (eerste en laatste letter), toetsenbord (pijltjes + Enter) | 8 thema's met ± 300 Nederlandse woorden, 3 niveaus (8×8 → 12×12, tot 8 richtingen), elk woord staat gegarandeerd precies één keer in het rooster, tijd en beste tijden per niveau |
| **2048** | Vegen, pijltjestoetsen of W A S D | Elke tegel voegt hooguit één keer per zet samen, nieuwe tegel alleen na een geldige zet, winst bij 2048 met doorspelen, game-over, beste score |
| **Klondike** | Slepen, of tik kaart → tik bestemming; nogmaals tikken = automatisch verplaatsen; Tab + Enter; Ctrl/⌘+Z | Eén kaart trekken, onbeperkt doorlopen, ongedaan maken (100 stappen, ook na hervatten), automatisch afmaken, winst- en tijdstatistiek |

Elk spel heeft een **?**-knop met een korte uitleg van de regels. **Nieuw** vraagt eerst bevestiging als er een spel bezig is.

## 5. Technische opbouw

**Keuze:** installeerbare webapp (PWA), zonder framework en zonder buildstap: gewone ES-modules, CSS en een service worker. Eén codebasis voor iPhone en pc, gratis te verspreiden. Een native verpakking (Capacitor/Tauri) zou op de iPhone een Mac met Xcode vereisen, en met een gratis Apple-account verloopt zo'n zelf geïnstalleerde app na 7 dagen.

```
app/                       ← dit is de volledige app (deze map host je)
  index.html, manifest.webmanifest, sw.js
  css/app.css              gedeelde stijl, licht/donker, per spel een sectie
  icons/                   app-iconen
  js/app.js                opstarten, navigatie, startpagina, instellingen, updates
  js/core/
    storage.js             opslag met versies, migratie, quarantaine, reservekopie
    gamestore.js           opslag per spel: stand, statistieken, voorkeuren
    settings.js            geluid, animaties, thema
    sound.js               gesynthetiseerde geluiden (Web Audio)
    ui.js                  dialogen, meldingen, overlays
    util.js                hulpfuncties (seeded random, DOM-helper, tijdnotatie)
  js/games/registry.js     lijst van spellen
  js/games/<spel>/logic.js spelregels: puur, zonder DOM → met unit tests
  js/games/<spel>/game.js  scherm en bediening van dat spel
tools/serve.mjs            kleine webserver zonder afhankelijkheden
tools/build-sw.mjs         werkt offline-bestandenlijst + versie in sw.js bij
tools/make-icons.py        maakt de iconen opnieuw (Python + Pillow)
tests/                     unit tests (node --test)
e2e/                       browsertests (Playwright/Chromium)
```

**Offline:** `sw.js` slaat bij installatie alle bestanden op in een cache met een versie-hash. Alles wordt daarna uit die cache geladen. Een nieuwe versie wordt op de achtergrond binnengehaald; de app toont dan "Er is een nieuwe versie klaar" en wisselt pas als je op *Bijwerken* tikt (de lopende stand wordt eerst opgeslagen).

**Opslag:** `localStorage`, één record per spel voor de lopende stand, één voor statistieken (en optioneel voorkeuren), elk als `{ v: formaatversie, t: tijd, d: gegevens }`. Bij het lezen wordt elk record gevalideerd door het spel zelf.

**Na elke wijziging aan bestanden in `app/`:** draai `node tools/build-sw.mjs` (of `npm run build`). Dat werkt de bestandenlijst en het versienummer bij, zodat geïnstalleerde apps de update krijgen.

## 6. Testen

```bash
npm test                 # 57 unit tests: spelregels en opslag (alleen Node nodig)
npm install              # eenmalig, voor de browsertests
npx playwright install chromium
npm run build && npm run test:browser   # 61 browsercontroles, schermafbeeldingen in e2e/screenshots/
```

### Uitgevoerde tests (in deze oplevering, allemaal geslaagd)

**Unit tests (57)** — o.a.: 2048-samenvoegregels ([2,2,2,2]→[4,4], [4,4,8]→[8,8]), geen tegel na ongeldige zet, winst één keer, game-over; Blokval-bewegen, draaien met muurschoppen, 7-zak, rijen wissen en scoren, niveau, game-over; Woordzoeker: 288 gegenereerde puzzels over alle thema's en niveaus gecontroleerd op geldigheid en "elk woord precies één keer", selectie voor- en achteruit, voltooiing; Klondike: delen (52 unieke kaarten, 1–7, 24 in de stapel), trekken en terugdraaien, alle plaatsingsregels, reeksen, omdraaien, winst, automatisch afmaken, ongedaan-maken-momentopnamen; opslag: ontbrekend, kapotte JSON, verkeerde structuur, ongeldige gegevens, migratie, mislukte migratie, nieuwer formaat, volle opslag, geen opslag, reservekopie.

**Browsertests (61, Chromium headless, aanraak-emulatie)** — service worker cachet alles; alle vier spellen speelbaar met toetsenbord, muis en aanraking; **browser volledig afgesloten, server uit, netwerk uit → app en alle vier spellen starten**; hervatten geeft exact dezelfde stand (ook Klondike met ongedaan-geschiedenis); bevestiging bij nieuw spel; beschadigde opslag (drie records) leidt tot schone start zonder crash; app-update wordt gemeld, geactiveerd en laat alle opgeslagen gegevens ongemoeid; instellingen blijven bewaard; elk spel past zonder horizontaal scrollen op 320×568, 375×667, 1280×800 en liggend 844×390; donkere weergave.

### Nog te doen op echte apparaten (niet door mij uitgevoerd)

Er is in deze omgeving geen Safari/WebKit en geen fysiek toestel beschikbaar. Controleer daarom zelf:

- [ ] iPhone (Safari, iOS 16.4 of nieuwer): installeren via *Zet op beginscherm*, daarna in vliegtuigmodus openen, app volledig afsluiten (omhoog vegen) en opnieuw openen.
- [ ] iPhone: vegen in 2048, slepen in Woordzoeker en Klondike, knoppen ingedrukt houden in Blokval; controleren dat de pagina niet meeschuift of inzoomt.
- [ ] iPhone: geluid (let op: de stille-modusschakelaar dempt webgeluid).
- [ ] Windows (Chrome/Edge) en macOS (Safari/Chrome): installeren, offline openen na herstart van de computer.
- [ ] Notch/Dynamic Island en de onderbalk van de iPhone in staande en liggende stand.

## 7. Bekende beperkingen

- iPhone-installatie vereist een https-adres (zie route A of B).
- Opslag is per apparaat én per adres; geen synchronisatie (wel handmatige reservekopie).
- Klondike: alleen "één kaart trekken" (zoals gevraagd); geen hint-functie.
- Blokval: geen "vasthouden" van een blok en geen T-spin-bonussen (bewust eenvoudig gehouden).
- Woordzoeker: woorden zonder accenten; IJ telt als twee letters (I + J).

## 8. Een spel toevoegen

1. Maak een map `app/js/games/<naam>/` met:
   - `logic.js` — de spelregels als pure functies (geen DOM), plus `validateState(state)`.
   - `game.js` — een standaard-export met dit contract:

```js
export default {
  id: 'mijnspel',                 // uniek, wordt ook opslagsleutel en URL (#/mijnspel)
  name: 'Mijn spel',
  short: 'Eén zin uitleg voor de startpagina.',
  accent: 'var(--kleur-mijnspel)', // definieer de kleur in css/app.css (licht én donker)
  icon: '<svg viewBox="0 0 48 48">…</svg>',  // gebruik currentColor
  help: '<p>Spelregels in HTML.</p>',
  storage: {
    stateVersion: 1, statsVersion: 1,
    validateState: (s) => …,           // true als een opgeslagen stand bruikbaar is
    migrateState: (oud, vanVersie) => …, // optioneel, bij een nieuwe stateVersion
    defaultStats: () => ({ … }),
    validateStats: (s) => …,
    // optioneel: prefsVersion, defaultPrefs, validatePrefs
  },
  isFinished: (state) => …,           // afgelopen spel = niet hervatbaar
  isInProgress: (state) => …,         // bepaalt of "Nieuw" eerst bevestiging vraagt
  statLine: (stats) => 'Tekst op de startpagina',
  mount(ctx, { fresh }) {
    // ctx.root (element), ctx.store (loadState/saveState/loadStats/saveStats/…),
    // ctx.sound.play(naam), ctx.confirm, ctx.toast, ctx.overlay, ctx.clearOverlay,
    // ctx.isBlocked(e) (toetsen negeren als er een dialoog open is), ctx.reducedMotion()
    return { newGame(), save(), destroy(), isInProgress(), pause() /* optioneel */ };
  },
};
```

2. Importeer het spel in `app/js/games/registry.js` en zet het in de lijst `GAMES`.
3. Voeg stijlen toe in `app/css/app.css` (gebruik de klasse `geen-scroll` op het speelveld).
4. Schrijf unit tests in `tests/<naam>.test.mjs` voor `logic.js`.
5. Draai `node tools/build-sw.mjs`, daarna `npm test` en `npm run test:browser`.
