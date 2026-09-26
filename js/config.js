export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
export const MAP_STYLE_URL_DARK = 'https://tiles.openfreemap.org/styles/dark';
export const PMTILES_URL = 'data/geo_sezioni_2021.pmtiles';
export const CONFINI_PMTILES_URL = 'data/confini_amministrativi.pmtiles';
export const EDIFICATO_PMTILES_URL = 'data/edificato.pmtiles';
// dot density a due scale: 1 punto = 10 residenti sotto PUNTI_ZOOM_SOGLIA, 1 residente da lì in su
export const PUNTI_10_PMTILES_URL = 'data/punti_pop_10.pmtiles';
export const PUNTI_1_PMTILES_URL = 'data/punti_pop_1.pmtiles';
export const PUNTI_ZOOM_SOGLIA = 14;
export const EDIFICI_ZONA_JSON_URL = 'data/edifici_zona.json';
// Confini amministrativi come poligoni WGS84 pronti da usare come zona di analisi
// (non le tile vettoriali di confini_amministrativi.pmtiles, usate solo per il disegno
// delle linee): vedi scripts/build_confini_zone.py.
export const CONFINI_ZONE_JSON_URL = 'data/confini_zone.json';
export const INDICATORI_JSON_URL = 'data/sezioni_indicatori.json';
export const ELEVAZIONE_TILES_URL = 'data/elevazione/{z}/{x}/{y}.png';
export const TERRAIN_DEM_TILES_URL = 'data/terrain/{z}/{x}/{y}.png';
export const GRIGLIA_TILES_URL = 'data/griglia_pbf/{z}/{x}/{y}.pbf';
