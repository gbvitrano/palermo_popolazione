import { ringAreaSqMeters, zoneCenter } from './geometry.js';

const CLOSE_TOLERANCE_PX = 10; // click entro questa distanza dal primo vertice chiude il poligono
const DUPLICATE_TOLERANCE_PX = 3; // vertici così vicini (es. i due click di un doppio click) sono lo stesso punto

const EMPTY = { type: 'FeatureCollection', features: [] };

function formatArea(sqMeters) {
  return sqMeters >= 1e6
    ? `${(sqMeters / 1e6).toFixed(2)} km²`
    : `${(sqMeters / 1e4).toFixed(1)} ha`;
}

function polygonFeature(ring) {
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } };
}

// Zona di analisi poligonale disegnata a mano: click per aggiungere vertici, doppio click
// (o click sul primo vertice) per chiudere, Esc per annullare. A poligono chiuso i vertici
// restano trascinabili e la maniglia centrale sposta l'intero poligono.
export class PolygonController {
  constructor(map, onPolygonChange, options = {}) {
    this.map = map;
    this.onPolygonChange = onPolygonChange;
    this.onDrawCancel = options.onDrawCancel || (() => {});
    this.label = options.label || '';
    this.sourceId = `probe-polygon-${this.label.toLowerCase() || 'a'}`;
    this.draftSourceId = `${this.sourceId}-draft`;
    this.ring = null;      // poligono chiuso (anello aperto, senza ripetere il primo vertice)
    this.draft = null;     // vertici in fase di disegno
    this.cursor = null;    // posizione del mouse durante il disegno (segmento "elastico")
    this.vertexMarkers = [];
    this.centerMarker = null;
    this.areaLabel = null;
    this.throttleTimer = null;

    this._onClick = (e) => this._handleDrawClick(e);
    this._onDblClick = (e) => { e.preventDefault(); this._finishDrawing(); };
    this._onMouseMove = (e) => { this.cursor = [e.lngLat.lng, e.lngLat.lat]; this._redrawDraft(); };
    this._onKeyDown = (e) => { if (e.key === 'Escape') this.cancelDrawing(); };

    this._addLayers();
    map.on('style.load', () => this._addLayers());
  }

  get isDrawing() {
    return this.draft !== null;
  }

  _addLayers() {
    if (this.map.getSource(this.sourceId)) return;

    this.map.addSource(this.sourceId, {
      type: 'geojson',
      data: this.ring ? { type: 'FeatureCollection', features: [polygonFeature(this.ring)] } : EMPTY
    });
    // Stesso stile del cerchio (probe.js): riempimento tenue, alone scuro, bordo bianco tratteggiato.
    this.map.addLayer({ id: `${this.sourceId}-fill`, type: 'fill', source: this.sourceId, paint: { 'fill-color': '#00e5ff', 'fill-opacity': 0.08 } });
    this.map.addLayer({ id: `${this.sourceId}-halo`, type: 'line', source: this.sourceId, paint: { 'line-color': '#0a1020', 'line-width': 3 } });
    this.map.addLayer({ id: `${this.sourceId}-border`, type: 'line', source: this.sourceId, paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 1.5] } });

    this.map.addSource(this.draftSourceId, { type: 'geojson', data: EMPTY });
    this.map.addLayer({
      id: `${this.draftSourceId}-line`, type: 'line', source: this.draftSourceId,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 1.5] }
    });
    this.map.addLayer({
      id: `${this.draftSourceId}-vertex`, type: 'circle', source: this.draftSourceId,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 4, 'circle-color': '#e08a2b', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 }
    });
    this._redrawDraft();
  }

  startDrawing() {
    this.clear();
    this.draft = [];
    this.cursor = null;
    this.map.doubleClickZoom.disable();
    this.map.getCanvas().style.cursor = 'crosshair';
    this.map.on('click', this._onClick);
    this.map.on('dblclick', this._onDblClick);
    this.map.on('mousemove', this._onMouseMove);
    document.addEventListener('keydown', this._onKeyDown);
  }

  cancelDrawing() {
    if (!this.isDrawing) return;
    this._stopDrawing();
    this.onDrawCancel();
  }

  _stopDrawing() {
    this.draft = null;
    this.cursor = null;
    this.map.off('click', this._onClick);
    this.map.off('dblclick', this._onDblClick);
    this.map.off('mousemove', this._onMouseMove);
    document.removeEventListener('keydown', this._onKeyDown);
    this.map.getCanvas().style.cursor = '';
    // riabilitato dopo il ciclo corrente, così il dblclick di chiusura non produce anche uno zoom
    setTimeout(() => this.map.doubleClickZoom.enable(), 0);
    this._redrawDraft();
  }

  _pixelDistance(a, b) {
    const pa = this.map.project(a);
    const pb = this.map.project(b);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  }

  _handleDrawClick(e) {
    const point = [e.lngLat.lng, e.lngLat.lat];
    if (this.draft.length >= 3 && this._pixelDistance(point, this.draft[0]) <= CLOSE_TOLERANCE_PX) {
      this._finishDrawing();
      return;
    }
    const last = this.draft[this.draft.length - 1];
    if (last && this._pixelDistance(point, last) <= DUPLICATE_TOLERANCE_PX) return;
    this.draft.push(point);
    this._redrawDraft();
  }

  _finishDrawing() {
    if (!this.isDrawing) return;
    if (this.draft.length < 3) return; // servono almeno 3 vertici: si continua a disegnare
    const ring = this.draft;
    this._stopDrawing();
    this.place(ring);
  }

  _redrawDraft() {
    const source = this.map.getSource(this.draftSourceId);
    if (!source) return;
    if (!this.draft || this.draft.length === 0) {
      source.setData(EMPTY);
      return;
    }
    const line = this.cursor ? [...this.draft, this.cursor] : this.draft;
    const features = this.draft.map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }));
    if (line.length >= 2) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } });
    }
    source.setData({ type: 'FeatureCollection', features });
  }

  // Crea il poligono in modo programmatico (fine disegno, o copia traslata per la zona B).
  place(ring) {
    this._removeHandles();
    this.ring = ring.map(p => [...p]);
    this._createHandles();
    this._redraw();
    this._emitChange();
  }

  _createHandles() {
    this.vertexMarkers = this.ring.map((vertex, i) => {
      const el = document.createElement('div');
      el.className = 'probe-handle probe-handle-vertex';
      el.title = 'Trascina per modificare il vertice';
      const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(vertex).addTo(this.map);
      marker.on('drag', () => {
        const { lng, lat } = marker.getLngLat();
        this.ring[i] = [lng, lat];
        this._repositionCenterMarker();
        this._redraw();
        this._throttledEmit();
      });
      marker.on('dragend', () => this._emitChange());
      return marker;
    });

    const centerEl = document.createElement('div');
    centerEl.className = 'probe-handle probe-handle-center';
    centerEl.title = 'Trascina per spostare il poligono';
    if (this.label) {
      centerEl.classList.add('probe-handle-labeled');
      centerEl.textContent = this.label;
    }
    this.areaLabel = document.createElement('span');
    this.areaLabel.className = 'probe-radius-label';
    centerEl.appendChild(this.areaLabel);

    this.centerMarker = new maplibregl.Marker({ element: centerEl, draggable: true })
      .setLngLat(zoneCenter({ type: 'polygon', ring: this.ring }))
      .addTo(this.map);

    let dragStart = null;
    this.centerMarker.on('dragstart', () => {
      const { lng, lat } = this.centerMarker.getLngLat();
      dragStart = { origin: [lng, lat], ring: this.ring.map(p => [...p]) };
    });
    this.centerMarker.on('drag', () => {
      const { lng, lat } = this.centerMarker.getLngLat();
      const dLon = lng - dragStart.origin[0];
      const dLat = lat - dragStart.origin[1];
      this.ring = dragStart.ring.map(([x, y]) => [x + dLon, y + dLat]);
      this.vertexMarkers.forEach((m, i) => m.setLngLat(this.ring[i]));
      this._redraw();
      this._throttledEmit();
    });
    this.centerMarker.on('dragend', () => this._emitChange());

    this._updateLabel();
  }

  _repositionCenterMarker() {
    this.centerMarker.setLngLat(zoneCenter({ type: 'polygon', ring: this.ring }));
  }

  _updateLabel() {
    this.areaLabel.textContent = formatArea(ringAreaSqMeters(this.ring));
  }

  _throttledEmit() {
    if (this.throttleTimer) return;
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      this._emitChange();
    }, 60);
  }

  _emitChange() {
    this.onPolygonChange(this.ring);
  }

  _redraw() {
    this._updateLabel();
    this.map.getSource(this.sourceId).setData({ type: 'FeatureCollection', features: [polygonFeature(this.ring)] });
  }

  _removeHandles() {
    this.vertexMarkers.forEach(m => m.remove());
    this.vertexMarkers = [];
    if (this.centerMarker) { this.centerMarker.remove(); this.centerMarker = null; }
  }

  // Non emette (come ProbeController.clear): chi chiama aggiorna lo stato esplicitamente.
  clear() {
    if (this.isDrawing) this._stopDrawing();
    this.ring = null;
    this._removeHandles();
    this.map.getSource(this.sourceId)?.setData(EMPTY);
  }
}
