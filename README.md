# Palermo — Esplorazione demografica a raggio mobile

Mappa web interattiva per esplorare la struttura demografica di Palermo a scala di quartiere e di isolato.
Si sceglie un punto sulla mappa (o si disegna un'area) e si ottiene il profilo della popolazione residente,
calcolato sulle **sezioni di censimento ISTAT 2021**: 3.600 sezioni nel Comune, 3.079 con dati di popolazione,
635.439 residenti.

Tutti i calcoli avvengono nel browser su file statici: non serve un backend, un database o un tile server.

---

## Indice

- [Funzionalità](#funzionalità)
- [Metodologia](#metodologia)
  - [Fonti dei dati](#fonti-dei-dati)
  - [Preparazione dei dati](#preparazione-dei-dati)
  - [Unità di analisi](#unità-di-analisi)
  - [Selezione delle sezioni](#selezione-delle-sezioni)
  - [Aggregazione degli indicatori](#aggregazione-degli-indicatori)
  - [Densità e copertura edificata](#densità-e-copertura-edificata)
  - [Classifiche territoriali](#classifiche-territoriali)
  - [Analisi DTM](#analisi-dtm)
  - [Esportazione CSV](#esportazione-csv)
  - [Limiti](#limiti)
- [Architettura](#architettura)
- [Struttura del progetto](#struttura-del-progetto)
- [Avvio in locale](#avvio-in-locale)
- [Test](#test)
- [Licenza e crediti](#licenza-e-crediti)

---

## Funzionalità

- **Area circolare mobile**: cerchio trascinabile e ridimensionabile (raggio iniziale 250 m, minimo 50 m); grafici e KPI si aggiornano durante il trascinamento
- **Poligono libero**: area disegnata vertice per vertice (doppio click o click sul primo vertice per chiudere, `Esc` per annullare)
- **Selezione da confine amministrativo**: circoscrizione, quartiere o UPL scelti da un menu, con il perimetro esatto del poligono invece di un'approssimazione a mano; nel confronto A/B la zona B è un secondo poligono dello stesso livello
- **Confronto A/B**: due zone affiancate con grafici, KPI e differenze dedicate
- **Argomenti**: popolazione e sesso, piramide età-sesso, stranieri, nazionalità principali, istruzione, occupazione, famiglie, abitazioni; filtro stranieri e scala comune fra grafici
- **Pannello territorio**: localizzazione della zona (UPL · quartiere · circoscrizione), indici morfologici del DTM, classifica della popolazione per circoscrizioni, quartieri e UPL
- **Livelli**: edifici 3D colorati per densità di popolazione o copertura edificata, elevazione, sezioni censuarie, confini amministrativi
- **Mappa**: vista 2D/3D con rilievo, base satellitare, tema chiaro/scuro, schermo intero, legenda richiudibile
- **Esportazione CSV**: totali per argomento e dettaglio grezzo per sezione ISTAT
- **Accessibilità e mobile**: navigazione da tastiera, attributi ARIA, pannello a tre livelli su smartphone, rispetto di `prefers-reduced-motion`

La scheda **Guida** dell'applicazione spiega ogni funzione con le schermate; la scheda **Metodologia** riassume quanto descritto qui sotto.

---

## Metodologia

Il flusso ha quattro fasi:

```
 PREPARAZIONE (offline, una volta)          APPLICAZIONE (browser, in tempo reale)
 ─────────────────────────────────          ─────────────────────────────────────────
 ISTAT variabili ─┐                         area di analisi (cerchio / poligono)
 ISTAT sezioni ───┼─ join SEZ21_ID ─► JSON ──► quote per edifici ──► somma pesata dei conteggi ──► grafici, KPI, CSV
 confini comunali ┘   + centroidi             │
 edifici (4 fonti) ─► PMTiles                  ├─► edifici nella zona evidenziati
 HR-DTM-5m ─► griglia 50 m (MVT)               └─► punto DTM più vicino + UPL/quartiere/circoscrizione
           ─► raster elevazione / Terrarium
```

### Fonti dei dati

| Dato | Fonte | Uso nella mappa | Licenza |
|------|-------|-----------------|---------|
| Variabili censuarie per sezione | [ISTAT — Censimento permanente 2021](https://www.istat.it/notizia/basi-territoriali-e-variabili-censuarie/) | Indicatori dei grafici e dei CSV | CC BY 4.0 |
| Basi territoriali, sezioni 2021 | ISTAT | Geometrie, centroidi, superfici | CC BY 4.0 |
| Circoscrizioni, quartieri, UPL | Comune di Palermo | Confini, classifiche, localizzazione | open data |
| Edificato 3D (111.844 edifici) | Volumetria comunale 2006, Overture Maps, Global Building Atlas (DLR/TUM), OpenBuildingMap | Edifici estrusi e colorati per densità | varie licenze aperte |
| Modello digitale del terreno | [HR-DTM-5m, IRPI-CNR](https://doi.org/10.5281/zenodo.18872933) (Panza et al., 2026) | Rilievo 3D, elevazione, indici DTM | CC BY 4.0 |
| Mappa di base | [OpenFreeMap](https://openfreemap.org/) (dati © OpenStreetMap) | Sfondo chiaro e scuro | ODbL |

L'edificato e la griglia DTM provengono dal progetto gemello
[palermo_dtm5m](https://palermohub.opendatasicilia.it/palermo_dtm5m.html): gli edifici sono il risultato
della fusione di quattro fonti con priorità alla geometria più dettagliata.

### Preparazione dei dati

Operazioni eseguite una sola volta con GDAL/OGR, QGIS e tippecanoe; i sorgenti sono in `dati/`, i prodotti in `data/`.

1. **Join dati–geometrie**: le variabili ISTAT (`dati/Palermo_indicatori_2021_sezioni.csv`, dizionario dei campi in
   `..._dizionario.csv`) sono agganciate alle sezioni con la chiave `SEZ21_ID`. A ogni sezione si aggiungono
   circoscrizione, quartiere e UPL di appartenenza, superficie (`Area`, m²) e coordinate del centroide (`lon`, `lat`).
2. **Indicatori**: i 3.600 record risultanti sono esportati in `data/sezioni_indicatori.json` (~6 MB), caricato all'avvio.
3. **Tile vettoriali**: sezioni (`geo_sezioni_2021.pmtiles`, layer `sezioni`), confini
   (`confini_amministrativi.pmtiles`, layer `circoscrizioni`, `quartieri`, `upl`) ed edifici (`edificato.pmtiles`,
   layer `edificato`, zoom 10–16) sono riproiettati in WGS84 e convertiti in **PMTiles** con tippecanoe.
   Il browser legge l'archivio con richieste HTTP `Range`, senza tile server.
4. **Attributi degli edifici**: ogni edificio riceve `SEZ21_ID` della sezione in cui ricade e ne eredita
   `dens_pop_ha` (abitanti/ettaro) e `COP_EDIF_PCT` (% di superficie coperta da edifici); `altezza` alimenta l'estrusione 3D.
5. **Terreno**: dall'HR-DTM-5m derivano le tile raster di elevazione (`data/elevazione/`), le tile di rilievo in
   codifica *Terrarium* per la vista 3D (`data/terrain/`) e una griglia di punti a passo 50 m con gli indici
   morfologici (`data/griglia_pbf/`, MVT non compressi, zoom 8–15).

### Unità di analisi

La sezione di censimento è la più piccola ripartizione per cui ISTAT pubblica variabili su popolazione, famiglie,
istruzione, occupazione e abitazioni; nel centro storico coincide spesso con un isolato.

| | Sezioni |
|---|---:|
| Totale Comune di Palermo | 3.600 |
| Con dati di popolazione | 3.079 |
| di cui con zero residenti (dato valido) | 112 |
| Senza dati di popolazione (`P1` nullo) | 521 |

### Selezione delle sezioni

Le sezioni entrano nella zona **per edifici** (interpolazione dasimetrica, `js/dasimetria.js`): ogni sezione pesa
la quota dei suoi residenti stimati (vedi [Mappa dasimetrica e punti](#mappa-dasimetrica-e-punti)) che abita in
edifici il cui punto interno cade nella zona, e ogni campo ISTAT della sezione è scalato per quel peso. Una sezione
tagliata a metà dal cerchio conta quindi per la parte abitata che ricade dentro, non per intero o per niente. Si
assume una composizione (età, cittadinanza, famiglie…) uniforme dentro la sezione.

- L'indice `data/edifici_zona.json` (circa 90.000 righe, 2,5 MB; 0,5 MB compresso) si carica dopo l'avvio; finché
  non è pronto, o se manca, si ripiega sull'inclusione per **centroide** (la sezione conta per intero oppure no).
- Il peso è normalizzato sul totale della sezione nell'indice: una zona che contiene tutta la sezione vale 1.
- La sezione fittizia 8888888 (senza fissa dimora) non ha edifici e non entra mai nei totali delle zone.
- Le sezioni senza dati (`P1` nullo, tutte con 0 residenti) restano incluse per centroide, solo per il conteggio
  "sezioni senza dati".

Il test geometrico, per centroidi ed edifici:

- **Cerchio** — `filterWithinRadius`: distanza geodetica *haversine* (raggio terrestre 6.371 km) fra centro e
  centroide, confrontata con il raggio.
- **Poligono** — `filterWithinZone`: prefiltro con il rettangolo di ingombro, poi test punto-in-poligono
  (*ray casting*) in coordinate lon/lat; l'errore planare è trascurabile alla scala urbana.
- **Confine amministrativo** — stesso codice del poligono: `js/geometry.js` distingue solo il cerchio, per ogni
  altro tipo di zona usa l'anello esterno del poligono scelto (`data/confini_zone.json`, generato da
  `scripts/build_confini_zone.py` a partire dai confini sorgente in `dati/`, riproiettati da EPSG:32632 a WGS84).
- **Aggiornamento**: durante il trascinamento il ricalcolo è limitato a una volta ogni 60 ms. Con 3.600 centroidi
  la scansione lineare è immediata e non serve un indice spaziale.

### Aggregazione degli indicatori

`aggregateTopic` (`js/topics.js`) somma i campi di ogni argomento sulle sezioni selezionate. Le percentuali sono
calcolate sui totali della zona, non come media delle percentuali di sezione.

| Argomento | Campi ISTAT | Contenuto |
|-----------|-------------|-----------|
| Popolazione e sesso | `P1` `P2` `P3` | Residenti totali, maschi, femmine |
| Piramide età-sesso | `P30`–`P45` (M), `P67`–`P82` (F) | 16 fasce quinquennali, da 0–4 a >74 |
| Stranieri | `ST1` `ST16` `ST19` `ST3`–`ST5` | Totale, UE, extra-UE, fasce 0–29 / 30–54 / 55+ |
| Nazionalità principali | `CIT_1_BGD` … `CIT_10_NGA` | Le 10 cittadinanze straniere riportate per Palermo |
| Istruzione | `P86`–`P90` | Titolo più alto, residenti di 9 anni e più |
| Occupazione | `P101`–`P103` | Occupati di 15–64 anni, totali e per sesso |
| Famiglie | `PF3`–`PF8` | Famiglie da 1 a 6+ componenti |
| Abitazioni | `A2` `A3` `A8` | Occupate da residenti, vuote o occupate da non residenti, totali |

Regole particolari:

- **Sezioni senza dati**: contate a parte e segnalate con un badge, escluse dai totali. I valori non numerici
  valgono 0 nella somma.
- **Filtro stranieri**: con *Stranieri* attivo insieme ad altri argomenti, i grafici compatibili usano le serie
  straniere (es. `ST2`/`ST2_B` per il sesso). La piramide passa a 3 fasce (`ST25`–`ST30`: 0–14, 15–64, 65+),
  le sole che ISTAT incrocia con il sesso per gli stranieri.
- **Scala comune**: con più argomenti attivi, l'opzione *Scala* applica lo stesso massimo a tutti i grafici.
- **Confronto A/B**: la zona B segue le stesse regole della zona A.

### Densità e copertura edificata

Gli edifici sono colorati con l'indicatore della sezione in cui ricadono (`js/map.js`, espressione `interpolate`
di MapLibre):

- **Densità di popolazione** `dens_pop_ha` = residenti ÷ superficie della sezione, in ab/ha (rampa 0 · 50 · 150 · 400+)
- **Copertura edificata** `COP_EDIF_PCT` = superficie coperta da edifici ÷ superficie della sezione (0–100%)

Dentro la zona di analisi gli edifici mostrano sempre la densità di popolazione. Un edificio è interno se il suo
centroide (media dei vertici) cade nella zona; lo stato è applicato con `setFeatureState`, senza ricaricare le tile.

### Mappa dasimetrica e punti

`scripts/dasimetrica.py` ridistribuisce i residenti di ogni sezione (`P1`) sugli edifici il cui punto interno
cade nella sezione, in proporzione a **impronta × piani × coefficiente d'uso**:

- piani = `altezza` ÷ 3 m arrotondato, minimo 1; le impronte con altezza 0 (piatte, invisibili in mappa) non
  ricevono residenti;
- coefficiente d'uso da `occupancy`: residenziale e sconosciuto 1, misto 0,5, commercio, industria, scuole, uffici,
  servizi e agricolo 0;
- esclusi gli edifici sotto 20 m² o sotto 2,5 m di altezza (tettoie, box);
- se nessun edificio della sezione ha peso, si usa la superficie lorda di tutti i suoi edifici visibili;
- le sezioni abitate senza edifici utili (11, 212 residenti: confini che tagliano parchi o piazze, come
  Castello a Mare) cedono i residenti agli edifici residenziali entro 100 m (poi 250 m) dal loro confine;
- lo stesso vale per le sezioni con meno di 10 m² di superficie lorda per abitante (36 sezioni, densità
  impossibile: mancano edifici nel dataset). In tutto sono ricollocati circa 5.800 residenti (0,9%);
- la **sezione fittizia 8888888** (517 residenti, 55 stranieri) raccoglie gli iscritti in anagrafe a un
  indirizzo fittizio, cioè persone senza tetto o senza fissa dimora. Il suo poligono in Villa Garibaldi è
  simbolico: è esclusa da dasimetrica e punti, che quindi rappresentano 634.922 residenti.

Ne derivano `pop_stim` (residenti stimati) e `dens_das` (residenti per ettaro di impronta) in `edificato.pmtiles`,
e due file di punti collocati a caso (seed fisso) dentro le impronte: `punti_pop_10.pmtiles` (**1 punto = 10
residenti**, zoom 10–13) e `punti_pop_1.pmtiles` (**1 punto = 1 residente**, da zoom 14). I punti sono ripartiti
tra gli edifici col metodo dei resti maggiori, così il totale di ogni sezione è rispettato. Ogni punto cade dentro
un edificio visibile.

Ogni punto porta `straniero` (0/1). Per sezione i punti stranieri sono `ST1` (a 1:10 con arrotondamento
stocastico, corretto in media); **quali** punti lo siano è casuale, perché il censimento non dice in quale edificio
della sezione vivono. La composizione per sezione è un dato, la posizione del singolo punto no. Rigenerazione: `python3 scripts/dasimetrica.py &&
scripts/dasimetrica_tiles.sh`.

La stima è modellata: l'85% degli edifici ha uso sconosciuto e conta come residenziale, quindi negozi e uffici
senza classe ricevono residenti.

### Classifiche territoriali

`aggregateByField` (`js/punto.js`) somma `P1` e `ST1` per 8 circoscrizioni, 25 quartieri e 55 UPL; gli italiani
sono ricavati per differenza (`P1 − ST1`). L'unità evidenziata è quella in cui cade il centro della zona A,
individuata interrogando il confine UPL visualizzato in quel punto.

### Analisi DTM

Il pannello di destra descrive il terreno con l'**HR-DTM-5m** dell'IRPI-CNR (LiDAR 1–2 m integrato con TINITALY
10 m). Gli indici sono calcolati sul DTM a 5 m e campionati su una griglia a passo 50 m.

- `findNearestGrigliaPoint` (`js/griglia.js`) carica, allo zoom 15, la tile che contiene il centro della zona A e le
  otto adiacenti, poi sceglie il punto a distanza haversine minima. Il valore è **puntuale**, non una media sulla zona.
  Le tile scaricate restano in cache per la sessione.
- Indici mostrati: quota, pendenza (gradi e %), esposizione, forma del terreno, stabilità dei versanti,
  costruibilità morfologica, TRI, TPI, SRI, hillshade, TWI, SPI, accumulo di flusso, profondità della falda (DTW),
  cielo visibile (SVF), potenziale fotovoltaico, ombra estiva e invernale, rischio gelata, velocità di cammino di
  Tobler, visibilità cumulativa, fattore LS della RUSLE.
- La vista 3D usa lo stesso DTM (codifica Terrarium) con esagerazione verticale 1,5.

### Esportazione CSV

`js/export.js` produce due file, con separatore `;` e virgola decimale (lettura diretta in Excel/LibreOffice
in italiano):

- **Totali**: una riga per voce e una colonna per zona (A, e B se il confronto è attivo). Include tipo di area,
  coordinate del centro, superficie (π·r² per il cerchio, formula di Gauss su proiezione equirettangolare locale
  per il poligono), numero di sezioni, sezioni senza dati e tutti gli argomenti aggregati (senza filtro stranieri).
- **Sezioni**: una riga per sezione inclusa con tutti i campi ISTAT originali (dell'intera sezione), la colonna
  `Zona` e `Quota_zona`, cioè il peso con cui la sezione entra nei totali (1 = per intero).

### Limiti

- I dati descrivono la popolazione residente al **2021**.
- I totali per edifici sono **stime**: dipendono dal modello dasimetrico (peso impronta × piani, uso sconosciuto
  per l'85% degli edifici) e ripartiscono i campi ISTAT in proporzione ai residenti, quindi sono in genere numeri
  non interi arrotondati.
- Con raggi sotto i 150–200 m il risultato è sensibile a piccoli spostamenti del centro.
- Forma e dimensione dell'area influenzano i risultati (**MAUP**, problema dell'unità areale modificabile).
- Le **521 sezioni senza dati** rendono i totali una stima per difetto dove sono concentrate.
- Densità e copertura sono valori di **sezione**: tutti gli edifici della stessa sezione hanno lo stesso colore
  (la modalità **Dasimetrica** li differenzia, ma resta una stima).
- L'edificato fonde fonti di anni diversi: forme e altezze sono indicative.
- Il pannello DTM riporta il punto di griglia più vicino, non una statistica zonale.

I risultati sono stime a fini esplorativi e divulgativi e non sostituiscono le statistiche ufficiali.

---

## Architettura

- **Rendering**: [MapLibre GL JS](https://maplibre.org/) 4.7 con protocollo [PMTiles](https://docs.protomaps.com/pmtiles/) 3.0
- **Grafici**: [Chart.js](https://www.chartjs.org/) 4.4 + chartjs-plugin-datalabels
- **Decodifica MVT della griglia DTM**: `pbf` + `@mapbox/vector-tile` (via esm.sh)
- **Basemap**: [OpenFreeMap](https://openfreemap.org/) (stili *positron* e *dark*)
- **Codice**: JavaScript ES modules, nessun framework e nessun build step

Flusso applicativo: `probe.js` / `polygon.js` emettono la zona → `geometry.js` seleziona le sezioni →
`topics.js` aggrega → `charts.js` aggiorna i grafici (senza ricreare le istanze) → `punto.js` e `griglia.js`
aggiornano il pannello territorio → `map.js` evidenzia gli edifici.

---

## Struttura del progetto

```
index.html              pagina principale (mappa, pannelli, schede Metodologia/Guida/Info/QGIS headless)
css/style.css           stili; temi chiaro/scuro tramite CSS custom properties
js/
  app.js                bootstrap e orchestrazione di zone, pannelli, legenda, tema
  config.js             URL di stili e dati
  map.js                MapModule: sorgenti, layer, 2D/3D, tema, satellite, evidenziazione edifici
  probe.js              area circolare trascinabile e ridimensionabile (zone A/B)
  polygon.js            disegno ed editing del poligono
  geometry.js           haversine, punto-in-poligono, area, selezione sezioni
  topics.js             definizione degli argomenti e aggregazione
  charts.js             grafici Chart.js (barre, ciambella, piramide)
  punto.js              pannello DTM e classifiche territoriali
  griglia.js            lettura delle tile della griglia DTM e punto più vicino
  export.js             generazione dei CSV
  palette.js            palette e rampe di colore (contrasto WCAG)
  sheet.js              pannello a tre livelli su mobile
  a11y.js               supporto tastiera e ARIA
data/                   file serviti al browser
  sezioni_indicatori.json         indicatori delle 3.600 sezioni
  geo_sezioni_2021.pmtiles        geometrie delle sezioni
  confini_amministrativi.pmtiles  circoscrizioni, quartieri, UPL (linee di confine sulla mappa)
  confini_zone.json               gli stessi confini come poligoni WGS84 (zona di analisi da menu)
  edificato.pmtiles               edifici con altezza, densità, copertura, residenti stimati
  punti_pop_10.pmtiles            dot density 1:10 (zoom 10–13), italiani/stranieri
  punti_pop_1.pmtiles             dot density 1:1 (zoom 14+), italiani/stranieri
  griglia_pbf/                    griglia DTM 50 m (MVT)
  elevazione/                     raster di elevazione (TMS)
  terrain/                        rilievo in codifica Terrarium
dati/                   sorgenti (GeoPackage, GeoJSON, CSV/XLSX indicatori e dizionario)
scripts/                script di preparazione dati (dasimetria, confini_zone.json)
img/                    favicon, social card, schermate della guida
tests/                  test Node (*.test.mjs)
docs/                   specifiche e piani di sviluppo
```

---

## Avvio in locale

Serve un web server statico con supporto alle richieste `Range` (i moduli ES e i PMTiles non funzionano da `file://`):

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Se edifici o confini non compaiono, il server probabilmente ignora le richieste `Range`:
in quel caso usare un server che le supporta, ad esempio `npx http-server` o `npx serve`.

---

## Test

```bash
node --test tests/*.test.mjs
```

Coprono geometria (haversine, selezione per cerchio e poligono, aree), aggregazione degli argomenti,
configurazione dei grafici ed esportazione CSV.

---

## Licenza e crediti

- Contenuti e dati derivati: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.it).
  I dati di origine restano soggetti alle licenze indicate nella tabella delle fonti.
- Progetto di [PalermoHub](https://palermohub.opendatasicilia.it/) / [OpenDataSicilia.it](https://opendatasicilia.it/).
- Progettazione e sviluppo: [@gbvitrano](https://www.linkedin.com/in/gbvitrano/), con il supporto di
  [Claude AI (Anthropic)](https://www.anthropic.com/claude).
- Ispirazione: i lavori di WebGIS per la pianificazione urbana di
  [Mohammad VahidiBorji](https://www.linkedin.com/in/mohammadvh/).

**Riferimento DTM**
> Panza et al. (2026). *5m Resolution Digital Terrain Model for Italy HR-DTM-5m.* Zenodo. https://doi.org/10.5281/zenodo.18872933

**Disclaimer** — Materiale informativo e divulgativo, senza valore ufficiale né legale. Non contiene dati personali.
Mappa e schede possono presentare errori, imprecisioni o campi mancanti.
