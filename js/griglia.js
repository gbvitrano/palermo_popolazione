import Pbf from 'https://esm.sh/pbf@3.2.1';
import { VectorTile } from 'https://esm.sh/@mapbox/vector-tile@1.3.1';
import { GRIGLIA_TILES_URL } from './config.js';
import { haversineDistanceMeters } from './geometry.js';

// Zoom massimo del tileset: griglia DTM completa a passo 50m, senza il
// drop-as-needed di tippecanoe applicato ai livelli piu bassi (che rende
// la mappa attuale inaffidabile per una query puntuale a bassi zoom).
const GRIGLIA_ZOOM = 15;

const tileCache = new Map(); // "z/x/y" -> Promise<GeoJSON.Feature[]>

function lngLatToTile(lng, lat, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, z: zoom };
}

function loadTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const url = GRIGLIA_TILES_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  const promise = fetch(url)
    .then(res => (res.ok ? res.arrayBuffer() : null))
    .then(buf => {
      if (!buf) return [];
      const tile = new VectorTile(new Pbf(buf));
      const layer = tile.layers.griglia;
      if (!layer) return [];
      const features = [];
      for (let i = 0; i < layer.length; i++) {
        features.push(layer.feature(i).toGeoJSON(x, y, z));
      }
      return features;
    })
    .catch(() => []);
  tileCache.set(key, promise);
  return promise;
}

/**
 * Trova le proprieta del punto griglia DTM piu vicino al centro [lon, lat].
 * Cerca nella tile che lo contiene e nelle 8 adiacenti, cosi lo spot
 * funziona anche vicino a un bordo tile. Ritorna null se non c'e dato
 * disponibile in zona (fuori dal perimetro coperto dal DTM).
 */
export async function findNearestGrigliaPoint(center) {
  const { x, y, z } = lngLatToTile(center[0], center[1], GRIGLIA_ZOOM);
  const offsets = [
    [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];
  const tiles = await Promise.all(offsets.map(([dx, dy]) => loadTile(z, x + dx, y + dy)));

  let closest = null;
  let closestDist = Infinity;
  for (const features of tiles) {
    for (const feature of features) {
      const [lon, lat] = feature.geometry.coordinates;
      const d = haversineDistanceMeters(center, [lon, lat]);
      if (d < closestDist) {
        closestDist = d;
        closest = feature.properties;
      }
    }
  }
  return closest;
}
