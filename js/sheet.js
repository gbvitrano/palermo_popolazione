// Pannelli laterali come bottom sheet a 3 altezze su mobile (≤ 640px).
// L'altezza (non una traslazione) cambia tra i livelli: così il contenuto resta
// scorrevole fino in fondo a ogni livello. Chiusura = classe `collapsed`, come
// su desktop; qui si gestisce solo il livello dello sheet aperto.

export const SNAPS = ['peek', 'half', 'full'];
const DEFAULT_SNAP = 'half';
const CLOSE_THRESHOLD_PX = 60; // trascinando più giù di così sotto 'peek' lo sheet si chiude
const FLICK_VELOCITY = 0.5;    // px/ms: oltre questa velocità si va al livello successivo

// Altezze in px dei livelli (devono corrispondere a css/style.css, [data-snap]).
function snapHeights() {
  const vh = window.innerHeight;
  return { peek: 132, half: Math.round(vh * 0.55), full: Math.round(vh * 0.92) };
}

export function getSnap(panelEl) {
  return panelEl.dataset.snap || DEFAULT_SNAP;
}

export function setSnap(panelEl, snap) {
  panelEl.dataset.snap = snap;
  const grabber = panelEl.querySelector('.sheet-grabber');
  if (grabber) grabber.setAttribute('aria-valuenow', String(SNAPS.indexOf(snap) + 1));
}

export function resetSnap(panelEl) {
  setSnap(panelEl, DEFAULT_SNAP);
}

// Altezza visibile di riferimento per il padding della mappa: a pieno schermo
// la mappa è comunque coperta, quindi il centro visivo resta quello di 'half'.
export function sheetInset(panelEl) {
  const h = snapHeights();
  return getSnap(panelEl) === 'peek' ? h.peek : h.half;
}

// onSnap(snap) dopo ogni cambio di livello; onClose() se trascinato sotto 'peek'.
export function setupSheet(panelEl, { isActive, onSnap, onClose }) {
  const grabber = document.createElement('button');
  grabber.type = 'button';
  grabber.className = 'sheet-grabber';
  grabber.setAttribute('aria-label', 'Altezza del pannello: tocca per cambiarla, trascina per ridimensionare');
  grabber.setAttribute('role', 'slider');
  grabber.setAttribute('aria-valuemin', '1');
  grabber.setAttribute('aria-valuemax', String(SNAPS.length));
  grabber.setAttribute('aria-valuetext', 'anteprima, metà, schermo intero');
  const bar = document.createElement('span');
  bar.className = 'sheet-grabber-bar';
  bar.setAttribute('aria-hidden', 'true');
  grabber.appendChild(bar);
  panelEl.insertBefore(grabber, panelEl.querySelector('.panel-scroll'));
  setSnap(panelEl, getSnap(panelEl));

  const goTo = (snap) => {
    setSnap(panelEl, snap);
    onSnap(snap);
  };

  let drag = null; // { startY, startH, lastY, lastT, velocity, moved }
  let suppressClick = false; // il 'click' che il browser emette dopo un trascinamento

  grabber.addEventListener('pointerdown', (e) => {
    if (!isActive()) return;
    suppressClick = false;
    drag = {
      startY: e.clientY,
      startH: panelEl.getBoundingClientRect().height,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      moved: false
    };
    grabber.setPointerCapture(e.pointerId);
    panelEl.classList.add('sheet-dragging');
  });

  grabber.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 4) drag.moved = true;
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (e.clientY - drag.lastY) / dt; // > 0 verso il basso
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    const max = snapHeights().full;
    panelEl.style.height = `${Math.max(0, Math.min(max, drag.startH - dy))}px`;
  });

  const endDrag = () => {
    if (!drag) return;
    const { moved, velocity } = drag;
    const height = panelEl.getBoundingClientRect().height;
    drag = null;
    panelEl.classList.remove('sheet-dragging');
    panelEl.style.height = '';
    if (!moved) return; // tap: gestito da 'click'
    suppressClick = true;

    const h = snapHeights();
    if (height < h.peek - CLOSE_THRESHOLD_PX || (velocity > FLICK_VELOCITY && getSnap(panelEl) === 'peek')) {
      onClose();
      return;
    }
    let target;
    if (Math.abs(velocity) > FLICK_VELOCITY) {
      // gesto rapido: livello successivo nella direzione del gesto, partendo dall'altezza attuale
      const ordered = SNAPS.map(s => [s, h[s]]);
      target = velocity < 0
        ? (ordered.find(([, v]) => v > height) || ordered[ordered.length - 1])[0]
        : ([...ordered].reverse().find(([, v]) => v < height) || ordered[0])[0];
    } else {
      target = SNAPS.reduce((best, s) => (Math.abs(h[s] - height) < Math.abs(h[best] - height) ? s : best));
    }
    goTo(target);
  };
  grabber.addEventListener('pointerup', endDrag);
  grabber.addEventListener('pointercancel', endDrag);

  // Tap o tastiera: livello successivo (peek → half → full → peek)
  grabber.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }
    if (!isActive()) return;
    const i = SNAPS.indexOf(getSnap(panelEl));
    goTo(SNAPS[(i + 1) % SNAPS.length]);
  });

  grabber.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    const i = SNAPS.indexOf(getSnap(panelEl));
    if (e.key === 'ArrowUp' && i < SNAPS.length - 1) { e.preventDefault(); goTo(SNAPS[i + 1]); }
    if (e.key === 'ArrowDown' && i > 0) { e.preventDefault(); goTo(SNAPS[i - 1]); }
  });
}
