// Modale di confronto 2021 vs 2023 per un singolo topic: due card affiancate
// (stesso markup usato nel pannello principale) più una tabella di differenze.
import { TOPICS, aggregateTopic, computeTrend } from './topics.js';
import { ChartController } from './charts.js';

const dialogEl = document.getElementById('compare-modal');
const titleEl = document.getElementById('compare-modal-title');
const colPrevEl = document.getElementById('compare-col-2021');
const colCurrEl = document.getElementById('compare-col-2023');
const diffEl = document.getElementById('compare-modal-diff');

let controllerPrev = null;
let controllerCurr = null;

function cardBodyHTML(chartType) {
  if (chartType === 'bar') return '<div class="ranking-list"></div>';
  if (chartType === 'index') return '<div class="index-card"></div>';
  return `<div class="chart-wrapper"><canvas></canvas></div>${chartType === 'doughnut' ? '<div class="doughnut-legend"></div>' : ''}`;
}

function diffRowHTML(label, prevValue, currValue) {
  const delta = currValue - prevValue;
  const pct = prevValue !== 0 ? (delta / prevValue) * 100 : (currValue !== 0 ? 100 : 0);
  const cls = Math.abs(delta) < 1 ? 'flat' : delta > 0 ? 'up' : 'down';
  const arrow = cls === 'flat' ? '≈' : cls === 'up' ? '▲' : '▼';
  const pctText = prevValue !== 0 ? `${delta > 0 ? '+' : ''}${pct.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%` : 'n.d.';
  return `
    <div class="compare-diff-row compare-diff--${cls}">
      <span class="compare-diff-label">${label}</span>
      <span class="compare-diff-value">${prevValue.toLocaleString('it-IT')}</span>
      <span class="compare-diff-arrow">${arrow}</span>
      <span class="compare-diff-value">${currValue.toLocaleString('it-IT')}</span>
      <span class="compare-diff-pct">${pctText}</span>
    </div>`;
}

export function isCompareModalReady() {
  return !!dialogEl;
}

export function openCompareModal({ topicKey, sectionIds, filterStranieri, recordsPrev, recordsCurr, zoneLabel }) {
  if (!dialogEl || !recordsCurr || recordsCurr.length === 0) return;

  const topic = TOPICS[topicKey];
  const aggPrev = aggregateTopic(recordsPrev, sectionIds, topicKey, 'SEZ21_ID', filterStranieri);
  const aggCurr = aggregateTopic(recordsCurr, sectionIds, topicKey, 'SEZ21_ID', filterStranieri);

  titleEl.textContent = `${topic.label} — 2021 vs 2023${zoneLabel ? ` · Zona ${zoneLabel}` : ''}`;

  colPrevEl.innerHTML = cardBodyHTML(topic.chartType);
  colCurrEl.innerHTML = cardBodyHTML(topic.chartType);
  controllerPrev = new ChartController(colPrevEl);
  controllerCurr = new ChartController(colCurrEl);
  controllerPrev.render(topicKey, aggPrev, TOPICS);
  controllerCurr.render(topicKey, aggCurr, TOPICS);

  const rows = topic.chartType === 'pyramid'
    ? aggCurr.labels.flatMap((label, i) => aggCurr.datasets.map((ds, di) =>
        diffRowHTML(`${label} · ${ds.label}`, aggPrev.datasets[di].data[i], ds.data[i])))
    : topic.chartType === 'index'
      ? [
          diffRowHTML('Pop. 0-14 anni', aggPrev.pop0_14, aggCurr.pop0_14),
          diffRowHTML('Pop. 65+ anni', aggPrev.pop65, aggCurr.pop65),
          diffRowHTML('Indice di vecchiaia', aggPrev.datasets[0].data[0], aggCurr.datasets[0].data[0])
        ]
      : aggCurr.labels.map((label, i) => diffRowHTML(label, aggPrev.datasets[0].data[i], aggCurr.datasets[0].data[i]));

  const trend = computeTrend(aggPrev, aggCurr);
  const totalRow = trend.pct == null
    ? ''
    : diffRowHTML('Totale', trend.prevTotal, trend.currTotal);

  diffEl.innerHTML = `
    <div class="compare-diff-row compare-diff-head">
      <span class="compare-diff-label">Categoria</span>
      <span class="compare-diff-value">2021</span>
      <span class="compare-diff-arrow"></span>
      <span class="compare-diff-value">2023</span>
      <span class="compare-diff-pct">Var.</span>
    </div>
    ${rows.join('')}
    ${totalRow}`;

  dialogEl.showModal();
}

function closeModal() {
  dialogEl.close();
}

if (dialogEl) {
  dialogEl.querySelector('[data-cm="close"]').addEventListener('click', closeModal);
  dialogEl.addEventListener('click', (e) => {
    if (e.target === dialogEl) closeModal();
  });
}
