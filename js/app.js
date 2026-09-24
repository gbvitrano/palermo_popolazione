import { INDICATORI_JSON_URL } from './config.js';
import { MapModule } from './map.js';
import { ProbeController } from './probe.js';
import { PolygonController } from './polygon.js';
import { buildCentroidIndex, filterWithinZone, zoneBBox, zoneCenter } from './geometry.js';
import { TOPICS, aggregateTopic } from './topics.js';
import { ChartController } from './charts.js';
import { renderPuntoPanel, aggregateAllLevels, renderCircRanking } from './punto.js';
import { findNearestGrigliaPoint } from './griglia.js';
import { buildZonesCsv, buildSectionsCsv, downloadCsv } from './export.js';

const mapErrorEl = document.getElementById('map-error');
const probeHintEl = document.getElementById('probe-hint');
const chartPanelEl = document.getElementById('chart-panel');
const chartPanelTabEl = document.getElementById('chart-panel-tab');
const chartPanelResizerEl = chartPanelEl.querySelector('.panel-resizer');
const chartTitleEl = document.getElementById('chart-title');
const chartListEl = document.getElementById('chart-list');
const kpiEl = document.getElementById('kpi-population');
const missingBadgeEl = document.getElementById('missing-badge');
const topicButtonsEl = document.getElementById('topic-buttons');
const confiniButtonsEl = document.getElementById('confini-buttons');
const legendPanelEl = document.getElementById('legend-panel');
const legendContentEl = document.getElementById('legend-content');
const puntoPanelEl = document.getElementById('punto-panel');
const puntoPanelTabEl = document.getElementById('punto-panel-tab');
const puntoHeaderEl = document.getElementById('punto-header');
const puntoCoordsEl = document.getElementById('punto-coords');
const puntoLuogoEl = document.getElementById('punto-luogo');
const puntoBodyEl = document.getElementById('punto-body');
const puntoQuotaBoxEl = document.getElementById('punto-quota-box');
const puntoQuotaValEl = document.getElementById('punto-quota-val');
const odsLogoEl = document.getElementById('ods-logo');
const mapToolbarEl = document.getElementById('map-toolbar');
const btnCompareEl = document.getElementById('btn-compare');
const btnPolygonEl = document.getElementById('btn-draw-polygon');
const btnExportCsvEl = document.getElementById('btn-export-csv');
const btnExportSezioniCsvEl = document.getElementById('btn-export-sezioni-csv');
const compareHeaderEl = document.getElementById('compare-header');
const compareBodyEl = document.getElementById('compare-body');
const compareCoordsEl = document.getElementById('compare-coords');
const chartListBEl = document.getElementById('chart-list-b');
const kpiBEl = document.getElementById('kpi-population-b');
const missingBadgeBEl = document.getElementById('missing-badge-b');

const CONFINI_LABELS = { quartieri: 'Quartieri', circoscrizioni: 'Circoscrizioni', upl: 'UPL' };
const DENSITY_STOPS_POPOLAZIONE = [
  { value: '0', color: '#101a33' },
  { value: '50', color: '#3a4d8f' },
  { value: '150', color: '#f5c26b' },
  { value: '400+', color: '#d9534f' }
];
const DENSITY_STOPS_EDIFICI = [
  { value: '0%', color: '#101a33' },
  { value: '25%', color: '#3a4d8f' },
  { value: '50%', color: '#f5c26b' },
  { value: '75%', color: '#d9534f' },
  { value: '100%', color: '#7a1f1f' }
];
const ELEVATION_STOPS = [
  { value: '≤ 0 m', color: '#00bfbf' },
  { value: '0 – 50 m', color: '#00cb9b' },
  { value: '50 – 100 m', color: '#00d777' },
  { value: '100 – 200 m', color: '#00ef2f' },
  { value: '200 – 300 m', color: '#22ff00' },
  { value: '300 – 400 m', color: '#82ff00' },
  { value: '400 – 500 m', color: '#e2ff00' },
  { value: '500 – 600 m', color: '#ffdd00' },
  { value: '600 – 800 m', color: '#fe7f01' },
  { value: '> 800 m', color: '#141414' }
];

let activeTopics = new Set(['popolazione_sesso']);
let lastSectionIds = [];
let lastSectionIdsB = [];
let centroidIndex = [];
let sectionsRecords = [];
let densityMode = 'none';
let confiniActiveLevels = new Set();
let activeMapModule = null;
let scaleMode = false;
let spotActive = false;
let elevazioneVisible = false;
let compareActive = false;
let probeA = null;
let probeB = null;
let polygonA = null;
let polygonB = null;
let zoneB = null;
let zoneA = null; // zona di analisi corrente: { type: 'circle', ... } | { type: 'polygon', ... } | null
let polygonMode = false; // true: la zona A è un poligono disegnato, il click sulla mappa non crea cerchi

const HINT_CIRCLE = 'Clicca sulla mappa per creare un cerchio di analisi';
const HINT_POLYGON = 'Clicca per aggiungere i vertici · doppio click o click sul primo vertice per chiudere · Esc per annullare';

const circleZone = (center, radiusMeters) => (center ? { type: 'circle', center, radiusMeters } : null);
const polygonZone = ring => (ring ? { type: 'polygon', ring } : null);

// Fabbrica per un pannello di grafici (usata sia per il cerchio A che per il cerchio B):
// isola gli elementi DOM e lo stato dei controller Chart.js, senza duplicare la logica di rendering.
function createTopicChartPanel({ chartListEl, chartTitleEl, kpiEl, missingBadgeEl, kpiLabel }) {
  const controllers = new Map(); // topicKey -> { controller, wrapperEl }

  function ensureSlots() {
    const hintEl = chartListEl.querySelector('.chart-empty-hint');
    if (hintEl) hintEl.remove();

    for (const [key, entry] of controllers) {
      if (!activeTopics.has(key)) {
        entry.wrapperEl.remove();
        controllers.delete(key);
      }
    }
    for (const key of Object.keys(TOPICS)) {
      if (!activeTopics.has(key) || controllers.has(key)) continue;
      const itemEl = document.createElement('div');
      itemEl.className = `chart-item ${TOPICS[key].chartType}`.trim();
      itemEl.innerHTML = `
        <div class="chart-item-title">${TOPICS[key].label}</div>
        <div class="chart-item-card">
          ${TOPICS[key].chartType === 'bar'
            ? '<div class="ranking-list"></div>'
            : `<div class="chart-wrapper"><canvas></canvas></div>${TOPICS[key].chartType === 'doughnut' ? '<div class="doughnut-legend"></div>' : ''}`}
        </div>
      `;
      chartListEl.appendChild(itemEl);
      controllers.set(key, { controller: new ChartController(itemEl), wrapperEl: itemEl });
    }
  }

  function render(sectionIds) {
    if (sectionIds.length === 0) {
      ensureSlots();
      if (chartTitleEl) {
        chartTitleEl.textContent = activeTopics.size === 1
          ? TOPICS[[...activeTopics][0]].label
          : 'Analisi demografica';
      }
      kpiEl.textContent = `${kpiLabel}: 0`;
      missingBadgeEl.textContent = '0 sezioni nella zona';
      missingBadgeEl.classList.remove('hidden');
      const empty = { labels: [], datasets: [{ label: '', data: [] }], missingCount: 0, totalPopulation: 0 };
      for (const [key, entry] of controllers) {
        entry.controller.render(key, empty, TOPICS);
      }
      return;
    }

    ensureSlots();

    if (activeTopics.size === 0) {
      if (chartTitleEl) chartTitleEl.textContent = 'Analisi demografica';
      kpiEl.textContent = '';
      missingBadgeEl.classList.add('hidden');
      chartListEl.innerHTML = '<div class="chart-empty-hint">Seleziona almeno un topic</div>';
      return;
    }

    const filterStranieri = activeTopics.has('stranieri') && activeTopics.size > 1;

    let totalPopulation = 0;
    let missingCount = 0;
    let first = true;
    const aggregations = new Map();
    for (const key of activeTopics) {
      const aggregation = aggregateTopic(sectionsRecords, sectionIds, key, 'SEZ21_ID', filterStranieri);
      if (first) {
        totalPopulation = aggregation.totalPopulation;
        missingCount = aggregation.missingCount;
        first = false;
      }
      aggregations.set(key, aggregation);
    }

    // sotto filtro stranieri, il confronto sensato è col totale stranieri (ST1), non con la popolazione intera
    const stranieriTotal = filterStranieri ? aggregations.get('stranieri').datasets[0].data[0] : undefined;

    let sharedMax;
    let referenceTotal;
    if (scaleMode && activeTopics.size > 1) {
      referenceTotal = filterStranieri ? stranieriTotal : totalPopulation;
      sharedMax = Math.max(
        1,
        referenceTotal,
        ...[...aggregations.values()].flatMap(agg => agg.datasets.flatMap(ds => ds.data.map(Math.abs)))
      );
    }

    const referenceLabel = filterStranieri ? 'Stranieri totale' : 'Popolazione totale';
    for (const key of activeTopics) {
      const showReference = referenceTotal != null && TOPICS[key].chartType === 'bar' && !(filterStranieri && key === 'stranieri');
      controllers.get(key).controller.render(key, aggregations.get(key), TOPICS, sharedMax, showReference ? referenceTotal : undefined, referenceLabel);
      const entry = controllers.get(key);
      const titleEl = entry.wrapperEl.querySelector('.chart-item-title');
      titleEl.textContent = aggregations.get(key).filtered
        ? `${TOPICS[key].label} (solo stranieri)`
        : TOPICS[key].label;
    }

    if (chartTitleEl) {
      chartTitleEl.textContent = activeTopics.size === 1
        ? TOPICS[[...activeTopics][0]].label
        : 'Analisi demografica';
    }
    kpiEl.textContent = `${kpiLabel}: ${totalPopulation}`;

    if (missingCount > 0) {
      missingBadgeEl.textContent = `${missingCount} sezioni senza dati`;
      missingBadgeEl.classList.remove('hidden');
    } else {
      missingBadgeEl.classList.add('hidden');
    }
  }

  return { render };
}

let chartPanelA;
let chartPanelB;

function offsetEastMeters(center, meters) {
  const [lon, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const dLon = (meters / (6371000 * Math.cos(latRad))) * (180 / Math.PI);
  return [lon + dLon, lat];
}

function renderLegend() {
  legendContentEl.innerHTML = '';

  if (densityMode !== 'none') {
    const isEdifici = densityMode === 'edifici';
    const stops = isEdifici ? DENSITY_STOPS_EDIFICI : DENSITY_STOPS_POPOLAZIONE;
    const title = document.createElement('div');
    title.className = 'panel-subheader';
    title.style.marginTop = '0';
    title.textContent = isEdifici ? 'Copertura edifici (per sezione)' : 'Densità popolazione (per sezione)';
    legendContentEl.appendChild(title);
    for (const stop of stops) {
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = `<span class="legend-swatch" style="background:${stop.color}"></span><span>${stop.value}</span>`;
      legendContentEl.appendChild(row);
    }
  } else if (spotActive) {
    const title = document.createElement('div');
    title.className = 'panel-subheader';
    title.style.marginTop = '0';
    title.textContent = 'Densità popolazione (spot)';
    legendContentEl.appendChild(title);
    for (const stop of DENSITY_STOPS_POPOLAZIONE) {
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = `<span class="legend-swatch" style="background:${stop.color}"></span><span>${stop.value}</span>`;
      legendContentEl.appendChild(row);
    }
  }

  if (confiniActiveLevels.size > 0) {
    const title = document.createElement('div');
    title.className = 'panel-subheader';
    title.textContent = 'Confini';
    legendContentEl.appendChild(title);
    for (const level of confiniActiveLevels) {
      const style = MapModule.confiniLevels[level];
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = `<span class="legend-line" style="border-top-color:${style.color}"></span><span>${CONFINI_LABELS[level]}</span>`;
      legendContentEl.appendChild(row);
    }
  }

  if (elevazioneVisible) {
    const title = document.createElement('div');
    title.className = 'panel-subheader';
    title.textContent = 'Elevazione';
    legendContentEl.appendChild(title);
    for (const stop of ELEVATION_STOPS) {
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = `<span class="legend-swatch" style="background:${stop.color}"></span><span>${stop.value}</span>`;
      legendContentEl.appendChild(row);
    }
  }

  legendPanelEl.classList.toggle('hidden', densityMode === 'none' && confiniActiveLevels.size === 0 && !spotActive && !elevazioneVisible);
}

function renderConfiniButtons(mapModule) {
  confiniButtonsEl.innerHTML = '';
  for (const level of Object.keys(CONFINI_LABELS)) {
    const style = MapModule.confiniLevels[level];
    const isActive = confiniActiveLevels.has(level);
    const btn = document.createElement('button');
    btn.className = 'confini-btn';
    const dot = document.createElement('span');
    dot.className = 'confini-dot';
    dot.style.borderColor = style.color;
    dot.style.background = isActive ? style.color : 'transparent';
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(CONFINI_LABELS[level]));
    btn.title = `Confini: ${CONFINI_LABELS[level]}`;
    if (isActive) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const nowActive = !confiniActiveLevels.has(level);
      if (nowActive) confiniActiveLevels.add(level);
      else confiniActiveLevels.delete(level);
      mapModule.setConfiniLevelVisible(level, nowActive);
      btn.classList.toggle('active', nowActive);
      dot.style.background = nowActive ? style.color : 'transparent';
      renderLegend();
    });
    confiniButtonsEl.appendChild(btn);
  }
}

function renderTopicButtons() {
  topicButtonsEl.innerHTML = '';
  for (const [key, topic] of Object.entries(TOPICS)) {
    const btn = document.createElement('button');
    btn.textContent = topic.label;
    btn.title = topic.label;
    btn.dataset.topicKey = key;
    if (activeTopics.has(key)) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (activeTopics.has(key)) {
        activeTopics.delete(key);
      } else {
        activeTopics.add(key);
      }
      btn.classList.toggle('active');
      renderChart();
    });
    topicButtonsEl.appendChild(btn);
  }
}

// Rirenderizza il pannello A (sempre) e, se attivo, il pannello B — usati dai
// controlli condivisi tra le due zone (selezione topic, toggle scala assi).
function renderChart() {
  if (lastSectionIds.length > 0) chartPanelA.render(lastSectionIds);
  if (compareActive) chartPanelB.render(lastSectionIdsB);
}

function updateLegendPosition(panelWidth) {
  legendPanelEl.style.left = `${16 + panelWidth}px`;
  mapToolbarEl.style.left = `${16 + panelWidth}px`;
}

function updateLogoPosition(panelWidth) {
  odsLogoEl.style.right = `${16 + panelWidth}px`;
}

let puntoRequestId = 0;
let rankStats = null; // popolazione per circoscrizione/quartiere/UPL, calcolata una volta in bootstrap()

function updatePuntoPanel(center) {
  if (!activeMapModule) return;
  if (!center) {
    puntoRequestId++;
    puntoPanelEl.classList.add('collapsed');
    activeMapModule.setRightPadding(0);
    updateLogoPosition(0);
    puntoCoordsEl.textContent = '';
    puntoLuogoEl.textContent = '';
    puntoBodyEl.innerHTML = '';
    puntoQuotaBoxEl.classList.add('hidden');
    return;
  }
  puntoPanelEl.classList.remove('collapsed');
  activeMapModule.setRightPadding(puntoPanelEl.getBoundingClientRect().width);
  updateLogoPosition(puntoPanelEl.getBoundingClientRect().width);
  puntoCoordsEl.textContent = `${center[1].toFixed(4)}° N  ${center[0].toFixed(4)}° E`;

  const luogo = activeMapModule.getLuogoAt(center);
  puntoLuogoEl.textContent = luogo
    ? `${luogo.UPL} · ${luogo.Quartiere} · Circ. ${luogo.Circoscrizione}`
    : '';

  const requestId = ++puntoRequestId;
  findNearestGrigliaPoint(center).then(props => {
    if (requestId !== puntoRequestId) return; // spot spostato/eliminato nel frattempo
    renderPuntoPanel(puntoBodyEl, props, puntoQuotaBoxEl, puntoQuotaValEl);
    renderCircRanking(puntoBodyEl, rankStats, luogo);
  });
}

function onZoneAChange(zone) {
  zoneA = zone;
  const center = zone ? zoneCenter(zone) : null;
  if (activeMapModule) activeMapModule.updateEdificatoSpot('A', zone);
  spotActive = !!zone;
  renderLegend();
  btnCompareEl.disabled = !zone;
  btnExportCsvEl.disabled = !zone;
  btnExportSezioniCsvEl.disabled = !zone;
  if (!zone && compareActive) setCompareActive(false);
  if (!compareActive) updatePuntoPanel(center);
  if (!zone) {
    lastSectionIds = [];
    chartPanelEl.classList.add('collapsed');
    if (activeMapModule) activeMapModule.setLeftPadding(0);
    updateLegendPosition(0);
    if (!polygonA?.isDrawing) probeHintEl.classList.remove('hidden');
    return;
  }
  probeHintEl.classList.add('hidden');
  chartPanelEl.classList.remove('collapsed');
  if (activeMapModule) activeMapModule.setLeftPadding(chartPanelEl.getBoundingClientRect().width);
  updateLegendPosition(chartPanelEl.getBoundingClientRect().width);
  lastSectionIds = filterWithinZone(centroidIndex, zone);
  chartPanelA.render(lastSectionIds);
}

function onZoneBChange(zone) {
  zoneB = zone;
  if (activeMapModule) activeMapModule.updateEdificatoSpot('B', zone);
  if (!zone) {
    lastSectionIdsB = [];
    compareCoordsEl.textContent = '';
    chartPanelB.render([]);
    return;
  }
  const center = zoneCenter(zone);
  compareCoordsEl.textContent = `${center[1].toFixed(4)}° N  ${center[0].toFixed(4)}° E`;
  lastSectionIdsB = filterWithinZone(centroidIndex, zone);
  chartPanelB.render(lastSectionIdsB);
}

// Passa dalla modalità cerchio a quella poligono (e viceversa). Le due zone A sono
// mutuamente esclusive: entrando in modalità poligono il cerchio viene rimosso.
function setPolygonMode(active) {
  polygonMode = active;
  btnPolygonEl.classList.toggle('active', active);
  probeA.clickToCreate = !active;
  if (compareActive) setCompareActive(false);
  probeA.clear();
  polygonA.clear();
  onZoneAChange(null);
  probeHintEl.textContent = active ? HINT_POLYGON : HINT_CIRCLE;
  probeHintEl.classList.remove('hidden');
  if (active) polygonA.startDrawing();
}

// Attiva/disattiva la modalità confronto: crea (una sola volta) il cerchio B affiancato
// ad A e sostituisce il contenuto del pannello destro (info-punto <-> grafici zona B).
function setCompareActive(active) {
  compareActive = active;
  btnCompareEl.classList.toggle('active', active);

  if (active) {
    puntoHeaderEl.classList.add('hidden');
    puntoBodyEl.classList.add('hidden');
    compareHeaderEl.classList.remove('hidden');
    compareBodyEl.classList.remove('hidden');
    puntoPanelEl.classList.remove('collapsed');

    if (zoneA.type === 'polygon') {
      if (!polygonB) {
        polygonB = new PolygonController(activeMapModule.getMap(), ring => onZoneBChange(polygonZone(ring)), { label: 'B' });
      }
      if (!polygonB.ring) {
        // copia del poligono A traslata verso est di 1.5 volte la sua larghezza
        const [minLon, , maxLon] = zoneBBox(zoneA);
        const dLon = (maxLon - minLon) * 1.5;
        polygonB.place(zoneA.ring.map(([lon, lat]) => [lon + dLon, lat]));
      } else {
        onZoneBChange(polygonZone(polygonB.ring));
      }
    } else {
      if (!probeB) {
        probeB = new ProbeController(activeMapModule.getMap(), (c, r) => onZoneBChange(circleZone(c, r)), { label: 'B', clickToCreate: false });
      }
      if (!probeB.center) {
        const offsetCenter = offsetEastMeters(probeA.center, probeA.radiusMeters * 2.5);
        probeB.place(offsetCenter, probeA.radiusMeters);
      } else {
        onZoneBChange(circleZone(probeB.center, probeB.radiusMeters));
      }
    }

    const width = puntoPanelEl.getBoundingClientRect().width;
    activeMapModule.setRightPadding(width);
    updateLogoPosition(width);
  } else {
    puntoHeaderEl.classList.remove('hidden');
    puntoBodyEl.classList.remove('hidden');
    compareHeaderEl.classList.add('hidden');
    compareBodyEl.classList.add('hidden');
    if (probeB) probeB.clear();
    if (polygonB) polygonB.clear();
    onZoneBChange(null); // clear() non emette: rimuove esplicitamente l'evidenziazione edifici di B
    updatePuntoPanel(zoneA ? zoneCenter(zoneA) : null);
  }
}

// Esporta in CSV la zona A (e B se il confronto è attivo): 'totali' = aggregati per argomento,
// 'sezioni' = una riga per sezione censuaria.
function exportCsv(kind, buildCsv) {
  if (!zoneA) return;
  const zones = [{ name: 'Zona A', zone: zoneA, sectionIds: lastSectionIds }];
  if (compareActive && zoneB) zones.push({ name: 'Zona B', zone: zoneB, sectionIds: lastSectionIdsB });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(`palermo_${kind}_zona_${zones.length > 1 ? 'A-B' : 'A'}_${stamp}.csv`, buildCsv(sectionsRecords, zones));
}

async function bootstrap() {
  renderTopicButtons();
  chartPanelA = createTopicChartPanel({
    chartListEl, chartTitleEl, kpiEl, missingBadgeEl, kpiLabel: 'Popolazione nella zona'
  });
  chartPanelB = createTopicChartPanel({
    chartListEl: chartListBEl, chartTitleEl: null, kpiEl: kpiBEl, missingBadgeEl: missingBadgeBEl, kpiLabel: 'Popolazione nella zona'
  });

  const response = await fetch(INDICATORI_JSON_URL);
  sectionsRecords = await response.json();
  rankStats = aggregateAllLevels(sectionsRecords);
  centroidIndex = buildCentroidIndex(sectionsRecords, 'SEZ21_ID');

  const mapModule = new MapModule('map');
  const startDark = document.documentElement.getAttribute('data-theme') === 'dark';

  try {
    await mapModule.init(startDark);
  } catch (err) {
    console.error(err);
    mapErrorEl.classList.remove('hidden');
    return;
  }

  activeMapModule = mapModule;
  probeA = new ProbeController(mapModule.getMap(), (c, r) => onZoneAChange(circleZone(c, r)), { label: 'A' });
  polygonA = new PolygonController(mapModule.getMap(), ring => onZoneAChange(polygonZone(ring)), {
    label: 'A',
    onDrawCancel: () => setPolygonMode(false) // Esc durante il disegno: si torna al cerchio
  });
  renderConfiniButtons(mapModule);

  document.getElementById('btn-clear-circle').addEventListener('click', () => {
    if (polygonMode) {
      setPolygonMode(false);
    } else {
      probeA.clear();
      onZoneAChange(null);
    }
  });
  btnPolygonEl.addEventListener('click', () => setPolygonMode(!polygonMode));

  btnCompareEl.addEventListener('click', () => setCompareActive(!compareActive));
  btnExportCsvEl.addEventListener('click', () => exportCsv('totali', buildZonesCsv));
  btnExportSezioniCsvEl.addEventListener('click', () => exportCsv('sezioni', buildSectionsCsv));
  const densityButtons = {
    none: document.getElementById('btn-density-none'),
    popolazione: document.getElementById('btn-density-popolazione'),
    edifici: document.getElementById('btn-density-edifici')
  };
  for (const [mode, btn] of Object.entries(densityButtons)) {
    btn.addEventListener('click', () => {
      mapModule.setDensityMode(mode);
      densityMode = mode;
      for (const [m, b] of Object.entries(densityButtons)) {
        b.classList.toggle('active', m === mode);
      }
      renderLegend();
    });
  }
  document.getElementById('btn-toggle-sezioni').addEventListener('click', () => mapModule.toggleSezioni());

  setupMapToolbar(mapModule);

  const btnToggleElevazione = document.getElementById('btn-toggle-elevazione');
  btnToggleElevazione.addEventListener('click', () => {
    elevazioneVisible = !elevazioneVisible;
    mapModule.setElevazioneVisible(elevazioneVisible);
    btnToggleElevazione.classList.toggle('active', elevazioneVisible);
    renderLegend();
  });

  const btnToggleScale = document.getElementById('btn-toggle-scale');
  btnToggleScale.addEventListener('click', () => {
    scaleMode = !scaleMode;
    btnToggleScale.textContent = scaleMode ? 'Scala: assi condivisi' : 'Scala: assi indipendenti';
    btnToggleScale.classList.toggle('active', scaleMode);
    renderChart();
  });

  setupChartPanelControls();
  setupPuntoPanelControls();
  setupInfoPanel();

  puntoPanelTabEl.addEventListener('click', () => {
    puntoPanelEl.classList.toggle('collapsed');
    const width = puntoPanelEl.classList.contains('collapsed') ? 0 : puntoPanelEl.getBoundingClientRect().width;
    mapModule.setRightPadding(width);
    updateLogoPosition(width);
  });
}

function setupMapToolbar(mapModule) {
  const dialFab = document.getElementById('dial-fab');
  const dialItems = document.getElementById('dial-items');
  const btnFullscreen = document.getElementById('toolbar-fullscreen');
  const btnSatellite = document.getElementById('toolbar-satellite');
  const btn3D = document.getElementById('toolbar-3d');
  const btnTheme = document.getElementById('toolbar-theme');

  function applyThemeIcon(isDark) {
    btnTheme.classList.toggle('active', isDark);
    btnTheme.querySelector('.icon-theme-dark').style.display = isDark ? 'none' : '';
    btnTheme.querySelector('.icon-theme-light').style.display = isDark ? '' : 'none';
  }
  applyThemeIcon(document.documentElement.getAttribute('data-theme') === 'dark');

  function closeDial() {
    dialFab.classList.remove('open');
    dialItems.classList.remove('open');
    dialFab.setAttribute('aria-expanded', 'false');
  }
  dialFab.addEventListener('click', () => {
    const open = dialItems.classList.toggle('open');
    dialFab.classList.toggle('open', open);
    dialFab.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#map-toolbar')) closeDial();
  });

  dialItems.querySelectorAll('.dial-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'home') {
        mapModule.flyHome();
      } else if (btn.dataset.action === 'satellite') {
        const on = mapModule.toggleSatellite();
        btnSatellite.classList.toggle('active', on);
      } else if (btn.dataset.action === 'fullscreen') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
        else document.exitFullscreen?.();
      } else if (btn.dataset.action === 'toggle3d') {
        const is3D = mapModule.toggle3D();
        btn3D.classList.toggle('active', is3D);
        btn3D.textContent = is3D ? '3D' : '2D';
      } else if (btn.dataset.action === 'theme') {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const next = isDark ? 'light' : 'dark';
        if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem('theme', next); } catch (e) {}
        applyThemeIcon(next === 'dark');
        mapModule.setBaseTheme(next === 'dark');
      } else if (btn.dataset.action === 'info') {
        setInfoPanelOpen(true);
      }
      closeDial();
    });
  });

  document.addEventListener('fullscreenchange', () => {
    const active = !!document.fullscreenElement;
    btnFullscreen.querySelector('.icon-expand').style.display = active ? 'none' : '';
    btnFullscreen.querySelector('.icon-collapse').style.display = active ? '' : 'none';
  });
}

function setInfoPanelOpen(open) {
  const panel = document.getElementById('info-panel');
  panel.classList.toggle('open', open);
  document.getElementById('info-panel-handle').setAttribute('aria-expanded', String(open));
}

// Ingombro dei pannelli laterali → variabili CSS usate da #info-panel per
// centrarsi nello spazio libero. `collapsed` usa translateX, quindi la
// larghezza resta invariata: un pannello chiuso conta 0.
function syncInfoPanelInsets() {
  const occupied = (el) => (el.classList.contains('collapsed') ? 0 : el.offsetWidth);
  const root = document.documentElement.style;
  root.setProperty('--ip-left', `${occupied(chartPanelEl)}px`);
  root.setProperty('--ip-right', `${occupied(puntoPanelEl)}px`);
}

function setupInfoPanel() {
  const panel = document.getElementById('info-panel');
  const isOpen = () => panel.classList.contains('open');

  document.getElementById('info-panel-handle').addEventListener('click', () => setInfoPanelOpen(!isOpen()));
  document.getElementById('info-panel-close').addEventListener('click', () => setInfoPanelOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setInfoPanelOpen(false);
  });

  document.getElementById('info-panel-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.info-tab');
    if (!btn) return;
    panel.querySelectorAll('.info-tab').forEach((t) => t.classList.toggle('active', t === btn));
    panel.querySelectorAll('.info-pane').forEach((p) => p.classList.toggle('active', p.dataset.tab === btn.dataset.tab));
  });

  // I pannelli laterali cambiano stato da più punti (linguette, click sulla
  // mappa, resize a trascinamento): osservare class/style li copre tutti.
  const observer = new MutationObserver(syncInfoPanelInsets);
  for (const el of [chartPanelEl, puntoPanelEl]) {
    observer.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  syncInfoPanelInsets();
}

function setupChartPanelControls() {
  chartPanelTabEl.addEventListener('click', () => {
    chartPanelEl.classList.toggle('collapsed');
    const isOpen = !chartPanelEl.classList.contains('collapsed');
    const width = isOpen ? chartPanelEl.getBoundingClientRect().width : 0;
    if (activeMapModule) {
      activeMapModule.setLeftPadding(width);
    }
    updateLegendPosition(width);
  });

  const PANEL_MIN_WIDTH = 350;
  const PANEL_MAX_WIDTH = 500;
  let dragStartX = 0;
  let dragStartWidth = 0;

  function onDragMove(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const width = dragStartWidth + (clientX - dragStartX);
    const clamped = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width));
    chartPanelEl.style.width = `${clamped}px`;
    updateLegendPosition(clamped);
  }

  function onDragEnd() {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);
    if (activeMapModule && !chartPanelEl.classList.contains('collapsed')) {
      activeMapModule.setLeftPadding(chartPanelEl.getBoundingClientRect().width);
    }
  }

  function onDragStart(e) {
    dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
    dragStartWidth = chartPanelEl.getBoundingClientRect().width;
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragMove);
    document.addEventListener('touchend', onDragEnd);
    e.preventDefault();
  }

  chartPanelResizerEl.addEventListener('mousedown', onDragStart);
  chartPanelResizerEl.addEventListener('touchstart', onDragStart);
}

function setupPuntoPanelControls() {
  const PANEL_MIN_WIDTH = 340;
  const PANEL_MAX_WIDTH = 560;
  const resizerEl = puntoPanelEl.querySelector('.panel-resizer');
  let dragStartX = 0;
  let dragStartWidth = 0;

  function onDragMove(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    // resizer sul bordo sinistro del pannello destro: trascinare a sinistra allarga
    const width = dragStartWidth - (clientX - dragStartX);
    const clamped = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width));
    puntoPanelEl.style.width = `${clamped}px`;
    if (activeMapModule) activeMapModule.setRightPadding(clamped);
    updateLogoPosition(clamped);
  }

  function onDragEnd() {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);
  }

  function onDragStart(e) {
    dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
    dragStartWidth = puntoPanelEl.getBoundingClientRect().width;
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragMove);
    document.addEventListener('touchend', onDragEnd);
    e.preventDefault();
  }

  resizerEl.addEventListener('mousedown', onDragStart);
  resizerEl.addEventListener('touchstart', onDragStart);
}

bootstrap();
