// Palette unica dell'app: ogni colore di mappa, legenda e grafici passa da qui.
// I colori dell'interfaccia (superfici, testi, brand) stanno invece nei token di
// css/style.css. Dove serve, le palette hanno una variante per tema: una rampa
// leggibile sulla basemap chiara (positron) sparisce su quella scura e viceversa.

// ── Dati demografici (grafici, classifiche) ──
export const DATA_COLORS = {
  male: '#3f7fd0',
  female: '#c9507f',
  other: '#f5c26b',
  reference: '#8a94ab'
};

// ── Zone di analisi (cerchio/poligono A e B) ──
// A = ciano, B = arancio brand: stesso colore per riempimento sulla mappa,
// maniglia etichettata e intestazione nel pannello (css: --zone-a / --zone-b).
export const ZONE_COLORS = {
  halo: '#0a1020',
  border: '#ffffff',
  vertex: '#e08a2b',
  A: { fill: '#00e5ff' },
  B: { fill: '#ff9f1c' }
};

export function zoneFill(label) {
  return (ZONE_COLORS[label] || ZONE_COLORS.A).fill;
}

// ── Ombreggiatura rilievo (vista 3D) ──
export const HILLSHADE_COLORS = {
  shadow: '#283046',
  highlight: '#f5f0e8',
  accent: '#202040'
};

// ── Densità (colore degli edifici estrusi) ──
// Chiaro: dal blu tenue al cremisi scuro (più denso = più scuro).
// Scuro: dal blu ardesia al corallo acceso (più denso = più luminoso).
const DENSITY_RAMPS = {
  light: {
    popolazione: [[0, '#8fa3c9'], [50, '#e0a93b'], [150, '#d9602b'], [400, '#a4243b']],
    edifici: [[0, '#8fa3c9'], [25, '#e0a93b'], [50, '#d9602b'], [75, '#a4243b'], [100, '#6e1530']],
    dasimetrica: [[0, '#8fa3c9'], [100, '#e0a93b'], [250, '#d9602b'], [500, '#a4243b'], [1000, '#6e1530']]
  },
  dark: {
    popolazione: [[0, '#5a6f9e'], [50, '#e9c46a'], [150, '#f08a3e'], [400, '#ef4f5a']],
    edifici: [[0, '#5a6f9e'], [25, '#e9c46a'], [50, '#f08a3e'], [75, '#ef4f5a'], [100, '#d62f5b']],
    dasimetrica: [[0, '#5a6f9e'], [100, '#e9c46a'], [250, '#f08a3e'], [500, '#ef4f5a'], [1000, '#d62f5b']]
  }
};

export const EDIFICATO_NEUTRAL = '#8a94a8';

// Etichette di legenda per gli stop delle rampe (stesso ordine degli stop).
const DENSITY_LABELS = {
  popolazione: ['0', '50', '150', '400+'],
  edifici: ['0%', '25%', '50%', '75%', '100%'],
  dasimetrica: ['0', '100', '250', '500', '1000+']
};

export function densityStops(mode, isDark) {
  return DENSITY_RAMPS[isDark ? 'dark' : 'light'][mode];
}

export function densityLegendStops(mode, isDark) {
  return densityStops(mode, isDark).map(([, color], i) => ({ value: DENSITY_LABELS[mode][i], color }));
}

// ── Dot density (scripts/dasimetrica.py) ──
// Blu/arancio: coppia distinguibile anche con deficit rosso-verde. Gli italiani
// sono il 96%: tinta fredda e discreta; gli stranieri, rari, la tinta calda che emerge.
export function puntiColors(isDark) {
  return isDark
    ? { italiani: '#9fb3e0', stranieri: '#ffb000' }
    : { italiani: '#2f4278', stranieri: '#e07a00' };
}

// ── Sezioni censuarie ──
export function sezioniColors(isDark) {
  return isDark
    ? { fill: '#5a6f9e', border: '#7d8fc4' }
    : { fill: '#2f4278', border: '#4a5b8f' };
}

// ── Confini amministrativi ──
// Oltre al colore, il tratto (continuo/tratteggiato/punteggiato) distingue i
// livelli anche per chi non discrimina le tinte. L'arancio resta al brand.
// L'ordine delle chiavi è l'ordine dei layer (l'ultimo è disegnato sopra).
const CONFINI_LEVELS = {
  quartieri: { light: '#0f7f86', dark: '#4fd1c5', width: 1.5, dash: [3, 2], css: 'dashed' },
  circoscrizioni: { light: '#2b3350', dark: '#e8ebf6', width: 2.5, dash: null, css: 'solid' },
  upl: { light: '#7b4fc9', dark: '#b980f0', width: 1.2, dash: [1, 1.5], css: 'dotted' }
};

export const CONFINI_LEVEL_KEYS = Object.keys(CONFINI_LEVELS);

// Etichetta al singolare di un livello (per "Circoscrizione · I", non "Circoscrizioni · I"):
// usata da app.js (picker/KPI "Seleziona territorio") ed export.js (colonna Tipo del CSV).
export const CONFINI_LABEL_SINGULAR = { circoscrizioni: 'Circoscrizione', quartieri: 'Quartiere', upl: 'UPL' };

export function confiniStyle(level, isDark) {
  const s = CONFINI_LEVELS[level];
  return { color: isDark ? s.dark : s.light, width: s.width, dash: s.dash, css: s.css };
}

// ── Elevazione ──
// Le tile in data/elevazione/ sono raster PNG già colorati: questi stop
// descrivono quei colori per la legenda e non vanno cambiati senza rigenerare le tile.
// Rampa ipsometrica (salvia → ocra → terra d'ombra → grigio); la classe > 800 m
// non compare nelle tile attuali ma resta in legenda per completezza.
export const ELEVATION_STOPS = [
  { value: '≤ 0 m', color: '#cfe0e3' },
  { value: '0 – 50 m', color: '#d7e6c4' },
  { value: '50 – 100 m', color: '#b7cf94' },
  { value: '100 – 200 m', color: '#e3d49a' },
  { value: '200 – 300 m', color: '#d4ad6a' },
  { value: '300 – 400 m', color: '#b98a52' },
  { value: '400 – 500 m', color: '#9c6b3f' },
  { value: '500 – 600 m', color: '#7f5a45' },
  { value: '600 – 800 m', color: '#8f8680' },
  { value: '> 800 m', color: '#d9d4cf' }
];
