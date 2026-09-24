import { INDICATORI_JSON_URL } from './config.js';
import { MapModule } from './map.js';
import { ProbeController } from './probe.js';
import { PolygonController } from './polygon.js';
import { buildCentroidIndex, filterWithinZone, zoneBBox, zoneCenter, ringAreaSqMeters } from './geometry.js';
import { TOPICS, aggregateTopic } from './topics.js';
import { ChartController, applyChartTheme, exportChartPng } from './charts.js';
import { densityStops, densityLegendStops, confiniStyle, sezioniColors, ELEVATION_STOPS } from './palette.js';
import { setupAriaSync, setupTablist } from './a11y.js';
import { setupSheet, resetSnap, sheetInset } from './sheet.js';
import { renderPuntoPanel, renderPuntoSkeleton, aggregateAllLevels, renderCircRanking } from './punto.js';
import { findNearestGrigliaPoint } from './griglia.js';
import { buildZonesCsv, buildSectionsCsv, downloadCsv } from './export.js';

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
// statico in index.html: renderConfiniButtons svuota il contenitore e lo riaggancia in coda
const sezioniBtnEl = document.getElementById('btn-toggle-sezioni');
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

const CONFINI_LABELS = { circoscrizioni: 'Circoscrizioni', quartieri: 'Quartieri', upl: 'UPL' };
const isDarkTheme = () => document.documentElement.getAttribute('data-theme') === 'dark';

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

const HINT_CIRCLE = "Clicca sulla mappa per attivare l'area di analisi";
const HINT_POLYGON = 'Clicca per aggiungere i vertici · doppio click o click sul primo vertice per chiudere · Esc per annullare';

const circleZone = (center, radiusMeters) => (center ? { type: 'circle', center, radiusMeters } : null);
const polygonZone = ring => (ring ? { type: 'polygon', ring } : null);

// Fabbrica per un pannello di grafici (usata sia per il cerchio A che per il cerchio B):
// isola gli elementi DOM e lo stato dei controller Chart.js, senza duplicare la logica di rendering.
// KPI in evidenza: chip della zona, etichetta e numero grande formattato.
// Totali di popolazione dell'ultima render di ciascuna zona: servono al delta B vs A.
const kpiTotals = { A: null, B: null };

function describeZone(zone) {
  if (!zone) return '';
  if (zone.type === 'circle') return `Area circolare · raggio ${Math.round(zone.radiusMeters)} m`;
  const kmq = ringAreaSqMeters(zone.ring) / 1e6;
  return `Poligono · ${kmq.toLocaleString('it-IT', { maximumFractionDigits: 2 })} km²`;
}

// Differenza % di B rispetto ad A, solo con entrambe le zone popolate.
function kpiDeltaHTML(zoneKey) {
  const { A, B } = kpiTotals;
  if (zoneKey !== 'B' || !A || B == null) return '';
  const pct = ((B - A) / A) * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '±';
  const text = `${sign}${Math.abs(pct).toLocaleString('it-IT', { maximumFractionDigits: 1 })}% rispetto ad A`;
  return `<span class="kpi-delta">${text}</span>`;
}

// KPI in evidenza: chip della zona, etichetta, numero grande, forma della zona e delta.
function renderKpi(kpiEl, zoneKey, label, value) {
  kpiTotals[zoneKey] = value;
  const zone = zoneKey === 'A' ? zoneA : zoneB;
  kpiEl.innerHTML = `
    <span class="kpi-label"><span class="zone-chip zone-chip--${zoneKey.toLowerCase()}" aria-hidden="true">${zoneKey}</span>${label}</span>
    <span class="kpi-value">${Number(value).toLocaleString('it-IT')}</span>
    <span class="kpi-sub">${describeZone(zone)}${kpiDeltaHTML(zoneKey)}</span>`;
}

function createTopicChartPanel({ chartListEl, chartTitleEl, kpiEl, missingBadgeEl, kpiLabel, zoneKey }) {
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
      const isCanvas = TOPICS[key].chartType !== 'bar';
      const infoId = `chart-info-${zoneKey}-${key}`;
      itemEl.innerHTML = `
        <div class="chart-item-head">
          <div class="chart-item-title">${TOPICS[key].label}</div>
          <div class="chart-item-actions">
            <button type="button" class="card-action" data-act="info" aria-expanded="false" aria-controls="${infoId}"
                    title="Cosa misura questo indicatore" aria-label="Informazioni: ${TOPICS[key].label}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.8" r="0.6" fill="currentColor"/></svg>
            </button>
            ${isCanvas ? `<button type="button" class="card-action" data-act="png"
                    title="Scarica il grafico in PNG" aria-label="Scarica in PNG: ${TOPICS[key].label}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>
            </button>` : ''}
          </div>
        </div>
        <p class="chart-item-info" id="${infoId}" hidden>${TOPICS[key].description || ''}</p>
        <div class="chart-item-card">
          ${TOPICS[key].chartType === 'bar'
            ? '<div class="ranking-list"></div>'
            : `<div class="chart-wrapper"><canvas></canvas></div>${TOPICS[key].chartType === 'doughnut' ? '<div class="doughnut-legend"></div>' : ''}`}
        </div>
      `;
      itemEl.querySelector('.chart-item-actions').addEventListener('click', (e) => {
        const btn = e.target.closest('.card-action');
        if (!btn) return;
        if (btn.dataset.act === 'info') {
          const infoEl = itemEl.querySelector('.chart-item-info');
          infoEl.hidden = !infoEl.hidden;
          btn.setAttribute('aria-expanded', String(!infoEl.hidden));
          btn.classList.toggle('active', !infoEl.hidden);
        } else if (btn.dataset.act === 'png') {
          const title = `${itemEl.querySelector('.chart-item-title').textContent} — Zona ${zoneKey}`;
          exportChartPng(itemEl, title, `palermo_${key}_zona-${zoneKey.toLowerCase()}.png`);
        }
      });
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
      renderKpi(kpiEl, zoneKey, kpiLabel, 0);
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
    renderKpi(kpiEl, zoneKey, kpiLabel, totalPopulation);

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

// Rampa continua (interpolate lineare in map.js) → barra a gradiente con gli
// stop nella stessa posizione proporzionale che hanno sulla mappa.
function gradientLegendHTML(mode) {
  const isDark = isDarkTheme();
  const stops = densityStops(mode, isDark);
  const labels = densityLegendStops(mode, isDark);
  const max = stops[stops.length - 1][0];
  const pos = (v) => `${Math.round((v / max) * 1000) / 10}%`;
  const gradient = stops.map(([v, c]) => `${c} ${pos(v)}`).join(', ');
  const ticks = stops.map(([v], i) => `<span class="legend-tick" style="left:${pos(v)}">${labels[i].value}</span>`).join('');
  return `<div class="legend-gradient" style="background:linear-gradient(to right, ${gradient})"></div><div class="legend-ticks">${ticks}</div>`;
}

function renderLegend() {
  legendContentEl.innerHTML = '';

  if (densityMode !== 'none') {
    const isEdifici = densityMode === 'edifici';
    const title = document.createElement('div');
    title.className = 'panel-subheader';
    title.textContent = isEdifici ? 'Copertura edifici (%)' : 'Densità popolazione (ab/ha)';
    legendContentEl.appendChild(title);
    legendContentEl.insertAdjacentHTML('beforeend', gradientLegendHTML(densityMode));
  } else if (spotActive) {
    const title = document.createElement('div');
    title.className = 'panel-subheader';
    title.textContent = 'Densità popolazione nella zona (ab/ha)';
    legendContentEl.appendChild(title);
    legendContentEl.insertAdjacentHTML('beforeend', gradientLegendHTML('popolazione'));
  }

  if (confiniActiveLevels.size > 0) {
    const title = document.createElement('div');
    title.className = 'panel-subheader';
    title.textContent = 'Confini';
    legendContentEl.appendChild(title);
    for (const level of Object.keys(CONFINI_LABELS).filter(l => confiniActiveLevels.has(l))) {
      const style = confiniStyle(level, isDarkTheme());
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = `<span class="legend-line" style="border-top-color:${style.color};border-top-style:${style.css};border-top-width:${Math.max(2, Math.round(style.width))}px"></span><span>${CONFINI_LABELS[level]}</span>`;
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
    const style = confiniStyle(level, isDarkTheme());
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
  confiniButtonsEl.appendChild(sezioniBtnEl);
  syncSezioniButton(mapModule);
}

// "Sezioni" è statico in index.html, ma ha lo stesso aspetto dei bottoni
// confini: pallino col colore del bordo sezioni, pieno se attivo.
function syncSezioniButton(mapModule) {
  const btn = sezioniBtnEl;
  const color = sezioniColors(isDarkTheme()).border;
  const dot = btn.querySelector('.confini-dot');
  dot.style.borderColor = color;
  dot.style.background = mapModule.sezioniVisible ? color : 'transparent';
  btn.classList.toggle('active', mapModule.sezioniVisible);
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
  // la scala comune ha senso solo con almeno due grafici da confrontare
  document.getElementById('btn-toggle-scale').classList.toggle('hidden', activeTopics.size < 2);
  if (lastSectionIds.length > 0) chartPanelA.render(lastSectionIds);
  if (compareActive) chartPanelB.render(lastSectionIdsB);
}

// ── Layout responsive ──
// desktop (> 899px): pannelli laterali affiancati alla mappa, anche entrambi aperti.
// compatto (≤ 899px): un solo pannello aperto alla volta.
// mobile (≤ 640px): i pannelli diventano sheet dal basso (css/style.css).
const compactMQ = window.matchMedia('(max-width: 899px)');
const mobileMQ = window.matchMedia('(max-width: 640px)');
const isOpen = (panelEl) => !panelEl.classList.contains('collapsed');

// Padding della mappa, legenda, toolbar e logo ricavati dallo stato corrente
// dei pannelli: unico punto di calcolo per tutti i casi (apertura, resize, breakpoint).
function syncLayout() {
  const leftW = isOpen(chartPanelEl) ? chartPanelEl.getBoundingClientRect().width : 0;
  const rightW = isOpen(puntoPanelEl) ? puntoPanelEl.getBoundingClientRect().width : 0;
  if (mobileMQ.matches) {
    const sheet = [chartPanelEl, puntoPanelEl].find(isOpen);
    activeMapModule?.setPadding({ bottom: sheet ? sheetInset(sheet) : 0 });
    return;
  }
  activeMapModule?.setPadding({ left: leftW, right: rightW });
}

function showPanel(panelEl) {
  // su mobile uno sheet che si riapre riparte da metà altezza
  if (mobileMQ.matches && !isOpen(panelEl)) resetSnap(panelEl);
  panelEl.classList.remove('collapsed');
  if (compactMQ.matches) {
    const other = panelEl === chartPanelEl ? puntoPanelEl : chartPanelEl;
    other.classList.add('collapsed');
  }
  syncLayout();
}

function hidePanel(panelEl) {
  panelEl.classList.add('collapsed');
  syncLayout();
}

function togglePanel(panelEl) {
  if (isOpen(panelEl)) hidePanel(panelEl);
  else showPanel(panelEl);
}

// Sul passaggio a un layout compatto con entrambi i pannelli aperti ne resta uno.
function onBreakpointChange() {
  if (compactMQ.matches && isOpen(chartPanelEl) && isOpen(puntoPanelEl)) {
    puntoPanelEl.classList.add('collapsed');
  }
  syncPanelInsets(); // il breakpoint cambia l'ingombro anche se le classi restano uguali
  syncLayout();
}

let puntoRequestId = 0;
let rankStats = null; // popolazione per circoscrizione/quartiere/UPL, calcolata una volta in bootstrap()

// autoOpen = false: aggiorna i contenuti senza forzare l'apertura del pannello
// (in layout compatto non si riapre a ogni trascinamento della zona).
function updatePuntoPanel(center, autoOpen = true) {
  if (!activeMapModule) return;
  if (!center) {
    puntoRequestId++;
    hidePanel(puntoPanelEl);
    puntoCoordsEl.textContent = '';
    puntoLuogoEl.textContent = '';
    puntoBodyEl.innerHTML = '';
    puntoQuotaBoxEl.classList.add('hidden');
    return;
  }
  if (autoOpen) showPanel(puntoPanelEl);
  puntoCoordsEl.textContent = `${center[1].toFixed(4)}° N  ${center[0].toFixed(4)}° E`;

  const luogo = activeMapModule.getLuogoAt(center);
  puntoLuogoEl.textContent = luogo
    ? `${luogo.UPL} · ${luogo.Quartiere} · Circ. ${luogo.Circoscrizione}`
    : '';

  const requestId = ++puntoRequestId;
  // skeleton solo se la risposta tarda: con le tile già in cache arriva subito
  // e mostrarlo a ogni trascinamento farebbe solo sfarfallare il pannello
  const skeletonTimer = setTimeout(() => {
    if (requestId === puntoRequestId) renderPuntoSkeleton(puntoBodyEl);
  }, 200);
  findNearestGrigliaPoint(center).then(props => {
    clearTimeout(skeletonTimer);
    if (requestId !== puntoRequestId) return; // spot spostato/eliminato nel frattempo
    renderPuntoPanel(puntoBodyEl, props, puntoQuotaBoxEl, puntoQuotaValEl);
    renderCircRanking(puntoBodyEl, rankStats, luogo);
  });
}

function onZoneAChange(zone) {
  // in layout compatto i pannelli si aprono da soli solo alla creazione della zona
  const autoOpen = !compactMQ.matches || !zoneA;
  zoneA = zone;
  const center = zone ? zoneCenter(zone) : null;
  if (activeMapModule) activeMapModule.updateEdificatoSpot('A', zone);
  spotActive = !!zone;
  renderLegend();
  btnCompareEl.disabled = !zone;
  btnExportCsvEl.disabled = !zone;
  btnExportSezioniCsvEl.disabled = !zone;
  if (!zone && compareActive) setCompareActive(false);
  if (!compareActive) updatePuntoPanel(center, autoOpen);
  if (!zone) {
    lastSectionIds = [];
    hidePanel(chartPanelEl);
    if (!polygonA?.isDrawing) probeHintEl.classList.remove('hidden');
    return;
  }
  probeHintEl.classList.add('hidden');
  if (autoOpen) showPanel(chartPanelEl);
  lastSectionIds = filterWithinZone(centroidIndex, zone);
  chartPanelA.render(lastSectionIds);
  if (compareActive && zoneB) chartPanelB.render(lastSectionIdsB);
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
  // al centro solo per il cerchio: durante il disegno del poligono coprirebbe i vertici
  probeHintEl.classList.toggle('hint-banner--center', !active);
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
    showPanel(puntoPanelEl);

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

// ── Schermata di caricamento ──
const loaderEl = document.getElementById('app-loader');

function setLoaderStep(step, state, detail = '') {
  const li = loaderEl.querySelector(`[data-step="${step}"]`);
  li.dataset.state = state; // active | done | error
  li.querySelector('.step-detail').textContent = detail;
}

// pct = 0..1 per una barra determinata, null per l'animazione indeterminata
function setLoaderProgress(pct) {
  const bar = loaderEl.querySelector('.app-loader-bar');
  bar.classList.toggle('indeterminate', pct == null);
  bar.firstElementChild.style.width = pct == null ? '' : `${Math.round(pct * 100)}%`;
}

function showLoaderError(message) {
  loaderEl.classList.add('has-error');
  const box = loaderEl.querySelector('.app-loader-error');
  box.querySelector('p').textContent = message;
  box.hidden = false;
  loaderEl.setAttribute('role', 'alert');
  box.querySelector('.app-loader-retry').onclick = () => location.reload();
}

function hideLoader() {
  loaderEl.classList.add('done');
  loaderEl.addEventListener('transitionend', () => loaderEl.remove(), { once: true });
  setTimeout(() => loaderEl.remove(), 800); // se la transizione è disattivata (movimento ridotto)
}

// Scarica il JSON indicatori riportando l'avanzamento. Con risposta compressa
// Content-Length conta i byte compressi, mentre lo stream restituisce quelli
// decompressi: in quel caso si mostrano solo i MB ricevuti, senza percentuale.
async function fetchIndicatori(onProgress) {
  const response = await fetch(INDICATORI_JSON_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const encoded = response.headers.get('Content-Encoding');
  const total = encoded ? 0 : Number(response.headers.get('Content-Length')) || 0;
  if (!response.body) return response.json();

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

const formatMB = (bytes) => `${(bytes / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;

async function bootstrap() {
  renderTopicButtons();
  chartPanelA = createTopicChartPanel({
    chartListEl, chartTitleEl, kpiEl, missingBadgeEl, kpiLabel: 'Popolazione nella zona', zoneKey: 'A'
  });
  chartPanelB = createTopicChartPanel({
    chartListEl: chartListBEl, chartTitleEl: null, kpiEl: kpiBEl, missingBadgeEl: missingBadgeBEl, kpiLabel: 'Popolazione nella zona', zoneKey: 'B'
  });

  applyChartTheme();
  const mapModule = new MapModule('map');
  const startDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Dati e mappa sono indipendenti: si caricano in parallelo.
  setLoaderProgress(null);
  const datiPromise = fetchIndicatori((received, total) => {
    setLoaderStep('dati', 'active', total ? `${Math.round((received / total) * 100)}%` : formatMB(received));
    if (total) setLoaderProgress(received / total);
  }).then(records => {
    setLoaderStep('dati', 'done');
    return records;
  }, err => {
    setLoaderStep('dati', 'error');
    throw new Error(`Impossibile scaricare i dati del censimento (${err.message}).`);
  });
  const mappaPromise = mapModule.init(startDark).then(() => {
    setLoaderStep('mappa', 'done');
  }, err => {
    setLoaderStep('mappa', 'error');
    throw new Error(`Impossibile caricare la mappa (${err?.message || 'errore di rete'}).`);
  });

  try {
    [sectionsRecords] = await Promise.all([datiPromise, mappaPromise]);
  } catch (err) {
    console.error(err);
    showLoaderError(`${err.message} Controlla la connessione e riprova.`);
    return;
  }
  rankStats = aggregateAllLevels(sectionsRecords);
  centroidIndex = buildCentroidIndex(sectionsRecords, 'SEZ21_ID');

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
  // Interruttori: click sul pulsante attivo lo spegne (→ 'none'); popolazione ed edifici
  // colorano lo stesso layer, quindi accenderne uno spegne l'altro.
  const densityButtons = {
    popolazione: document.getElementById('btn-density-popolazione'),
    edifici: document.getElementById('btn-density-edifici')
  };
  for (const [mode, btn] of Object.entries(densityButtons)) {
    btn.addEventListener('click', () => {
      const next = densityMode === mode ? 'none' : mode;
      mapModule.setDensityMode(next);
      densityMode = next;
      for (const [m, b] of Object.entries(densityButtons)) {
        b.classList.toggle('active', m === next);
      }
      renderLegend();
    });
  }
  sezioniBtnEl.addEventListener('click', () => {
    mapModule.toggleSezioni();
    syncSezioniButton(mapModule);
  });

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
    btnToggleScale.classList.toggle('active', scaleMode);
    renderChart();
  });

  setupChartPanelControls();
  setupPuntoPanelControls();
  setupInfoPanel();
  setupLegendToggle();
  for (const panelEl of [chartPanelEl, puntoPanelEl]) {
    setupSheet(panelEl, {
      isActive: () => mobileMQ.matches,
      onSnap: syncLayout,
      onClose: () => hidePanel(panelEl)
    });
  }
  setupAriaSync();

  puntoPanelTabEl.addEventListener('click', () => togglePanel(puntoPanelEl));

  compactMQ.addEventListener('change', onBreakpointChange);
  mobileMQ.addEventListener('change', onBreakpointChange);

  hideLoader(); // ultimo passo: l'interfaccia è pronta
}

function setupLegendToggle() {
  const toggle = document.getElementById('legend-toggle');
  const apply = (collapsed) => {
    legendPanelEl.classList.toggle('legend-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
  };
  // Su mobile la legenda copre la mappa: parte chiusa e ricorda una scelta separata dal desktop
  const storageKey = () => (mobileMQ.matches ? 'legendCollapsedMobile' : 'legendCollapsed');
  const load = () => {
    let saved = null;
    try { saved = localStorage.getItem(storageKey()); } catch (e) {}
    return saved === null ? mobileMQ.matches : saved === '1';
  };
  let collapsed = load();
  apply(collapsed);
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    apply(collapsed);
    try { localStorage.setItem(storageKey(), collapsed ? '1' : '0'); } catch (e) {}
  });
  mobileMQ.addEventListener('change', () => {
    collapsed = load();
    apply(collapsed);
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
      } else if (btn.dataset.action === 'theme') {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const next = isDark ? 'light' : 'dark';
        if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem('theme', next); } catch (e) {}
        applyThemeIcon(next === 'dark');
        mapModule.setBaseTheme(next === 'dark');
        // i canvas Chart.js non ereditano i token CSS: ricostruisce le config col nuovo tema
        applyChartTheme();
        renderChart();
        renderConfiniButtons(mapModule);
        renderLegend();
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
// Ingombro laterale dei pannelli → --inset-left / --inset-right su :root.
// Li usano pannello Info, legenda, toolbar e logo per restare nello spazio libero.
// Su mobile i pannelli sono sheet in basso: nessun ingombro laterale.
function syncPanelInsets() {
  const occupied = (el) => (mobileMQ.matches || el.classList.contains('collapsed') ? 0 : el.offsetWidth);
  const root = document.documentElement.style;
  root.setProperty('--inset-left', `${occupied(chartPanelEl)}px`);
  root.setProperty('--inset-right', `${occupied(puntoPanelEl)}px`);
}

function setupInfoPanel() {
  const panel = document.getElementById('info-panel');
  const isOpen = () => panel.classList.contains('open');

  document.getElementById('info-panel-handle').addEventListener('click', () => setInfoPanelOpen(!isOpen()));
  document.getElementById('info-panel-close').addEventListener('click', () => setInfoPanelOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setInfoPanelOpen(false);
  });

  const navEl = document.getElementById('info-panel-nav');
  const activateTab = (btn) => {
    panel.querySelectorAll('.info-tab').forEach((t) => t.classList.toggle('active', t === btn));
    panel.querySelectorAll('.info-pane').forEach((p) => p.classList.toggle('active', p.dataset.tab === btn.dataset.tab));
  };
  navEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.info-tab');
    if (btn) activateTab(btn);
  });
  setupTablist(navEl, activateTab);

  // Indice della Guida: scorre alla sezione senza toccare location.hash,
  // che la mappa usa per zoom e posizione (hash: true).
  panel.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#guida-"]');
    if (!link) return;
    e.preventDefault();
    document.getElementById(link.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // I pannelli laterali cambiano stato da più punti (linguette, click sulla
  // mappa, resize a trascinamento): osservare class/style li copre tutti.
  const observer = new MutationObserver(syncPanelInsets);
  for (const el of [chartPanelEl, puntoPanelEl]) {
    observer.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  syncPanelInsets();
}

function setupChartPanelControls() {
  chartPanelTabEl.addEventListener('click', () => togglePanel(chartPanelEl));

  const PANEL_MIN_WIDTH = 350;
  const PANEL_MAX_WIDTH = 500;
  let dragStartX = 0;
  let dragStartWidth = 0;

  function onDragMove(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const width = dragStartWidth + (clientX - dragStartX);
    const clamped = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width));
    chartPanelEl.style.width = `${clamped}px`;
  }

  function onDragEnd() {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);
    syncLayout();
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
    syncLayout();
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
