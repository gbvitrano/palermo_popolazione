const CLASS_COLORS = {
  1: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  2: { bg: '#d9f99d', text: '#3a5a0a', border: '#a3e635' },
  3: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  4: { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  5: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' }
};
const NAME_TO_CLASS = {
  'molto stabile': 1, 'stabile': 2, 'moderatamente instabile': 3,
  'instabile': 4, 'molto instabile': 5,
  'ottima': 1, 'buona': 2, 'moderata': 3, 'difficile': 4, 'non idonea': 5
};

function classColor(nome) {
  if (!nome) return null;
  const key = nome.toLowerCase().trim();
  for (const [k, v] of Object.entries(NAME_TO_CLASS)) {
    if (key.includes(k)) return CLASS_COLORS[v];
  }
  return null;
}

function n(v, decimals = 1) {
  return v != null && v !== '' && !isNaN(+v) ? Number(v).toFixed(decimals) : '—';
}

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function sec(label) {
  const s = el('div', 'punto-sec');
  s.appendChild(Object.assign(el('div', 'punto-sec-label'), { textContent: label }));
  return s;
}

function row(label, value) {
  const r = el('div', 'punto-row');
  r.appendChild(Object.assign(el('span', 'punto-row-label'), { textContent: label }));
  r.appendChild(Object.assign(el('span', 'punto-row-value'), { textContent: value }));
  return r;
}

function badgeRow(label, nome) {
  const r = el('div', 'punto-row');
  r.appendChild(Object.assign(el('span', 'punto-row-label'), { textContent: label }));
  const badge = el('span', 'punto-badge');
  badge.textContent = nome || '—';
  const c = classColor(nome);
  if (c) badge.style.cssText = `background:${c.bg};color:${c.text};border-color:${c.border};`;
  r.appendChild(badge);
  return r;
}

/**
 * Popola il pannello destro con gli indici morfometrici del punto griglia
 * più vicino allo spot attivo. p = properties del punto (o null se fuori griglia).
 * quotaBoxEl/quotaValEl: box in header che mostra la quota in evidenza.
 */
export function renderPuntoPanel(bodyEl, p, quotaBoxEl, quotaValEl) {
  bodyEl.innerHTML = '';

  if (!p) {
    if (quotaBoxEl) quotaBoxEl.classList.add('hidden');
    bodyEl.appendChild(Object.assign(el('div', 'punto-empty'), {
      textContent: 'Nessun dato DTM per questo punto (fuori dalla griglia disponibile).'
    }));
    return;
  }

  if (quotaBoxEl && quotaValEl) {
    quotaValEl.textContent = n(p.quota, 0);
    quotaBoxEl.classList.remove('hidden');
  }

  const sPend = sec('Pendenza');
  sPend.appendChild(row('Gradi', `${n(p.slope_deg)}°`));
  sPend.appendChild(row('Percentuale', `${n(p.slope_pct)} %`));
  bodyEl.appendChild(sPend);

  const sMorf = sec('Morfologia');
  sMorf.appendChild(row('Esposizione', p.aspetto_nome || '—'));
  sMorf.appendChild(row('Forma terreno', p.geomorf_nome || '—'));
  bodyEl.appendChild(sMorf);

  const sRisk = sec('Rischio versanti');
  sRisk.appendChild(badgeRow('Stabilità', p.stabilita_nome));
  sRisk.appendChild(badgeRow('Costruibilità', p.costr_nome));
  bodyEl.appendChild(sRisk);

  const sIdx = sec('Indici morfometrici');
  const idxGrid = el('div', 'punto-idx-grid');
  [['TRI', n(p.tri, 2)], ['TPI', n(p.tpi, 2)], ['SRI', n(p.sri, 2)], ['HS', n(p.hillshade, 0)]].forEach(([k, v]) => {
    const cell = el('div', 'punto-idx-cell');
    cell.appendChild(Object.assign(el('div', 'punto-idx-val'), { textContent: v }));
    cell.appendChild(Object.assign(el('div', 'punto-idx-key'), { textContent: k }));
    idxGrid.appendChild(cell);
  });
  sIdx.appendChild(idxGrid);
  bodyEl.appendChild(sIdx);

  const sIdro = sec('Idrologia');
  sIdro.appendChild(row('TWI — Umidità topografica', n(p.twi, 1)));
  sIdro.appendChild(row('SPI — Stream Power', n(p.spi, 2)));
  if (p.flow_acc != null) sIdro.appendChild(row('Flow Acc. (log)', n(p.flow_acc, 2)));
  if (p.dtw != null) sIdro.appendChild(row('DTW — Profondità falda', `${n(p.dtw, 1)} m`));
  bodyEl.appendChild(sIdro);

  const sEn = sec('Energia e clima');
  if (p.svf != null) sEn.appendChild(row('SVF — Cielo visibile', `${Math.round(p.svf * 100)} %`));
  if (p.fv != null) sEn.appendChild(row('Potenziale FV', `${Math.round(p.fv * 100)} %`));
  if (p.ombra_est != null) sEn.appendChild(row('Ombra estiva', `${Math.round(p.ombra_est / 2.55)} %`));
  if (p.ombra_inv != null) sEn.appendChild(row('Ombra invernale', `${Math.round(p.ombra_inv / 2.55)} %`));
  if (p.frost != null) sEn.appendChild(row('Rischio gelata', n(p.frost, 3)));
  bodyEl.appendChild(sEn);

  const sMob = sec('Accessibilità ed erosione');
  if (p.tobler != null) sMob.appendChild(row('Velocità Tobler', `${n(p.tobler, 1)} km/h`));
  if (p.viewshed != null) sMob.appendChild(row('Visibilità cumulativa', `${Math.round(p.viewshed)}/6 punti`));
  if (p.rusle != null) sMob.appendChild(row('Erosione RUSLE LS', n(p.rusle, 2)));
  bodyEl.appendChild(sMob);

  const note = el('div', 'punto-note');
  note.innerHTML = 'Per maggiori dettagli sul territorio consultare la mappa ' +
    '<a href="https://palermohub.opendatasicilia.it/palermo_dtm5m.html" target="_blank" rel="noopener" title="Analisi morfologica interattiva del territorio del Comune di Palermo su DTM 5m ad alta risoluzione">palermo_dtm5m</a>.';
  bodyEl.appendChild(note);
}

// Livelli amministrativi della classifica: campo del record ISTAT, etichetta pulsante, prefisso riga
export const RANK_LEVELS = {
  circoscrizioni: { field: 'Circoscrizione', button: 'Circoscrizione', title: 'circoscrizione', prefix: 'Circ. ', tip: 'Circoscrizione ' },
  quartieri: { field: 'Quartiere', button: 'Quartieri', title: 'quartiere', prefix: '', tip: 'Quartiere ' },
  upl: { field: 'UPL', button: 'UPL', title: 'UPL', prefix: '', tip: 'UPL ' }
};

let currentRankLevel = 'circoscrizioni'; // persiste tra un render e l'altro (spostamento spot)

/**
 * Aggrega popolazione residente (P1) e stranieri (ST1) per il campo indicato
 * (Circoscrizione, Quartiere, UPL). Italiani = P1 − ST1 (dato derivato).
 * Ordinato per totale decrescente.
 */
export function aggregateByField(records, field) {
  const byKey = new Map();
  for (const r of records) {
    const k = r[field];
    if (!k) continue;
    const agg = byKey.get(k) || { circ: k, totale: 0, stranieri: 0 };
    agg.totale += +r.P1 || 0;
    agg.stranieri += +r.ST1 || 0;
    byKey.set(k, agg);
  }
  return [...byKey.values()]
    .map(a => ({ ...a, italiani: a.totale - a.stranieri }))
    .sort((a, b) => b.totale - a.totale);
}

/** Pre-calcola le classifiche per tutti i livelli di RANK_LEVELS. */
export function aggregateAllLevels(records) {
  return Object.fromEntries(
    Object.entries(RANK_LEVELS).map(([lvl, cfg]) => [lvl, aggregateByField(records, cfg.field)])
  );
}

/**
 * Classifica popolazione con barre impilate italiani/stranieri, accodata al
 * pannello. Pulsanti Circoscrizione/Quartieri/UPL cambiano livello; luogo
 * ({ Circoscrizione, Quartiere, UPL }) evidenzia l'unità in cui cade il punto.
 */
export function renderCircRanking(bodyEl, statsByLevel, luogo) {
  if (!statsByLevel || !statsByLevel.circoscrizioni?.length) return;
  const fmt = v => Math.round(v).toLocaleString('it-IT');

  // stessa struttura card dei grafici del chart panel (chart-item → title + card)
  const item = el('div', 'chart-item circ-item');
  const title = el('div', 'chart-item-title');
  item.appendChild(title);
  const s = el('div', 'chart-item-card');
  item.appendChild(s);

  const switcher = el('div', 'circ-level-buttons');
  s.appendChild(switcher);

  const legend = el('div', 'circ-legend');
  legend.innerHTML =
    '<span><i class="circ-dot circ-it"></i>Italiani</span>' +
    '<span><i class="circ-dot circ-st"></i>Stranieri</span>' +
    '<span class="circ-legend-spot" title="Riga evidenziata: unità in cui cade lo spot"><i class="circ-dot circ-spot"></i>Zona dello spot</span>' +
    '<span class="circ-legend-pct">% str.</span>';
  s.appendChild(legend);

  const list = el('div', 'ranking-list');
  s.appendChild(list);

  const tot = el('div', 'punto-row circ-total');
  s.appendChild(tot);

  const src = el('div', 'circ-source');
  src.textContent = 'Fonte: ISTAT, Censimento permanente 2021 — sezioni di censimento.';
  s.appendChild(src);

  const buttons = {};
  const draw = () => {
    const cfg = RANK_LEVELS[currentRankLevel];
    const stats = statsByLevel[currentRankLevel] || [];
    const current = luogo?.[cfg.field];
    const maxTot = stats[0]?.totale || 1;
    const cittaTot = stats.reduce((acc, a) => acc + a.totale, 0);
    const cittaStr = stats.reduce((acc, a) => acc + a.stranieri, 0);

    title.textContent = `Popolazione residente per ${cfg.title}`;
    for (const [lvl, b] of Object.entries(buttons)) b.classList.toggle('active', lvl === currentRankLevel);
    list.classList.toggle('circ-list-long', currentRankLevel !== 'circoscrizioni');

    list.innerHTML = '';
    stats.forEach((a, i) => {
      const pctSt = a.totale ? (a.stranieri / a.totale) * 100 : 0;
      const r = el('div', 'rank-row circ-row' + (a.circ === current ? ' circ-current' : ''));
      r.title = `${cfg.tip}${a.circ}\nTotale: ${fmt(a.totale)}\n` +
        `Italiani: ${fmt(a.italiani)}\nStranieri: ${fmt(a.stranieri)} (${pctSt.toFixed(1)}%)`;
      r.innerHTML = `
        <span class="rank-num">${i + 1}</span>
        <span class="rank-label circ-label"></span>
        <span class="rank-track circ-track">
          <span class="circ-fill circ-it" style="width:${(a.italiani / maxTot) * 100}%"></span>
          <span class="circ-fill circ-st" style="width:${(a.stranieri / maxTot) * 100}%"></span>
        </span>
        <span class="rank-value">${fmt(a.totale)}</span>
        <span class="circ-pct">${pctSt.toFixed(1)}%</span>`;
      r.querySelector('.circ-label').textContent = cfg.prefix + a.circ; // nomi da dati: niente innerHTML
      list.appendChild(r);
    });

    tot.innerHTML = '';
    tot.appendChild(Object.assign(el('span', 'punto-row-label'), { textContent: 'Palermo — totale' }));
    tot.appendChild(Object.assign(el('span', 'punto-row-value'), {
      textContent: `${fmt(cittaTot)} · str. ${fmt(cittaStr)} (${cittaTot ? ((cittaStr / cittaTot) * 100).toFixed(1) : '0.0'}%)`
    }));

    // voce di legenda solo se una riga è davvero evidenziata (spot fuori dai confini → nessuna)
    legend.querySelector('.circ-legend-spot').classList.toggle('hidden', !list.querySelector('.circ-current'));

    // porta in vista l'unità corrente dentro la lista scrollabile (senza muovere il pannello)
    const cur = list.querySelector('.circ-current');
    if (cur && list.scrollHeight > list.clientHeight) {
      list.scrollTop = cur.offsetTop - list.clientHeight / 2 + cur.offsetHeight / 2;
    } else {
      list.scrollTop = 0;
    }
  };

  for (const [lvl, cfg] of Object.entries(RANK_LEVELS)) {
    const b = el('button', 'circ-level-btn');
    b.type = 'button';
    b.textContent = cfg.button;
    b.addEventListener('click', () => {
      if (currentRankLevel === lvl) return;
      currentRankLevel = lvl;
      draw();
    });
    buttons[lvl] = b;
    switcher.appendChild(b);
  }

  bodyEl.appendChild(item);
  draw();
}
