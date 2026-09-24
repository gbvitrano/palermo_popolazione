if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
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
    ctx.fillStyle = '#1b2436';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(opts.total, cx, cy - 9);
    ctx.fillStyle = '#8992a8';
    ctx.font = '600 10px system-ui, sans-serif';
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
        <span class="rank-track"><span class="rank-fill" style="width:${Math.round((referenceTotal / maxValue) * 100)}%;background:#8a94ab"></span></span>
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
    const colors = labels.map(l => l === 'Maschi' ? '#4a90d9' : l === 'Femmine' ? '#d94a7a' : '#f5c26b');
    const total = data.reduce((a, b) => a + b, 0);
    return {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#ffffff' }]
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
          backgroundColor: ds.label === 'Maschi' ? '#4a90d9' : '#d94a7a',
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
            color: '#1b2436',
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
