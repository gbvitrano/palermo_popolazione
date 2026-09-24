const EARTH_RADIUS_METERS = 6371000;

function circlePolygon(center, radiusMeters, points = 64) {
  const [lon, lat] = center;
  const coords = [];
  const latRad = (lat * Math.PI) / 180;

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = (radiusMeters * Math.cos(angle)) / (EARTH_RADIUS_METERS * Math.cos(latRad));
    const dy = (radiusMeters * Math.sin(angle)) / EARTH_RADIUS_METERS;
    coords.push([lon + (dx * 180) / Math.PI, lat + (dy * 180) / Math.PI]);
  }

  return { type: 'Polygon', coordinates: [coords] };
}

function haversineFromMap(a, b) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

// Punto a distanza radiusMeters dal centro, in direzione nord (bearing 0).
function northPoint(center, radiusMeters) {
  const [lon, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const dLat = (radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);
  return [lon, lat + dLat];
}

function formatRadius(radiusMeters) {
  return radiusMeters >= 1000
    ? `${(radiusMeters / 1000).toFixed(2)} km`
    : `${Math.round(radiusMeters)} m`;
}

export class ProbeController {
  constructor(map, onCircleChange, options = {}) {
    this.map = map;
    this.onCircleChange = onCircleChange;
    this.label = options.label || '';
    // id di source/layer univoci per istanza, per far convivere più cerchi sulla stessa mappa.
    this.sourceId = this.label ? `probe-circle-${this.label.toLowerCase()}` : 'probe-circle';
    // false per un cerchio creato solo in modo programmatico (es. cerchio B), mai da click diretto.
    this.clickToCreate = options.clickToCreate !== false;
    this.center = null;
    this.radiusMeters = 250; // diametro default 500 m
    this.throttleTimer = null;
    this.centerMarker = null;
    this.edgeMarker = null;
    this.edgeLabel = null;

    this._addLayers();
    // map.setStyle() (es. cambio tema chiaro/scuro) resetta lo style e cancella
    // le sorgenti/layer custom aggiunti a runtime: vanno ricreati ad ogni reload.
    map.on('style.load', () => this._addLayers());

    map.on('click', (e) => this._handleMapClick(e));
  }

  _addLayers() {
    if (this.map.getSource(this.sourceId)) return;

    const data = this.center
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: circlePolygon(this.center, this.radiusMeters) }] }
      : { type: 'FeatureCollection', features: [] };

    this.map.addSource(this.sourceId, { type: 'geojson', data });
    this.map.addLayer({
      id: `${this.sourceId}-fill`,
      type: 'fill',
      source: this.sourceId,
      paint: { 'fill-color': '#00e5ff', 'fill-opacity': 0.08 }
    });
    // Alone scuro sotto il bordo ciano: resta leggibile su qualsiasi sfondo/layer.
    this.map.addLayer({
      id: `${this.sourceId}-halo`,
      type: 'line',
      source: this.sourceId,
      paint: { 'line-color': '#0a1020', 'line-width': 3 }
    });
    this.map.addLayer({
      id: `${this.sourceId}-border`,
      type: 'line',
      source: this.sourceId,
      paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 1.5] }
    });
  }

  _handleMapClick(e) {
    if (!this.clickToCreate || this.center) return; // click crea il cerchio solo se non esiste già
    this.place([e.lngLat.lng, e.lngLat.lat], this.radiusMeters);
  }

  // Crea il cerchio in modo programmatico (non da click), es. il cerchio B in modalità confronto.
  place(center, radiusMeters) {
    this.center = center;
    this.radiusMeters = radiusMeters;
    this._createHandles();
    this._redraw();
    this._emitChange();
  }

  _createHandles() {
    const centerEl = document.createElement('div');
    centerEl.className = 'probe-handle probe-handle-center';
    centerEl.title = 'Trascina per spostare il cerchio';
    if (this.label) {
      centerEl.classList.add('probe-handle-labeled');
      centerEl.textContent = this.label;
    }

    this.centerMarker = new maplibregl.Marker({ element: centerEl, draggable: true })
      .setLngLat(this.center)
      .addTo(this.map);

    this.centerMarker.on('drag', () => {
      const lngLat = this.centerMarker.getLngLat();
      this.center = [lngLat.lng, lngLat.lat];
      this._repositionEdgeMarker();
      this._redraw();
      this._throttledEmit();
    });
    this.centerMarker.on('dragend', () => this._emitChange());

    const edgeEl = document.createElement('div');
    edgeEl.className = 'probe-handle probe-handle-edge';
    edgeEl.title = 'Trascina per cambiare il raggio';
    this.edgeLabel = document.createElement('span');
    this.edgeLabel.className = 'probe-radius-label';
    edgeEl.appendChild(this.edgeLabel);

    this.edgeMarker = new maplibregl.Marker({ element: edgeEl, draggable: true })
      .setLngLat(northPoint(this.center, this.radiusMeters))
      .addTo(this.map);

    this.edgeMarker.on('drag', () => {
      const lngLat = this.edgeMarker.getLngLat();
      const distance = haversineFromMap(this.center, [lngLat.lng, lngLat.lat]);
      this.radiusMeters = Math.max(50, distance);
      this._updateLabel();
      this._redraw();
      this._throttledEmit();
    });
    this.edgeMarker.on('dragend', () => {
      this._repositionEdgeMarker();
      this._emitChange();
    });

    this._updateLabel();
  }

  _repositionEdgeMarker() {
    this.edgeMarker.setLngLat(northPoint(this.center, this.radiusMeters));
  }

  _updateLabel() {
    this.edgeLabel.textContent = formatRadius(this.radiusMeters);
  }

  _throttledEmit() {
    if (this.throttleTimer) return;
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      this._emitChange();
    }, 60);
  }

  _emitChange() {
    this.onCircleChange(this.center, this.radiusMeters);
  }

  _redraw() {
    const feature = { type: 'Feature', properties: {}, geometry: circlePolygon(this.center, this.radiusMeters) };
    this.map.getSource(this.sourceId).setData({ type: 'FeatureCollection', features: [feature] });
  }

  clear() {
    this.center = null;
    if (this.centerMarker) { this.centerMarker.remove(); this.centerMarker = null; }
    if (this.edgeMarker) { this.edgeMarker.remove(); this.edgeMarker = null; }
    this.map.getSource(this.sourceId).setData({ type: 'FeatureCollection', features: [] });
  }
}
