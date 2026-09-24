import { DATA_COLORS } from './palette.js';

if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

const FONT_FAMILY = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Legge un design token da css/style.css. I canvas non ereditano le variabili
// CSS, quindi i colori vanno letti qui a ogni build della config (cambio tema
// compreso). Fuori dal browser (test node) restituisce il fallback.
function cssVar(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Default globali Chart.js (assi, legende, tooltip) allineati al tema corrente.
export function applyChartTheme() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = FONT_FAMILY;
  Chart.defaults.color = cssVar('--text-2', '#4d5875');
  Chart.defaults.borderColor = cssVar('--border', '#d9deea');
}

// Numero grande al centro dell'anello (totale) — attivo solo se
// options.plugins.centerText è presente in config.
const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    const opts = chart.config.options.plugins && chart.config.options.plugins.centerText;
    if (chart.config.type !== 'doughnut' || !opts) return;
    const { ctx, chartArea: { left, right, top, bottom } } = chart;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cssVar('--text-1', '#141b2d');
    ctx.font = `700 22px ${FONT_FAMILY}`;
    ctx.fillText(opts.total, cx, cy - 9);
    ctx.fillStyle = cssVar('--text-3', '#656f8c');
    ctx.font = `600 10px ${FONT_FAMILY}`;
    ctx.fillText(opts.label.toUpperCase(), cx, cy + 12);
    ctx.restore();
  }
};
if (typeof Chart !== 'undefined') {
  Chart.register(centerTextPlugin);
}

// Legenda HTML custom per l'anello: pallino colore, etichetta, mini-barra
// comparativa, valore e percentuale — più leggibile della legenda Chart.js.
function buildDoughnutLegendHTML(labels, data, colors) {
  const total = data.reduce((a, b) => a + b, 0);
  const maxValue = Math.max(...data, 1);
  return labels.map((label, i) => {
    const value = data[i];
    const pct = total ? Math.round((value / total) * 1000) / 10 : 0;
    const fillPct = Math.round((value / maxValue) * 100);
    return `
      <div class="doughnut-legend-row">
        <span class="doughnut-legend-dot" style="background:${colors[i]}"></span>
        <span class="doughnut-legend-label">${label}</span>
        <span class="doughnut-legend-track"><span class="doughnut-legend-fill" style="width:${fillPct}%;background:${colors[i]}"></span></span>
        <span class="doughnut-legend-value">${value.toLocaleString('it-IT')}</span>
        <span class="doughnut-legend-pct">${pct}%</span>
      </div>`;
  }).join('');
}

// Classifica HTML: righe numerate ordinate per valore decrescente, con mini-barra
// comparativa — sostituisce il grafico a barre per i topic a serie singola.
// La riga di riferimento (popolazione/stranieri totale), se presente, resta fissa
// in cima senza numero di rango.
function buildRankingListHTML(labels, data, referenceTotal, referenceLabel, sharedMax) {
  const rows = labels.map((label, i) => ({ label, value: data[i] }));
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const maxValue = sharedMax != null
    ? sharedMax
    : Math.max(referenceTotal || 0, ...rows.map(r => r.value), 1);

  const referenceRow = referenceTotal != null
    ? `
      <div class="rank-row rank-reference">
        <span class="rank-num"></span>
        <span class="rank-label">${referenceLabel}</span>
        <span class="rank-track"><span class="rank-fill" style="width:${Math.round((referenceTotal / maxValue) * 100)}%;background:${DATA_COLORS.reference}"></span></span>
        <span class="rank-value">${referenceTotal.toLocaleString('it-IT')}</span>
      </div>`
    : '';

  const dataRows = sorted.map((r, i) => `
      <div class="rank-row">
        <span class="rank-num">${i + 1}</span>
        <span class="rank-label">${r.label}</span>
        <span class="rank-track"><span class="rank-fill" style="width:${Math.round((r.value / maxValue) * 100)}%"></span></span>
        <span class="rank-value">${r.value.toLocaleString('it-IT')}</span>
      </div>`).join('');

  return referenceRow + dataRows;
}

// Stima larghezza in px di un'etichetta numerica per decidere se entra nello spazio disponibile.
function estimateLabelWidth(text, fontSize) {
  return text.length * fontSize * 0.62 + 10;
}

// Piramide (barre centrate su 0): se la barra è troppo corta per contenere il numero
// centrato, l'etichetta va spinta fuori dalla barra (lato opposto al centro) per non
// sovrapporsi all'etichetta simmetrica dell'altro sesso.
function pyramidLabelOutside(ctx) {
  const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
  const el = meta.data[ctx.dataIndex];
  if (!el) return false;
  const value = ctx.dataset.data[ctx.dataIndex];
  const needed = estimateLabelWidth(String(Math.abs(value)), 9);
  return Math.abs(el.x - el.base) < needed;
}

export function buildChartConfig(topicKey, aggregation, topics, sharedMax, referenceTotal, referenceLabel = 'Popolazione totale') {
  const topic = topics[topicKey];

  if (topic.chartType === 'doughnut') {
    const labels = aggregation.labels;
    const data = aggregation.datasets[0].data;
    const colors = labels.map(l => l === 'Maschi' ? DATA_COLORS.male : l === 'Femmine' ? DATA_COLORS.female : DATA_COLORS.other);
    const total = data.reduce((a, b) => a + b, 0);
    return {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: cssVar('--surface-2', '#ffffff') }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          centerText: { total: total.toLocaleString('it-IT'), label: 'Totale' },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.label}: ${ctx.raw.toLocaleString('it-IT')} (${total ? Math.round((ctx.raw / total) * 1000) / 10 : 0}%)`
            }
          }
        }
      },
      legendData: { labels, data, colors }
    };
  }

  if (topic.chartType === 'pyramid') {
    // Chart.js con indexAxis 'y' disegna il primo label in alto: invertiamo
    // l'ordine solo qui (presentazione) per avere 0-4 in basso e >74 in alto.
    const labels = [...aggregation.labels].reverse();
    return {
      type: 'bar',
      data: {
        labels,
        datasets: aggregation.datasets.map(ds => ({
          label: ds.label,
          data: ds.label === 'Maschi' ? [...ds.data].reverse().map(v => -v) : [...ds.data].reverse(),
          backgroundColor: ds.label === 'Maschi' ? DATA_COLORS.male : DATA_COLORS.female,
          barThickness: 14,
          maxBarThickness: 14
        }))
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            min: sharedMax != null ? -sharedMax : undefined,
            max: sharedMax != null ? sharedMax : undefined,
            display: true,
            grid: { display: false },
            border: { display: false },
            ticks: {
              font: { size: 10 },
              callback: v => Math.abs(v)
            }
          },
          y: {
            stacked: true,
            display: true,
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 10 } }
          }
        },
        plugins: {
          legend: { labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: { label: ctx => `${ctx.dataset.label}: ${Math.abs(ctx.raw)}` },
            bodyFont: { size: 13 }
          },
          datalabels: {
            display: ctx => ctx.dataset.data[ctx.dataIndex] !== 0,
            color: cssVar('--text-1', '#141b2d'),
            font: { size: 9 },
            formatter: v => Math.abs(v) || '',
            anchor: ctx => pyramidLabelOutside(ctx) ? 'end' : 'center',
            align: ctx => pyramidLabelOutside(ctx) ? 'end' : 'center'
          }
        }
      }
    };
  }

  throw new Error(`buildChartConfig non gestisce chartType '${topic.chartType}' (usare la classifica HTML)`);
}

export class ChartController {
  constructor(itemEl) {
    this.itemEl = itemEl;
    this.chart = null;
  }

  render(topicKey, aggregation, topics, sharedMax, referenceTotal, referenceLabel) {
    const topic = topics[topicKey];

    if (topic.chartType === 'bar') {
      const listEl = this.itemEl.querySelector('.ranking-list');
      listEl.innerHTML = buildRankingListHTML(
        aggregation.labels,
        aggregation.datasets[0].data,
        referenceTotal,
        referenceLabel,
        sharedMax
      );
      return;
    }

    const canvas = this.itemEl.querySelector('canvas');
    const config = buildChartConfig(topicKey, aggregation, topics, sharedMax, referenceTotal, referenceLabel);
    if (!this.chart) {
      this.chart = new Chart(canvas, config);
    } else {
      this.chart.data = config.data;
      this.chart.options = config.options;
      this.chart.config.type = config.type;
      this.chart.update();
    }
    const legendEl = this.itemEl.querySelector('.doughnut-legend');
    if (legendEl) {
      legendEl.innerHTML = config.legendData
        ? buildDoughnutLegendHTML(config.legendData.labels, config.legendData.data, config.legendData.colors)
        : '';
    }
  }
}

// Esporta in PNG il grafico di una card: titolo, canvas Chart.js, eventuale
// legenda HTML dell'anello (ridisegnata) e fonte, su sfondo pieno del tema
// (il canvas originale è trasparente).
export function exportChartPng(itemEl, title, filename) {
  const source = itemEl.querySelector('canvas');
  if (!source) return;
  const ratio = source.width / source.clientWidth || 1;
  const pad = 16 * ratio;
  const titleH = 28 * ratio;
  const rowH = 18 * ratio;
  const footH = 22 * ratio;
  const legendRows = [...itemEl.querySelectorAll('.doughnut-legend-row')].map(row => ({
    color: row.querySelector('.doughnut-legend-dot').style.background,
    text: [...row.querySelectorAll('.doughnut-legend-label, .doughnut-legend-value, .doughnut-legend-pct')]
      .map(n => n.textContent.trim()).join('   ')
  }));

  const out = document.createElement('canvas');
  out.width = source.width + pad * 2;
  out.height = pad + titleH + source.height + legendRows.length * rowH + footH + pad / 2;
  const ctx = out.getContext('2d');
  ctx.fillStyle = cssVar('--surface-1', '#ffffff');
  ctx.fillRect(0, 0, out.width, out.height);

  ctx.fillStyle = cssVar('--text-1', '#141b2d');
  ctx.font = `700 ${14 * ratio}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';
  ctx.fillText(title, pad, pad);
  ctx.drawImage(source, pad, pad + titleH);

  let y = pad + titleH + source.height + 4 * ratio;
  ctx.font = `500 ${12 * ratio}px ${FONT_FAMILY}`;
  for (const row of legendRows) {
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(pad + 5 * ratio, y + 7 * ratio, 5 * ratio, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cssVar('--text-1', '#141b2d');
    ctx.fillText(row.text, pad + 16 * ratio, y);
    y += rowH;
  }

  ctx.fillStyle = cssVar('--text-3', '#656f8c');
  ctx.font = `500 ${10 * ratio}px ${FONT_FAMILY}`;
  ctx.fillText('Fonte: ISTAT, Censimento permanente 2021 · OpenDataSicilia.it', pad, y + 6 * ratio);

  const a = document.createElement('a');
  a.download = filename;
  a.href = out.toDataURL('image/png');
  a.click();
}
