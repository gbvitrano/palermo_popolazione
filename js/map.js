import { MAP_STYLE_URL, MAP_STYLE_URL_DARK, PMTILES_URL, CONFINI_PMTILES_URL, EDIFICATO_PMTILES_URL, PUNTI_10_PMTILES_URL, PUNTI_1_PMTILES_URL, PUNTI_ZOOM_SOGLIA, ELEVAZIONE_TILES_URL, TERRAIN_DEM_TILES_URL } from './config.js';
import { polygonCentroid, zoneBBox, zoneContains } from './geometry.js';
import { densityStops, EDIFICATO_NEUTRAL, HILLSHADE_COLORS, sezioniColors, CONFINI_LEVEL_KEYS, confiniStyle, puntiColors } from './palette.js';

const MAP_HOME = { center: [13.3526, 38.1364], zoom: 11, pitch: 0, bearing: 0 };
const MAP_HOME_3D = { center: [13.3453, 38.13658], zoom: 12.22, pitch: 68, bearing: -90.4 };
const SATELLITE_TILES = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];

// mode = 'none' | 'popolazione' | 'edifici' | 'dasimetrica'. Gli edifici dentro uno spot
// mostrano sempre la densità di popolazione, qualunque sia la modalità attiva.
const DENSITY_PROPS = { popolazione: 'dens_pop_ha', edifici: 'COP_EDIF_PCT', dasimetrica: 'dens_das' };

function densityExpression(mode, isDark) {
  const ramp = ['interpolate', ['linear'], ['coalesce', ['get', DENSITY_PROPS[mode]], 0], ...densityStops(mode, isDark).flat()];
  // dasimetrica: gli edifici a cui non è stato assegnato nessun residente
  // (non residenziali, tettoie) restano neutri invece di prendere il primo colore della rampa
  if (mode !== 'dasimetrica') return ramp;
  return ['case', ['>', ['coalesce', ['get', 'pop_stim'], 0], 0], ramp, EDIFICATO_NEUTRAL];
}

function buildEdificatoColorExpression(mode, isDark) {
  return [
    'case',
    ['boolean', ['feature-state', 'inSpot'], false],
    densityExpression('popolazione', isDark),
    mode === 'none' ? EDIFICATO_NEUTRAL : densityExpression(mode, isDark)
  ];
}

// [id sorgente/layer, url, intervallo di zoom, raggio]
const PUNTI_LAYERS = [
  ['punti-10', PUNTI_10_PMTILES_URL, { maxzoom: PUNTI_ZOOM_SOGLIA }, ['interpolate', ['linear'], ['zoom'], 11, 0.6, 13, 1.4]],
  ['punti-1', PUNTI_1_PMTILES_URL, { minzoom: PUNTI_ZOOM_SOGLIA }, ['interpolate', ['linear'], ['zoom'], 14, 0.7, 16, 1.6, 18, 3]]
];

export class MapModule {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.densityMode = 'none';
    this.sezioniVisible = false;
    this.confiniActiveLevels = new Set();
    this.spotFeatureIds = { A: new Set(), B: new Set() };
    // ultima zona per spot: serve a ri-applicare l'evidenziazione dopo un reload dello style
    this.spotZones = { A: null, B: null };
    this.confiniTooltip = null;
    this.satelliteOn = false;
    this.baseStyleLayerIds = [];
    this.is3D = false;
    this.elevazioneVisible = false;
    this.puntiVisible = false;
    this.isDarkTheme = false;
  }

  init(isDark = false) {
    this.isDarkTheme = isDark;
    return new Promise((resolve, reject) => {
      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);

      this.map = new maplibregl.Map({
        container: this.containerId,
        style: isDark ? MAP_STYLE_URL_DARK : MAP_STYLE_URL,
        hash: true,
        center: MAP_HOME.center,
        zoom: MAP_HOME.zoom,
        pitch: MAP_HOME.pitch,
        bearing: MAP_HOME.bearing,
        maxPitch: 70
      });

      this.map.on('load', () => {
        this._addCustomLayers();
        this.map.on('mousemove', (e) => this._updateConfiniTooltip(e));
        this.map.on('mouseleave', () => this._hideConfiniTooltip());
        resolve(this.map);
      });

      this.map.on('error', (e) => reject(e.error || e));
    });
  }

  _addCustomLayers() {
        this.baseStyleLayerIds = this.map.getStyle().layers.map((l) => l.id);

        this.map.addSource('satellite-base', {
          type: 'raster',
          tiles: SATELLITE_TILES,
          tileSize: 256,
          attribution: 'Esri World Imagery'
        });
        this.map.addLayer({
          id: 'satellite-base-layer',
          type: 'raster',
          source: 'satellite-base',
          layout: { visibility: 'none' }
        });

        this.map.addSource('terrain-dem', {
          type: 'raster-dem',
          tiles: [`${TERRAIN_DEM_TILES_URL}`],
          encoding: 'terrarium',
          tileSize: 256,
          minzoom: 8,
          maxzoom: 15
        });

        this.map.addLayer({
          id: 'hillshade-layer',
          type: 'hillshade',
          source: 'terrain-dem',
          paint: {
            'hillshade-exaggeration': 0.35,
            'hillshade-shadow-color': HILLSHADE_COLORS.shadow,
            'hillshade-highlight-color': HILLSHADE_COLORS.highlight,
            'hillshade-accent-color': HILLSHADE_COLORS.accent,
            'hillshade-illumination-direction': 180,
            'hillshade-illumination-anchor': 'map'
          }
        });

        this.map.setLayoutProperty('hillshade-layer', 'visibility', 'none');
        this._setRotationEnabled(false);

        this.map.addSource('elevazione', {
          type: 'raster',
          tiles: [`${ELEVAZIONE_TILES_URL}`],
          tileSize: 256,
          minzoom: 8,
          maxzoom: 15,
          scheme: 'tms'
        });

        this.map.addLayer({
          id: 'elevazione-raster',
          type: 'raster',
          source: 'elevazione',
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': 0.7 }
        });

        this.map.addSource('sezioni', { type: 'vector', url: `pmtiles://${PMTILES_URL}` });

        this.map.addLayer({
          id: 'sezioni-fill',
          type: 'fill',
          source: 'sezioni',
          'source-layer': 'sezioni',
          layout: { visibility: 'none' },
          paint: { 'fill-color': sezioniColors(this.isDarkTheme).fill, 'fill-opacity': 0.15 }
        });

        this.map.addLayer({
          id: 'sezioni-border',
          type: 'line',
          source: 'sezioni',
          'source-layer': 'sezioni',
          layout: { visibility: 'none' },
          paint: { 'line-color': sezioniColors(this.isDarkTheme).border, 'line-width': 0.5 }
        });

        this.map.addSource('edificato', { type: 'vector', url: `pmtiles://${EDIFICATO_PMTILES_URL}` });

        this.map.addLayer({
          id: 'edificato-fill',
          type: 'fill-extrusion',
          source: 'edificato',
          'source-layer': 'edificato',
          paint: {
            'fill-extrusion-color': buildEdificatoColorExpression('none', this.isDarkTheme),
            'fill-extrusion-height': ['coalesce', ['get', 'altezza'], 0],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.85
          }
        }, 'sezioni-border');

        const colors = puntiColors(this.isDarkTheme);
        for (const [id, url, zoomRange, radius] of PUNTI_LAYERS) {
          this.map.addSource(id, { type: 'vector', url: `pmtiles://${url}` });
          this.map.addLayer({
            id,
            type: 'circle',
            source: id,
            'source-layer': 'punti',
            ...zoomRange,
            // stranieri sopra: sono pochi e sparirebbero sotto gli italiani
            layout: { visibility: 'none', 'circle-sort-key': ['get', 'straniero'] },
            paint: {
              'circle-color': ['case', ['==', ['get', 'straniero'], 1], colors.stranieri, colors.italiani],
              'circle-radius': radius,
              'circle-opacity': 0.85,
              'circle-pitch-alignment': 'map'
            }
          });
        }

        this.map.addSource('confini', { type: 'vector', url: `pmtiles://${CONFINI_PMTILES_URL}` });
        // fill invisibile sempre attivo: serve solo per queryRenderedFeatures (Quartiere/UPL/Circoscrizione dello spot)
        this.map.addLayer({
          id: 'confini-upl-fill',
          type: 'fill',
          source: 'confini',
          'source-layer': 'upl',
          layout: { visibility: 'visible' },
          paint: { 'fill-opacity': 0 }
        });
        for (const level of CONFINI_LEVEL_KEYS) {
          const style = confiniStyle(level, this.isDarkTheme);
          const paint = { 'line-color': style.color, 'line-width': style.width };
          if (style.dash) paint['line-dasharray'] = style.dash;
          this.map.addLayer({
            id: `confini-${level}`,
            type: 'line',
            source: 'confini',
            'source-layer': level,
            layout: { visibility: 'none' },
            paint
          });
        }

  }

  setBaseTheme(isDark) {
    if (this.isDarkTheme === isDark) return;
    this.isDarkTheme = isDark;
    // diff:false forza un reload completo dello style: gli stili chiaro/scuro sono
    // sorgenti diverse e il diffing di default di MapLibre a volte non riemette
    // 'style.load', lasciando le sorgenti/layer custom non ricreati.
    this.map.setStyle(isDark ? MAP_STYLE_URL_DARK : MAP_STYLE_URL, { diff: false });
    this.map.once('style.load', () => {
      this._addCustomLayers();
      this._restoreLayerState();
      this._restoreSpotHighlight();
    });
  }

  // Il reload dello style ricrea la sorgente 'edificato' e azzera i feature-state 'inSpot'.
  // queryRenderedFeatures restituisce feature solo a tile caricate e renderizzate,
  // quindi si attende il primo 'idle' prima di ricalcolare gli spot.
  _restoreSpotHighlight() {
    this.spotFeatureIds = { A: new Set(), B: new Set() };
    if (!this.spotZones.A && !this.spotZones.B) return;
    this.map.once('idle', () => {
      for (const key of ['A', 'B']) {
        if (this.spotZones[key]) this.updateEdificatoSpot(key, this.spotZones[key]);
      }
    });
  }

  _restoreLayerState() {
    const baseVisibility = this.satelliteOn ? 'none' : 'visible';
    for (const id of this.baseStyleLayerIds) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', baseVisibility);
    }
    this.map.setLayoutProperty('satellite-base-layer', 'visibility', this.satelliteOn ? 'visible' : 'none');

    this.setDensityMode(this.densityMode);
    this.map.setLayoutProperty('sezioni-border', 'visibility', this.sezioniVisible ? 'visible' : 'none');

    for (const level of CONFINI_LEVEL_KEYS) {
      this.map.setLayoutProperty(`confini-${level}`, 'visibility', this.confiniActiveLevels.has(level) ? 'visible' : 'none');
    }

    this.map.setLayoutProperty('elevazione-raster', 'visibility', this.elevazioneVisible ? 'visible' : 'none');
    this._applyPuntiVisibility();

    this.map.setTerrain(this.is3D ? { source: 'terrain-dem', exaggeration: 1.5 } : null);
    this.map.setLayoutProperty('hillshade-layer', 'visibility', this.is3D ? 'visible' : 'none');
    this._setRotationEnabled(this.is3D);
  }

  getMap() {
    return this.map;
  }

  // Area della mappa coperta dai pannelli: il centro visivo (flyTo, zone) si sposta
  // nella parte libera. Su mobile i pannelli sono in basso, quindi conta `bottom`.
  setPadding({ left = 0, right = 0, bottom = 0 }) {
    const p = this._padding || {};
    if (p.left === left && p.right === right && p.bottom === bottom) return;
    this._padding = { left, right, bottom };
    this.map.easeTo({ padding: { left, right, bottom, top: 0 }, duration: 250 });
  }


  setDensityMode(mode) {
    this.densityMode = mode;
    this.map.setPaintProperty('edificato-fill', 'fill-extrusion-color', buildEdificatoColorExpression(mode, this.isDarkTheme));
    this.map.setLayoutProperty('sezioni-fill', 'visibility', mode === 'none' ? 'visible' : 'none');
  }

  toggleSezioni() {
    this.sezioniVisible = !this.sezioniVisible;
    const visibility = this.sezioniVisible ? 'visible' : 'none';
    this.map.setLayoutProperty('sezioni-border', 'visibility', visibility);
  }

  // key = 'A' | 'B': ogni cerchio tiene il proprio set di feature evidenziate sulla
  // stessa sorgente 'edificato', così i due spot convivono senza cancellarsi a vicenda.
  // zone: { type: 'circle', center, radiusMeters } | { type: 'polygon', ring } | null
  updateEdificatoSpot(key, zone) {
    const ownSet = this.spotFeatureIds[key];
    const otherSet = this.spotFeatureIds[key === 'A' ? 'B' : 'A'];
    for (const id of ownSet) {
      if (!otherSet.has(id)) {
        this.map.setFeatureState({ source: 'edificato', sourceLayer: 'edificato', id }, { inSpot: false });
      }
    }
    this.spotFeatureIds[key] = new Set();
    this.spotZones[key] = zone;
    if (!zone) return;

    // bbox in pixel attorno alla zona, poi test puntuale sul centroide di ogni edificio
    const [minLon, minLat, maxLon, maxLat] = zoneBBox(zone);
    const sw = this.map.project([minLon, minLat]);
    const ne = this.map.project([maxLon, maxLat]);
    const bbox = [
      [Math.min(sw.x, ne.x), Math.min(sw.y, ne.y)],
      [Math.max(sw.x, ne.x), Math.max(sw.y, ne.y)]
    ];

    const features = this.map.queryRenderedFeatures(bbox, { layers: ['edificato-fill'] });
    const newSet = new Set();
    for (const feature of features) {
      if (feature.id == null) continue;
      if (zoneContains(zone, polygonCentroid(feature.geometry))) {
        this.map.setFeatureState({ source: 'edificato', sourceLayer: 'edificato', id: feature.id }, { inSpot: true });
        newSet.add(feature.id);
      }
    }
    this.spotFeatureIds[key] = newSet;
  }

  setElevazioneVisible(visible) {
    this.elevazioneVisible = visible;
    this.map.setLayoutProperty('elevazione-raster', 'visibility', visible ? 'visible' : 'none');
    if (visible) this.map.moveLayer('elevazione-raster');
  }

  setPuntiVisible(visible) {
    this.puntiVisible = visible;
    this._applyPuntiVisibility();
  }

  _applyPuntiVisibility() {
    for (const [id] of PUNTI_LAYERS) {
      this.map.setLayoutProperty(id, 'visibility', this.puntiVisible ? 'visible' : 'none');
    }
  }

  getLuogoAt(lngLat) {
    const point = this.map.project(lngLat);
    const props = this.map.queryRenderedFeatures(point, { layers: ['confini-upl-fill'] })[0]?.properties ?? null;
    return props;
  }

  setConfiniLevelVisible(level, visible) {
    if (visible) this.confiniActiveLevels.add(level);
    else this.confiniActiveLevels.delete(level);
    this.map.setLayoutProperty(`confini-${level}`, 'visibility', visible ? 'visible' : 'none');
    if (this.confiniActiveLevels.size === 0) this._hideConfiniTooltip();
  }

  _updateConfiniTooltip(e) {
    if (this.confiniActiveLevels.size === 0) {
      this._hideConfiniTooltip();
      return;
    }
    const props = this.map.queryRenderedFeatures(e.point, { layers: ['confini-upl-fill'] })[0]?.properties;
    const lines = [];
    if (props) {
      if (this.confiniActiveLevels.has('upl') && props.UPL) lines.push(`<strong>UPL</strong> ${props.UPL}`);
      if (this.confiniActiveLevels.has('quartieri') && props.Quartiere) lines.push(`<strong>Quartiere</strong> ${props.Quartiere}`);
      if (this.confiniActiveLevels.has('circoscrizioni') && props.Circoscrizione) lines.push(`<strong>Circoscrizione</strong> ${props.Circoscrizione}`);
    }
    if (lines.length === 0) {
      this._hideConfiniTooltip();
      return;
    }
    if (!this.confiniTooltip) {
      this.confiniTooltip = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'confini-tooltip',
        offset: 12
      });
    }
    this.confiniTooltip.setLngLat(e.lngLat).setHTML(lines.join('<br>')).addTo(this.map);
  }

  _hideConfiniTooltip() {
    if (this.confiniTooltip) {
      this.confiniTooltip.remove();
      this.confiniTooltip = null;
    }
  }

  flyHome() {
    this.map.flyTo({
      center: MAP_HOME.center,
      zoom: MAP_HOME.zoom,
      pitch: MAP_HOME.pitch,
      bearing: MAP_HOME.bearing,
      duration: 800
    });
    this.is3D = MAP_HOME.pitch > 0;
    this._setRotationEnabled(this.is3D);
    this.map.setTerrain(this.is3D ? { source: 'terrain-dem', exaggeration: 1.5 } : null);
    this.map.setLayoutProperty('hillshade-layer', 'visibility', this.is3D ? 'visible' : 'none');
  }

  _setRotationEnabled(enabled) {
    if (enabled) {
      this.map.dragRotate.enable();
      this.map.touchZoomRotate.enableRotation();
    } else {
      this.map.dragRotate.disable();
      this.map.touchZoomRotate.disableRotation();
    }
  }

  toggleSatellite() {
    this.satelliteOn = !this.satelliteOn;
    const baseVisibility = this.satelliteOn ? 'none' : 'visible';
    for (const id of this.baseStyleLayerIds) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', baseVisibility);
    }
    this.map.setLayoutProperty('satellite-base-layer', 'visibility', this.satelliteOn ? 'visible' : 'none');
    return this.satelliteOn;
  }

  // Riallinea a nord mantenendo inclinazione e centro (usata dalla bussola)
  resetNorth() {
    this.map.easeTo({ bearing: 0, duration: 500 });
  }

  toggle3D() {
    this.is3D = !this.is3D;
    if (this.is3D) {
      this.map.easeTo({ center: MAP_HOME_3D.center, zoom: MAP_HOME_3D.zoom, pitch: MAP_HOME_3D.pitch, bearing: MAP_HOME_3D.bearing, duration: 500 });
      this.map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
      this.map.setLayoutProperty('hillshade-layer', 'visibility', 'visible');
    } else {
      this.map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
      this.map.setTerrain(null);
      this.map.setLayoutProperty('hillshade-layer', 'visibility', 'none');
    }
    this._setRotationEnabled(this.is3D);
    return this.is3D;
  }
}
