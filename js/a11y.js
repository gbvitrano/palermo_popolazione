// Stato ARIA derivato dalle classi CSS. Gli stati visivi (`active`, `collapsed`,
// `open`) cambiano da molti punti di app.js, punto.js e map toolbar: invece di
// aggiornare gli attributi a ogni toggle, un MutationObserver li riallinea qui.

// Bottoni on/off: aria-pressed segue la classe `active`.
const TOGGLE_SELECTOR = [
  '#topic-buttons button',
  '#confini-buttons button',
  '#btn-toggle-sezioni',
  '#btn-toggle-elevazione',
  '#btn-density-popolazione',
  '#btn-density-edifici',
  '#btn-draw-polygon',
  '#btn-compare',
  '#toolbar-satellite',
  '#toolbar-3d',
  '#toolbar-theme'
].join(',');

// Scelte esclusive e interruttori: aria-checked segue la classe `active`.
const RADIO_SELECTOR = '[role="radio"], [role="switch"], .circ-level-btn';

// Elementi fuori schermo o chiusi: `inert` li toglie dal tab e dagli screen reader.
// [contenitore, elemento da rendere inerte, è chiuso?, bottone con aria-expanded]
function collapsibles() {
  const byId = (id) => document.getElementById(id);
  return [
    [byId('chart-panel'), byId('chart-panel-scroll'), (el) => el.classList.contains('collapsed'), byId('chart-panel-tab')],
    [byId('punto-panel'), byId('punto-panel-scroll'), (el) => el.classList.contains('collapsed'), byId('punto-panel-tab')],
    [byId('dial-items'), byId('dial-items'), (el) => !el.classList.contains('open'), null],
    [byId('info-panel'), byId('info-panel-body'), (el) => !el.classList.contains('open'), null]
  ].filter(([container, target]) => container && target);
}

function syncButton(btn) {
  if (btn.matches(RADIO_SELECTOR)) {
    if (!btn.hasAttribute('role')) btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(btn.classList.contains('active')));
  } else if (btn.matches(TOGGLE_SELECTOR)) {
    btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
  }
}

function syncAllButtons(root = document) {
  root.querySelectorAll(`${TOGGLE_SELECTOR},${RADIO_SELECTOR}`).forEach(syncButton);
}

function syncCollapsible([container, target, isClosed, trigger]) {
  const closed = isClosed(container);
  target.inert = closed;
  if (trigger) trigger.setAttribute('aria-expanded', String(!closed));
}

export function setupAriaSync() {
  const items = collapsibles();
  items.forEach(syncCollapsible);
  syncAllButtons();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        // bottoni creati dinamicamente (topic, confini, livelli classifica)
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches('button')) syncButton(node);
          syncAllButtons(node);
        }
        continue;
      }
      const el = m.target;
      if (el.matches('button')) syncButton(el);
      const item = items.find(([container]) => container === el);
      if (item) syncCollapsible(item);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
}

// Tablist con navigazione da tastiera (pattern WAI-ARIA "Tabs"): frecce, Home/End,
// tabindex roving. `activate(tab)` è la funzione di app.js che mostra il pannello.
export function setupTablist(tablistEl, activate) {
  const tabs = () => [...tablistEl.querySelectorAll('[role="tab"]')];

  const sync = () => {
    for (const t of tabs()) {
      const selected = t.classList.contains('active');
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
    }
  };

  tablistEl.addEventListener('keydown', (e) => {
    const list = tabs();
    const i = list.indexOf(document.activeElement);
    if (i === -1) return;
    const next = {
      ArrowRight: list[(i + 1) % list.length],
      ArrowLeft: list[(i - 1 + list.length) % list.length],
      Home: list[0],
      End: list[list.length - 1]
    }[e.key];
    if (!next) return;
    e.preventDefault();
    activate(next);
    next.focus();
  });

  new MutationObserver(sync).observe(tablistEl, { subtree: true, attributes: true, attributeFilter: ['class'] });
  sync();
}
