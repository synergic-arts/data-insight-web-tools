export const DEMO_ROWS = [
  { id: 1, year: 2020, province: 'Cuenca', site: 'Valeria', category: 'romano', finds: 84, area_ha: 12.4, latitude: 39.792, longitude: -2.891, status: 'documentado' },
  { id: 2, year: 2021, province: 'Toledo', site: 'Vega Baja', category: 'visigodo', finds: 112, area_ha: 9.8, latitude: 39.854, longitude: -4.031, status: 'en estudio' },
  { id: 3, year: 2022, province: 'Huesca', site: 'Labitolosa', category: 'romano', finds: 67, area_ha: 7.1, latitude: 42.141, longitude: 0.154, status: 'documentado' },
  { id: 4, year: 2023, province: 'Jaén', site: 'Cástulo', category: 'ibero', finds: 138, area_ha: 18.2, latitude: 38.039, longitude: -3.631, status: 'prioritario' },
  { id: 5, year: 2024, province: 'Burgos', site: 'Clunia', category: 'romano', finds: 96, area_ha: 21.7, latitude: 41.805, longitude: -3.358, status: 'documentado' },
  { id: 6, year: 2020, province: 'Málaga', site: 'Acinipo', category: 'romano', finds: 58, area_ha: 5.4, latitude: 36.832, longitude: -5.235, status: 'en estudio' },
  { id: 7, year: 2021, province: 'Soria', site: 'Numancia', category: 'celtibero', finds: 121, area_ha: 13.6, latitude: 41.806, longitude: -2.445, status: 'prioritario' },
  { id: 8, year: 2022, province: 'Lugo', site: 'Santa Eulalia', category: 'medieval', finds: 42, area_ha: 3.9, latitude: 43.018, longitude: -7.568, status: 'documentado' },
  { id: 9, year: 2023, province: 'Zaragoza', site: 'Bilbilis', category: 'romano', finds: 103, area_ha: 11.2, latitude: 41.392, longitude: -1.613, status: 'documentado' },
  { id: 10, year: 2024, province: 'Almería', site: 'Los Millares', category: 'calcolitico', finds: 76, area_ha: 14.9, latitude: 37.173, longitude: -2.413, status: 'prioritario' },
  { id: 11, year: 2020, province: 'Cáceres', site: 'Cáparra', category: 'romano', finds: 51, area_ha: 6.3, latitude: 40.192, longitude: -6.098, status: 'en estudio' },
  { id: 12, year: 2021, province: 'Navarra', site: 'Andelos', category: 'romano', finds: 69, area_ha: 8.6, latitude: 42.564, longitude: -1.509, status: 'documentado' },
  { id: 13, year: 2022, province: 'Asturias', site: 'Coaña', category: 'castreño', finds: 35, area_ha: 4.2, latitude: 43.512, longitude: -6.745, status: 'documentado' },
  { id: 14, year: 2023, province: 'Valencia', site: 'Sagunto', category: 'iberorromano', finds: 117, area_ha: 16.5, latitude: 39.681, longitude: -0.278, status: 'prioritario' },
  { id: 15, year: 2024, province: 'Sevilla', site: 'Itálica', category: 'romano', finds: 144, area_ha: 20.1, latitude: 37.442, longitude: -6.045, status: 'documentado' },
  { id: 16, year: 2022, province: 'León', site: 'Lancia', category: 'astur', finds: 48, area_ha: 10.7, latitude: 42.548, longitude: -5.416, status: 'en estudio' }
];

export const state = {
  rows: [],
  filtered: [],
  columns: [],
  filters: {},
  search: '',
  datasetName: 'Muestra arqueológica local',
  sourceKind: 'synthetic',
  sourceDetail: 'Datos de demostración generados localmente; sustituibles por un archivo propio.',
  activeTab: 'overview',
  xField: 'province',
  yField: 'finds',
  chartType: 'bar',
  chartSort: 'original',
  chartTitle: 'Visualización principal',
  aggregation: 'sum',
  sortKey: '',
  sortDir: 'asc',
  tableLimit: 20,
  dashboard: { cards: [] }
};

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || String(value).trim() === '') return null;
  let normalized = String(value).trim().replace(/[\s\u00a0]/g, '');
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  else if (comma >= 0) normalized = normalized.replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function isMissing(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

export function format(value, digits = 1) {
  const number = toNumber(value);
  if (number === null) return '—';
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(number);
}

export function inferType(values) {
  const usable = values.filter(value => value !== null && value !== undefined && String(value).trim() !== '');
  if (!usable.length) return 'text';
  const numeric = usable.filter(value => toNumber(value) !== null).length / usable.length;
  if (numeric >= 0.92) return 'number';
  if (usable.every(value => /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/.test(String(value)))) return 'date';
  return 'text';
}

export function rebuildColumns() {
  const names = new Set();
  state.rows.forEach(row => Object.keys(row).forEach(key => names.add(key)));
  state.columns = [...names].map(name => ({ name, type: inferType(state.rows.map(row => row[name])) }));
  if (!state.xField || !state.columns.some(column => column.name === state.xField)) state.xField = state.columns.find(column => column.type === 'text')?.name || state.columns[0]?.name || '';
  if (!state.yField || !state.columns.some(column => column.name === state.yField) || /^(id|_row_id|latitude|longitude)$/i.test(state.yField)) state.yField = state.columns.find(column => column.type === 'number' && !/^(id|_row_id|latitude|longitude)$/i.test(column.name))?.name || state.columns.find(column => column.type === 'number')?.name || state.columns[0]?.name || '';
}

export function applyFilters() {
  const query = state.search.trim().toLowerCase();
  state.filtered = state.rows.filter(row => {
    if (query && !Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query))) return false;
  return Object.entries(state.filters).every(([key, filter]) => {
      if (!filter) return true;
      const value = row[key];
      const number = toNumber(value);
      if (filter.value !== '' && filter.value !== undefined && filter.value !== null && String(value ?? '') !== String(filter.value)) return false;
      if (filter.min !== '' && filter.min !== undefined && (number === null || number < Number(filter.min))) return false;
      if (filter.max !== '' && filter.max !== undefined && (number === null || number > Number(filter.max))) return false;
      return true;
    });
  });
  return state.filtered;
}

export function parseDelimited(text) {
  const source = text.replace(/^\uFEFF/, '');
  const separators = ['\t', ';', ','];
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const separator = separators.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && source[index + 1] === '"' && quoted) { field += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === separator && !quoted) { record.push(field.trim()); field = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      record.push(field.trim());
      if (record.some(value => value !== '')) records.push(record);
      record = []; field = ''; continue;
    }
    field += char;
  }
  if (field !== '' || record.length) { record.push(field.trim()); if (record.some(value => value !== '')) records.push(record); }
  if (!records.length) return [];
  const seen = new Map();
  const keys = records[0].map((key, index) => {
    const base = key || `campo_${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
  return records.slice(1).map(values => Object.fromEntries(keys.map((key, index) => [key, values[index] ?? ''])));
}

export function parseAny(text, fileName = '') {
  const trimmed = text.trim();
  if (/\.(json|geojson)$/i.test(fileName) || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        return parsed.features.map((feature, index) => {
          const properties = { ...(feature.properties || {}), feature_id: feature.id ?? index + 1 };
          const coordinates = feature.geometry?.coordinates;
          if (Array.isArray(coordinates)) {
            const pairs = [];
            const collect = value => { if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') pairs.push(value); else if (Array.isArray(value)) value.forEach(collect); };
            collect(coordinates);
            if (pairs.length) {
              const longitudes = pairs.map(pair => pair[0]);
              const latitudes = pairs.map(pair => pair[1]);
              properties.longitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
              properties.latitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
            }
          }
          properties.geometry_type = feature.geometry?.type || '';
          return properties;
        });
      }
      if (Array.isArray(parsed.rows)) return parsed.rows;
      if (Array.isArray(parsed.data)) return parsed.data;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch { /* Fallback to delimited text when JSON is incomplete. */ }
  }
  return parseDelimited(text);
}

export function loadRows(rows, meta = {}) {
  state.rows = rows.map(row => ({ ...row }));
  state.datasetName = meta.name || state.datasetName;
  state.sourceKind = meta.kind || 'local';
  state.sourceDetail = meta.detail || 'Archivo cargado localmente en este navegador.';
  state.filters = {};
  state.search = '';
  state.sortKey = '';
  state.sortDir = 'asc';
  state.tableLimit = 20;
  state.chartSort = 'original';
  state.chartTitle = 'Visualización principal';
  rebuildColumns();
  applyFilters();
}

loadRows(DEMO_ROWS, { name: 'Muestra arqueológica local', kind: 'synthetic', detail: 'Datos sintéticos de demostración. No representan un inventario oficial.' });
