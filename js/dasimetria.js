import { zoneBBox, zoneContains } from './geometry.js';

// Totali delle zone per edifici (interpolazione dasimetrica).
// L'indice (data/edifici_zona.json, da scripts/dasimetrica.py) ha colonne parallele:
// x, y = punto interno dell'edificio; s = posizione della sezione in `ids`; p = residenti
// stimati. Il peso di una sezione è la quota dei suoi residenti che abita negli edifici
// dentro la zona: ogni campo ISTAT della sezione viene scalato per quel peso
// (composizione uniforme dentro la sezione). Il denominatore è il totale della sezione
// nell'indice, non P1: le stime arrotondate a 0,1 non sommano esattamente a P1, e così
// una zona che copre tutta la sezione vale sempre 1.

export async function loadEdificiIndex(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function sectionTotals(index) {
  if (!index.totals) {
    index.totals = new Float64Array(index.ids.length);
    for (let i = 0; i < index.s.length; i++) index.totals[index.s[i]] += index.p[i];
  }
  return index.totals;
}

// p1ById: Map SEZ21_ID -> P1 (null per le sezioni senza dati).
// centroidIds: sezioni incluse per centroide; servono solo per quelle senza dati,
// che non hanno residenti negli edifici ma vanno contate come "sezioni senza dati".
export function zoneWeights(index, zone, p1ById, centroidIds) {
  const [minLon, minLat, maxLon, maxLat] = zoneBBox(zone);
  const { ids, x, y, s, p } = index;
  const totals = sectionTotals(index);
  const inside = new Map();
  for (let i = 0; i < x.length; i++) {
    if (x[i] < minLon || x[i] > maxLon || y[i] < minLat || y[i] > maxLat) continue;
    if (!zoneContains(zone, [x[i], y[i]])) continue;
    inside.set(s[i], (inside.get(s[i]) || 0) + p[i]);
  }

  const weights = new Map();
  for (const [k, pop] of inside) {
    if (p1ById.get(ids[k]) > 0 && totals[k] > 0) weights.set(ids[k], pop / totals[k]);
  }
  for (const id of centroidIds) {
    if (p1ById.get(id) == null && p1ById.has(id)) weights.set(id, 1);
  }
  return weights;
}
