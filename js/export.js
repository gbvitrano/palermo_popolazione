import { TOPICS, aggregateTopic } from './topics.js';
import { zoneCenter, ringAreaSqMeters } from './geometry.js';

// Separatore ';' e virgola decimale: formato letto correttamente da Excel/LibreOffice in locale italiano.
const SEP = ';';

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function decimal(value, digits) {
  return value.toFixed(digits).replace('.', ',');
}

function zoneDescription(zone) {
  if (zone.type === 'circle') return `Area circolare, raggio ${Math.round(zone.radiusMeters)} m`;
  return `Poligono, ${zone.ring.length} vertici`;
}

function zoneAreaKmq(zone) {
  const sqm = zone.type === 'circle'
    ? Math.PI * zone.radiusMeters ** 2
    : ringAreaSqMeters(zone.ring);
  return sqm / 1e6;
}

// Righe [argomento, voce, valore] di una zona: metadati + tutti i topic aggregati (senza filtro stranieri).
function zoneRows(records, zone, sectionIds) {
  const [lon, lat] = zoneCenter(zone);
  const base = aggregateTopic(records, sectionIds, 'popolazione_sesso');
  const rows = [
    ['Zona', 'Tipo', zoneDescription(zone)],
    ['Zona', 'Centro latitudine', decimal(lat, 6)],
    ['Zona', 'Centro longitudine', decimal(lon, 6)],
    ['Zona', 'Superficie (km²)', decimal(zoneAreaKmq(zone), 3)],
    ['Zona', 'Sezioni censuarie', sectionIds.length],
    ['Zona', 'Sezioni senza dati', base.missingCount],
    ['Zona', 'Popolazione totale', base.totalPopulation]
  ];
  for (const key of Object.keys(TOPICS)) {
    const topic = TOPICS[key];
    const agg = aggregateTopic(records, sectionIds, key);
    if (topic.chartType === 'pyramid') {
      for (const ds of agg.datasets) {
        agg.labels.forEach((label, i) => rows.push([topic.label, `${ds.label} ${label}`, ds.data[i]]));
      }
    } else {
      agg.labels.forEach((label, i) => rows.push([topic.label, label, agg.datasets[0].data[i]]));
    }
  }
  return rows;
}

// zones: [{ name, zone, sectionIds }] — una colonna di valori per zona (A, ed eventualmente B).
export function buildZonesCsv(records, zones) {
  const perZone = zones.map(z => zoneRows(records, z.zone, z.sectionIds));
  const header = ['Argomento', 'Voce', ...zones.map(z => z.name)];
  const lines = [header, ...perZone[0].map((row, i) => [row[0], row[1], ...perZone.map(r => r[i][2])])];
  return lines.map(line => line.map(csvCell).join(SEP)).join('\r\n');
}

// Una riga per sezione censuaria con tutti i campi ISTAT grezzi; colonna "Zona" per distinguere A/B.
export function buildSectionsCsv(records, zones) {
  const byId = new Map(records.map(r => [r.SEZ21_ID, r]));
  const fields = records.length ? Object.keys(records[0]) : [];
  const lines = [['Zona', ...fields]];
  for (const { name, sectionIds } of zones) {
    for (const id of sectionIds) {
      const record = byId.get(id);
      if (!record) continue;
      lines.push([name, ...fields.map(f => {
        const v = record[f];
        return typeof v === 'number' && !Number.isInteger(v) ? String(v).replace('.', ',') : v;
      })]);
    }
  }
  return lines.map(line => line.map(csvCell).join(SEP)).join('\r\n');
}

export function downloadCsv(filename, csv) {
  // BOM UTF-8: senza, Excel apre il file come ANSI e rompe gli accenti.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
