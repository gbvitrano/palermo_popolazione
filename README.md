# Palermo — Esplorazione demografica a raggio mobile

> ⚠️ README provvisorio: il progetto è in sviluppo.

Mappa web interattiva per esplorare la struttura demografica di Palermo a scala di quartiere e di isolato.
Si sceglie un punto sulla mappa (o si disegna un'area) e si ottiene il profilo della popolazione residente,
calcolato sulle sezioni censuarie ISTAT 2021 (3.079 sezioni).

## Funzionalità principali

- **Analisi a raggio mobile**: cerchio trascinabile (spot) con aggregazione degli indicatori delle sezioni incluse
- **Poligono libero**: analisi su un'area disegnata a mano
- **Confronto A/B**: due zone affiancate con grafici dedicati
- **Grafici**: piramide delle età, cittadinanza (italiani/stranieri), classifiche per circoscrizione, quartiere e UPL
- **Livelli**: densità di popolazione (griglia), elevazione DTM 5 m, edificato 3D, confini amministrativi
- **Mappa**: vista 2D/3D con terreno, base satellitare, tema chiaro/scuro, schermo intero
- **Esportazione CSV**: totali dell'area e dettaglio per sezione ISTAT

## Stack

- [MapLibre GL JS](https://maplibre.org/) + [PMTiles](https://protomaps.com/docs/pmtiles)
- Basemap [OpenFreeMap](https://openfreemap.org/)
- JavaScript ES modules, nessun build step

## Struttura

```
index.html        pagina principale
css/style.css     stili (temi chiaro/scuro tramite CSS variables)
js/               moduli applicativi (map, probe, polygon, charts, export, ...)
data/             tile PMTiles/PBF/raster e indicatori JSON serviti dal browser
dati/             dati sorgente (GeoPackage, GeoJSON, CSV indicatori + dizionario)
tests/            test Node (*.test.mjs)
```

## Avvio in locale

Serve un web server statico (i moduli ES e i PMTiles non funzionano da `file://`):

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Test:

```bash
node --test tests/*.test.mjs
```

## Fonti dati

- ISTAT — Censimento permanente della popolazione 2021, basi territoriali e indicatori per sezione di censimento
- DTM 5 m (elevazione)
- Confini amministrativi del Comune di Palermo (circoscrizioni, quartieri, UPL)

## Licenza

Da definire (dati derivati distribuiti con licenza CC BY-SA 4.0).

## Crediti

Realizzato per [OpenDataSicilia.it](https://opendatasicilia.it/).
