const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(a, b) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const toRad = deg => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h = sinDLat * sinDLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLon * sinDLon;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function buildCentroidIndex(records, idField) {
  return records.map(record => ({
    id: record[idField],
    lon: record.lon,
    lat: record.lat
  }));
}

// Centroide approssimato (media dei vertici dell'anello esterno): sufficiente per poligoni piccoli come edifici.
export function polygonCentroid(geometry) {
  const rings = geometry.type === 'MultiPolygon'
    ? geometry.coordinates.map(poly => poly[0])
    : [geometry.coordinates[0]];

  let sumLon = 0, sumLat = 0, count = 0;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      sumLon += lon;
      sumLat += lat;
      count++;
    }
  }
  return [sumLon / count, sumLat / count];
}

export function filterWithinRadius(centroidIndex, center, radiusMeters) {
  const result = [];
  for (const entry of centroidIndex) {
    const distance = haversineDistanceMeters(center, [entry.lon, entry.lat]);
    if (distance <= radiusMeters) {
      result.push(entry.id);
    }
  }
  return result;
}

// Point-in-polygon (ray casting) su coordinate lon/lat: l'errore planare è trascurabile alla scala di una città.
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Area in m² (formula di Gauss su proiezione equirettangolare centrata sul poligono).
export function ringAreaSqMeters(ring) {
  const lat0 = (ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length) * Math.PI / 180;
  const kx = (Math.PI / 180) * EARTH_RADIUS_METERS * Math.cos(lat0);
  const ky = (Math.PI / 180) * EARTH_RADIUS_METERS;
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
  }
  return Math.abs(area) / 2;
}

// Una "zona" di analisi è un cerchio { type: 'circle', center, radiusMeters }
// oppure un poligono { type: 'polygon', ring } (anello aperto, senza ripetere il primo vertice).
export function zoneBBox(zone) {
  if (zone.type === 'circle') {
    const [lon, lat] = zone.center;
    const dLat = (zone.radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);
    const dLon = dLat / Math.cos((lat * Math.PI) / 180);
    return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
  }
  const lons = zone.ring.map(p => p[0]);
  const lats = zone.ring.map(p => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function zoneContains(zone, point) {
  return zone.type === 'circle'
    ? haversineDistanceMeters(zone.center, point) <= zone.radiusMeters
    : pointInRing(point, zone.ring);
}

// Punto rappresentativo della zona (per info-punto, coordinate, posizionamento zona B).
export function zoneCenter(zone) {
  if (zone.type === 'circle') return zone.center;
  const [minLon, minLat, maxLon, maxLat] = zoneBBox(zone);
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

export function filterWithinZone(centroidIndex, zone) {
  if (zone.type === 'circle') return filterWithinRadius(centroidIndex, zone.center, zone.radiusMeters);
  const [minLon, minLat, maxLon, maxLat] = zoneBBox(zone);
  const result = [];
  for (const entry of centroidIndex) {
    if (entry.lon < minLon || entry.lon > maxLon || entry.lat < minLat || entry.lat > maxLat) continue;
    if (pointInRing([entry.lon, entry.lat], zone.ring)) result.push(entry.id);
  }
  return result;
}
