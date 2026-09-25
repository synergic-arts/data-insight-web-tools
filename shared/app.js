import { DEMO_ROWS, state, esc, format, toNumber, toCoordinate, isMissing, parseAny, loadRows, rebuildColumns, applyFilters, geoFields } from './data.js?v=20260925-28';
import { chartSVG, tableHTML } from './charts.js?v=20260925-28';

const root = document.body;
const transformationHistory = [];
const mode = root.dataset.mode || 'dashboard';
const initialTab = mode === 'profiler' ? 'quality' : mode === 'transform' ? 'analyze' : 'overview';
const TAB_IDS = ['overview', 'prepare', 'analyze', 'quality'];
const CHART_TYPES = ['bar', 'grouped-bar', 'stacked-bar', 'line', 'area', 'stacked-area', 'combo', 'forecast', 'donut', 'scatter', 'histogram', 'boxplot', 'map', 'bubble-map', 'density-map', 'heatmap', 'correlation', 'funnel', 'waterfall', 'radar', 'treemap', 'sankey', 'pareto'];
const CHART_LABELS = { bar: 'Barras', 'grouped-bar': 'Barras agrupadas', 'stacked-bar': 'Barras apiladas', line: 'Línea', area: 'Área', 'stacked-area': 'Área apilada', combo: 'Combinado', forecast: 'Proyección', donut: 'Anillo', scatter: 'Dispersión', histogram: 'Histograma', boxplot: 'Caja y bigotes', map: 'Mapa de puntos', 'bubble-map': 'Mapa de burbujas', 'density-map': 'Densidad por cuadrícula', heatmap: 'Mapa de calor bivariado', correlation: 'Matriz de correlación', funnel: 'Embudo', waterfall: 'Cascada', radar: 'Radar', treemap: 'Treemap', sankey: 'Sankey de flujos', pareto: 'Pareto' };
const MAP_BASES = {
  osm: { label: 'OpenStreetMap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 },
  light: { label: 'Esri calles', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri', maxZoom: 19 },
  dark: { label: 'Esri oscuro', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri', maxZoom: 16 },
  satellite: { label: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri', maxZoom: 19 }
};
const MAP_CHART_TYPES = ['map', 'bubble-map', 'density-map'];
const leafletMaps = new Set();
const AGGREGATIONS = ['sum', 'avg', 'median', 'min', 'max', 'count', 'distinct'];
const AGGREGATION_LABELS = { sum: 'Suma', avg: 'Media', median: 'Mediana', min: 'Mínimo', max: 'Máximo', count: 'Recuento', distinct: 'Valores distintos' };
const SORT_MODES = ['original', 'value-desc', 'value-asc'];
const numericColumns = () => state.columns.filter(column => column.type === 'number');
const analysisNumericColumns = () => numericColumns().filter(column => !/^(id|_row_id|year|año)$/i.test(column.name));
const metricField = () => { const all = numericColumns(); const preferred = all.find(column => /find|count|total|value|amount|score|area|metric/i.test(column.name) && !/^(id|_row_id|latitude|longitude)$/i.test(column.name)); return preferred?.name || all.find(column => !/^(id|_row_id|latitude|longitude)$/i.test(column.name))?.name || all[0]?.name || ''; };
const hasColumn = (name, type = '') => typeof name === 'string' && state.columns.some(column => column.name === name && (!type || column.type === type));
const safeTab = tab => TAB_IDS.includes(tab) ? tab : 'overview';
const safeField = (value, fallback, type = '') => hasColumn(value, type) ? value : fallback;
const coordinates = () => geoFields(state.columns);
const firstTextField = () => state.columns.find(column => column.type === 'text')?.name || state.columns[0]?.name || '';
const firstNumericField = () => state.columns.find(column => column.type === 'number')?.name || '';
const mapBaseOptions = selected => Object.entries(MAP_BASES).map(([value, base]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(base.label)}</option>`).join('');

function bestSeriesField(exclude = '') {
  const preferred = /category|categoría|status|estado|tipo|group|grupo|class|clase/i;
  return state.columns.map(column => ({
    ...column,
    unique: new Set(state.rows.map(row => String(row[column.name] ?? 'Sin valor'))).size
  })).filter(column => column.name !== exclude && column.type === 'text' && column.unique >= 2 && column.unique <= 8)
    .sort((left, right) => Number(preferred.test(right.name)) - Number(preferred.test(left.name)) || left.unique - right.unique)[0]?.name || '';
}

function bestFlowFields() {
  const text = state.columns.filter(column => column.type === 'text');
  const source = text.find(column => /^(source|origen|from|salida|procedencia|origin)$/i.test(column.name) || /source|origen|procedencia|salida/i.test(column.name));
  const target = text.find(column => column.name !== source?.name && (/^(target|destino|to|llegada|entrada|destination)$/i.test(column.name) || /target|destino|llegada|entrada/i.test(column.name)));
  return { source: source?.name || '', target: target?.name || '' };
}

function bestSecondaryField(exclude = '') {
  return analysisNumericColumns().find(column => column.name !== exclude)?.name || '';
}

function safeSpan(value, fallback, maximum = 12) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(maximum, Math.max(1, number)) : fallback;
}

function layoutDefaults(card) {
  if (card.type === 'kpi') return { colSpan: 3, rowSpan: 1 };
  if (card.type === 'table') return { colSpan: 12, rowSpan: 2 };
  if (['map', 'bubble-map', 'density-map', 'heatmap', 'correlation', 'scatter', 'line', 'area', 'stacked-area', 'combo', 'forecast', 'grouped-bar', 'stacked-bar', 'sankey', 'pareto'].includes(card.chartType)) return { colSpan: 6, rowSpan: 2 };
  return { colSpan: 4, rowSpan: 2 };
}

function withLayout(card) {
  const defaults = layoutDefaults(card);
  return { ...card, colSpan: safeSpan(card.colSpan, defaults.colSpan), rowSpan: safeSpan(card.rowSpan, defaults.rowSpan, 4) };
}

function autoLayoutCards(cards, viewportWidth = window.innerWidth) {
  const compact = viewportWidth < 700;
  const tablet = viewportWidth >= 700 && viewportWidth < 1000;
  cards.forEach(card => {
    const defaults = layoutDefaults(card);
    card.colSpan = compact ? 12 : tablet ? Math.min(12, defaults.colSpan * 2) : defaults.colSpan;
    card.rowSpan = compact ? 1 : defaults.rowSpan;
  });
  return cards;
}

function cardSortRank(card) {
  if (card.type === 'kpi') return 0;
  if (card.type === 'table') return 3;
  if (['map', 'bubble-map', 'density-map', 'heatmap'].includes(card.chartType)) return 2;
  return 1;
}

function sanitizeFilters(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([key]) => hasColumn(key)).map(([key, filter]) => {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return [key, {}];
    const clean = {};
    ['value', 'contains'].forEach(part => { if (filter[part] !== undefined && filter[part] !== null && String(filter[part]) !== '') clean[part] = String(filter[part]); });
    ['min', 'max'].forEach(part => { if (filter[part] !== undefined && filter[part] !== null && filter[part] !== '' && Number.isFinite(Number(filter[part]))) clean[part] = String(filter[part]); });
    return [key, clean];
  }).filter(([, filter]) => Object.keys(filter).length));
}

function sanitizeDashboard(raw) {
  if (!raw || !Array.isArray(raw.cards)) return defaultDashboard();
  const cards = raw.cards.filter(card => card && typeof card === 'object' && ['kpi', 'chart', 'table'].includes(card.type)).map((card, index) => {
    const type = card.type;
    const id = typeof card.id === 'string' && card.id.trim() ? card.id.trim().slice(0, 80) : `${type}-${index + 1}`;
    const title = typeof card.title === 'string' ? card.title.trim().slice(0, 100) : '';
    if (type === 'kpi') {
      const metric = ['rows', 'sum', 'avg', 'complete'].includes(card.metric) ? card.metric : 'rows';
      if ((metric === 'sum' || metric === 'avg') && !numericColumns().length) return withLayout({ id, type, metric: 'rows', title });
      return withLayout({ id, type, metric, field: safeField(card.field, metricField(), 'number'), title });
    }
    if (type === 'table') return withLayout({ id, type, title: title || 'Registros', colSpan: card.colSpan, rowSpan: card.rowSpan });
    const aggregation = AGGREGATIONS.includes(card.aggregation) ? card.aggregation : 'sum';
    const xField = safeField(card.xField, state.xField);
    const yField = safeField(card.yField, state.yField, aggregation === 'count' ? '' : 'number');
    const seriesField = hasColumn(card.seriesField) && card.seriesField !== xField ? card.seriesField : '';
    const secondaryField = hasColumn(card.secondaryField, 'number') && card.secondaryField !== yField ? card.secondaryField : '';
    return withLayout({ id, type, title: title || 'Visualización', chartType: CHART_TYPES.includes(card.chartType) ? card.chartType : 'bar', xField, yField, secondaryField, seriesField, aggregation, mapBase: MAP_BASES[card.mapBase] ? card.mapBase : 'osm', chartSort: SORT_MODES.includes(card.chartSort) ? card.chartSort : 'original', colSpan: card.colSpan, rowSpan: card.rowSpan });
  });
  return { cards };
}

function defaultDashboard() {
  const numeric = metricField();
  const dimension = state.columns.find(column => column.type === 'text')?.name || state.xField || state.columns[0]?.name || '';
  const aggregation = numeric ? 'sum' : 'count';
  const geo = coordinates();
  const temporal = state.columns.find(column => column.type === 'date' || /^(year|año|date|fecha|time|period|periodo)$/i.test(column.name));
  const analysisNumbers = analysisNumericColumns().filter(column => !/^(latitude|longitude)$/i.test(column.name));
  const cards = [
    { id: 'kpi-rows', type: 'kpi', metric: 'rows' }
  ];
  if (numeric) cards.push({ id: 'kpi-sum', type: 'kpi', metric: 'sum', field: numeric });
  if (numeric) cards.push({ id: 'kpi-avg', type: 'kpi', metric: 'avg', field: numeric });
  cards.push({ id: 'kpi-complete', type: 'kpi', metric: 'complete' });
  const series = bestSeriesField(dimension);
  if (dimension) cards.push({ id: 'chart-main', type: 'chart', title: 'Distribución principal', chartType: series ? 'grouped-bar' : 'bar', xField: dimension, yField: numeric || dimension, seriesField: series, aggregation });
  if (temporal && numeric) cards.push({ id: 'chart-trend', type: 'chart', title: 'Evolución temporal', chartType: series ? 'stacked-area' : 'line', xField: temporal.name, yField: numeric, seriesField: series, aggregation: 'sum', chartSort: 'original' });
  if (temporal && numeric && new Set(state.rows.map(row => String(row[temporal.name] ?? ''))).size >= 3) cards.push({ id: 'chart-forecast', type: 'chart', title: 'Tendencia y proyección', chartType: 'forecast', xField: temporal.name, yField: numeric, aggregation: 'sum', chartSort: 'original' });
  if (temporal && analysisNumbers.length >= 2) cards.push({ id: 'chart-combo', type: 'chart', title: 'Comparación de métricas', chartType: 'combo', xField: temporal.name, yField: analysisNumbers[0].name, secondaryField: analysisNumbers[1].name, aggregation: 'sum', chartSort: 'original' });
  if (analysisNumbers.length >= 2) cards.push({ id: 'chart-relation', type: 'chart', title: 'Relación entre métricas', chartType: 'scatter', xField: analysisNumbers[0].name, yField: analysisNumbers[1].name, aggregation: 'sum' });
  if (analysisNumbers.length >= 3) cards.push({ id: 'chart-correlation', type: 'chart', title: 'Correlaciones entre métricas', chartType: 'correlation', xField: analysisNumbers[0].name, yField: analysisNumbers[1].name, aggregation: 'count' });
  const flow = bestFlowFields();
  if (flow.source && flow.target && numeric) cards.push({ id: 'chart-flow', type: 'chart', title: 'Flujos entre categorías', chartType: 'sankey', xField: flow.source, yField: numeric, seriesField: flow.target, aggregation: 'sum' });
  if (geo.longitude && geo.latitude) cards.push({ id: 'map-main', type: 'chart', title: 'Distribución espacial', chartType: 'map', xField: geo.longitude, yField: geo.latitude, aggregation: 'count' });
  if (geo.longitude && geo.latitude) cards.push({ id: 'density-main', type: 'chart', title: 'Concentración espacial', chartType: 'density-map', xField: geo.longitude, yField: geo.latitude, aggregation: 'count' });
  cards.push({ id: 'table-main', type: 'table', title: 'Registros filtrados' });
  return { cards: autoLayoutCards(cards) };
}

function shellMarkup() {
  root.innerHTML = `<div class="app-shell">
    <header class="appbar"><a class="brand" href="../" aria-label="Data Insight Web Tools"><span class="brand-mark">DI</span><span><strong>Data Insight</strong><small>local analytics studio</small></span></a><div class="appbar-actions"><button class="button button-soft" data-action="assistant">✦ Asistente local</button><button class="button button-ghost" data-action="undo-transform" disabled>↶ Deshacer</button><button class="icon-button" data-action="fullscreen" title="Pantalla completa" aria-label="Pantalla completa">⛶</button><button class="button button-ghost" data-action="save">Guardar proyecto</button><button class="button button-ghost" data-action="export-json">Exportar JSON</button><button class="button button-primary" data-action="export">Exportar CSV</button></div></header>
    <div class="app-layout">
      <aside class="sidebar"><div class="sidebar-heading"><span class="eyebrow">Espacio de trabajo</span><h2>Explora tus datos</h2></div><div class="dataset-card"><span class="status-dot"></span><strong id="dataset-name">Cargando…</strong><small id="dataset-meta"></small><span id="dataset-kind" class="badge"></span></div>
        <nav class="side-nav" aria-label="Secciones"><button data-tab="overview">▦ <span>Dashboard</span></button><button data-tab="prepare">⌘ <span>Preparar datos</span></button><button data-tab="analyze">◒ <span>Analizar</span></button><button data-tab="quality">✓ <span>Calidad</span></button></nav>
        <div class="side-divider"></div><span class="eyebrow">Entrada y salida</span><div class="side-actions"><button class="button button-soft" data-action="import">＋ Cargar CSV, JSON o GeoJSON</button><button class="button button-ghost wide" data-action="paste">Pegar datos</button><button class="button button-ghost wide" data-action="load-project">Abrir proyecto guardado</button><button class="button button-ghost wide" data-action="reset">Restaurar muestra</button><input id="file-input" type="file" accept=".csv,.tsv,.txt,.json,.geojson,application/json,text/csv" hidden><input id="project-input" type="file" accept=".data-insight.json,application/json" hidden></div>
        <div class="local-ai-status"><span class="status-dot" id="ai-status-dot"></span><div><strong>Asistencia local</strong><small id="ai-status">Comprobando Gemini Nano…</small></div></div>
        <div class="privacy-note"><span>◉</span><p><strong>Privado por diseño</strong><br>Los archivos se procesan en este navegador. No se suben a ningún servidor.</p></div>
      </aside>
      <main class="workspace"><div class="workspace-header"><div><div class="breadcrumbs">Data Insight <span>/</span> <span id="breadcrumb-current">Dashboard</span></div><h1 id="page-title">Dashboard ejecutivo</h1><p id="page-subtitle">Resume, filtra y comparte hallazgos sin abandonar tus datos.</p></div><div class="workspace-actions"><button class="button button-ghost" data-action="add-calculated">＋ Campo calculado</button><button class="button button-primary" data-action="add-chart">＋ Añadir visual</button></div></div><div id="app-alert" aria-live="polite"></div><section id="app-content"></section></main>
    </div></div>`;
}

function pageInfo(tab) {
  return {
    overview: ['Dashboard', 'Dashboard ejecutivo', 'Resume, filtra y comparte hallazgos sin abandonar tus datos.'],
    prepare: ['Preparar datos', 'Preparación y filtros', 'Inspecciona el esquema, filtra filas y comprueba los valores.'],
    analyze: ['Analizar', 'Laboratorio de análisis', 'Construye visuales rápidos y añádelos al dashboard.'],
    quality: ['Calidad', 'Perfil de calidad', 'Detecta vacíos, duplicados, tipos y posibles problemas antes de decidir.']
  }[tab];
}

function renderMeta() {
  const numeric = numericColumns().length;
  const name = document.querySelector('#dataset-name');
  const meta = document.querySelector('#dataset-meta');
  const kind = document.querySelector('#dataset-kind');
  if (name) name.textContent = state.datasetName;
  if (meta) meta.textContent = `${format(state.rows.length, 0)} filas · ${format(state.columns.length, 0)} campos · ${numeric} numéricos`;
  if (kind) { kind.textContent = state.sourceKind === 'synthetic' ? 'Muestra local' : state.sourceKind === 'pasted' ? 'Pegado local' : 'Archivo local'; kind.className = `badge badge-${state.sourceKind}`; }
  const undo = document.querySelector('[data-action="undo-transform"]');
  if (undo) undo.disabled = transformationHistory.length === 0;
}

function renderAll() {
  destroyLeafletMaps();
  applyFilters();
  renderMeta();
  const info = pageInfo(state.activeTab);
  document.querySelector('#breadcrumb-current').textContent = info[0];
  document.querySelector('#page-title').textContent = info[1];
  document.querySelector('#page-subtitle').textContent = info[2];
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === state.activeTab));
  document.querySelector('#app-content').innerHTML = renderContent();
  enhanceAnalyzeUI();
  mountLeafletMaps();
}

function renderContent() {
  if (state.activeTab === 'prepare') return renderPrepare();
  if (state.activeTab === 'analyze') return renderAnalyze();
  if (state.activeTab === 'quality') return renderQualityEnhanced();
  return renderOverview();
}

function renderKpi(metric, field) {
  const rows = state.filtered;
  let value = rows.length;
  let label = 'Filas filtradas';
  let detail = `${format(state.rows.length, 0)} en el conjunto total`;
  if (metric === 'sum') { const values = rows.map(row => toNumber(row[field])).filter(value => value !== null); value = values.length ? values.reduce((sum, item) => sum + item, 0) : null; label = `Total de ${field}`; detail = values.length ? 'Suma de los valores visibles' : 'No hay valores numéricos visibles'; }
  if (metric === 'avg') { const values = rows.map(row => toNumber(row[field])).filter(value => value !== null); value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null; label = `Media de ${field}`; detail = values.length ? 'Media de los valores visibles' : 'No hay valores numéricos visibles'; }
  if (metric === 'complete') { const cells = rows.length * state.columns.length; const present = rows.reduce((sum, row) => sum + state.columns.filter(column => !isMissing(row[column.name])).length, 0); value = cells ? present / cells * 100 : null; label = 'Completitud'; detail = cells ? 'Celdas con valor' : 'No hay filas visibles'; return `<div class="kpi-value">${format(value, 1)}${value === null ? '' : '<small>%</small>'}</div><div class="kpi-label">${label}</div><div class="kpi-detail">${detail}</div>`; }
  return `<div class="kpi-value">${format(value, metric === 'avg' ? 1 : 0)}</div><div class="kpi-label">${esc(label)}</div><div class="kpi-detail">${esc(detail)}</div>`;
}

function destroyLeafletMaps() {
  leafletMaps.forEach(map => map.remove());
  leafletMaps.clear();
}

function mapPopup(row, index, longitude, latitude) {
  const name = row.name ?? row.site ?? row.title ?? `Fila ${index + 1}`;
  const attributes = Object.entries(row).map(([key, value]) => `<tr><th>${esc(key)}</th><td>${esc(value)}</td></tr>`).join('');
  return `<div class="leaflet-popup-title">${esc(name)}</div><div class="leaflet-popup-coords">${format(longitude, 5)}°, ${format(latitude, 5)}°</div><table class="leaflet-popup-table">${attributes}</table>`;
}

function aggregateMapValue(rows, field, aggregation) {
  if (!field) return rows.length;
  if (aggregation === 'distinct') return new Set(rows.map(point => String(point.row[field] ?? ''))).size;
  const values = rows.map(point => toNumber(point.row[field])).filter(value => value !== null);
  if (!values.length) return rows.length;
  if (aggregation === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === 'median') { const sorted = [...values].sort((left, right) => left - right); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
  if (aggregation === 'min') return Math.min(...values);
  if (aggregation === 'max') return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

function mountLeafletMaps() {
  if (!window.L) return;
  document.querySelectorAll('[data-leaflet-chart]').forEach(host => {
    let config;
    try { config = JSON.parse(host.dataset.leafletChart); } catch { host.innerHTML = '<div class="empty-chart"><strong>Configuración de mapa no válida</strong></div>'; return; }
    const points = state.filtered.map((row, index) => ({ row, index, longitude: toCoordinate(row[config.longitudeField]), latitude: toCoordinate(row[config.latitudeField]) })).filter(item => item.longitude !== null && item.latitude !== null && Math.abs(item.longitude) <= 180 && Math.abs(item.latitude) <= 90).slice(0, 2000);
    if (!points.length) { host.innerHTML = '<div class="empty-chart"><span>⌖</span><strong>No hay coordenadas visibles</strong><small>Selecciona campos de longitud y latitud válidos o cambia los filtros.</small></div>'; return; }
    host.classList.add('leaflet-chart-mounted');
    host.innerHTML = '';
    const map = L.map(host, { zoomControl: true, preferCanvas: true, attributionControl: true }).setView([40.2, -3.7], 5);
    const bases = {};
    Object.entries(MAP_BASES).forEach(([key, base]) => { bases[base.label] = L.tileLayer(base.url, { maxZoom: base.maxZoom, attribution: base.attribution, crossOrigin: true }); });
    const selectedBase = MAP_BASES[config.mapBase] ? MAP_BASES[config.mapBase].label : MAP_BASES.osm.label;
    bases[selectedBase].addTo(map);
    const dataLayer = L.layerGroup().addTo(map);
    const densityLayer = L.layerGroup();
    const groups = new Map();
    points.forEach(point => {
      const key = config.type === 'map' ? `${point.index}` : `${point.longitude.toFixed(3)}|${point.latitude.toFixed(3)}`;
      const current = groups.get(key) || { ...point, count: 0, rows: [] };
      current.count += 1;
      current.rows.push(point);
      groups.set(key, current);
    });
    const renderPoints = [...groups.values()].map(point => ({ ...point, metric: aggregateMapValue(point.rows, config.secondaryField, config.aggregation || 'count') }));
    if (config.type === 'density-map') points.forEach(point => {
      const marker = L.circleMarker([point.latitude, point.longitude], { radius: 4, color: '#fef3c7', weight: 1, fillColor: '#67e8f9', fillOpacity: .45 });
      marker.bindPopup(mapPopup(point.row, point.index, point.longitude, point.latitude));
      dataLayer.addLayer(marker);
    });
    const metricValues = renderPoints.map(point => point.metric).filter(value => Number.isFinite(value));
    const metricMin = metricValues.length ? Math.min(...metricValues) : 0;
    const metricMax = metricValues.length ? Math.max(...metricValues) : 1;
    renderPoints.forEach((point, index) => {
      const label = point.row.name ?? point.row.site ?? point.row.title ?? `Fila ${point.index + 1}`;
      const normalizedMetric = (point.metric - metricMin) / (metricMax - metricMin || 1);
      const radius = config.type === 'map' ? 6 : config.type === 'bubble-map' ? Math.min(28, 7 + normalizedMetric * 20) : Math.min(26, 7 + Math.sqrt(point.count) * 4);
      const marker = L.circleMarker([point.latitude, point.longitude], { radius, color: '#071924', weight: 1.5, fillColor: config.type === 'density-map' ? '#fbbf24' : '#67e8f9', fillOpacity: config.type === 'density-map' ? Math.min(.86, .3 + point.count / Math.max(1, renderPoints.length)) : .84 });
      const sourceRow = point.row;
      marker.bindPopup(mapPopup(sourceRow, point.index, point.longitude, point.latitude));
      marker.bindTooltip(`${esc(label)} · ${point.count} registro${point.count === 1 ? '' : 's'}`, { direction: 'top', sticky: true });
      (config.type === 'density-map' ? densityLayer : dataLayer).addLayer(marker);
    });
    const overlays = { 'Datos visibles': dataLayer };
    if (config.type === 'density-map') overlays['Densidad agregada'] = densityLayer;
    L.control.layers(bases, overlays, { collapsed: true, position: 'topright' }).addTo(map);
    if (config.type === 'density-map') densityLayer.addTo(map);
    const bounds = L.latLngBounds(points.map(point => [point.latitude, point.longitude]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(.12), { maxZoom: 14 });
    const caption = document.createElement('div');
    caption.className = 'leaflet-caption';
    const metricCaption = config.secondaryField ? ` · ${AGGREGATION_LABELS[config.aggregation] || 'Suma'} ${config.secondaryField}` : '';
    caption.textContent = `${points.length} coordenadas${metricCaption} · ${MAP_BASES[config.mapBase]?.label || MAP_BASES.osm.label}`;
    host.appendChild(caption);
    leafletMaps.add(map);
  });
}

function cardActions(card) {
  const configure = card.type === 'chart' ? `<button class="card-action" data-action="configure-card" data-id="${esc(card.id)}" title="Personalizar visual" aria-label="Personalizar visual">⚙</button>` : '';
  return `<div class="card-actions"><button class="card-action" data-action="move-card" data-delta="-1" data-id="${esc(card.id)}" title="Mover arriba" aria-label="Mover arriba">↑</button><button class="card-action" data-action="move-card" data-delta="1" data-id="${esc(card.id)}" title="Mover abajo" aria-label="Mover abajo">↓</button><button class="card-action" data-action="resize-card" data-axis="col" data-delta="-1" data-id="${esc(card.id)}" title="Reducir ancho" aria-label="Reducir ancho">↔−</button><button class="card-action" data-action="resize-card" data-axis="col" data-delta="1" data-id="${esc(card.id)}" title="Aumentar ancho" aria-label="Aumentar ancho">↔＋</button><button class="card-action" data-action="resize-card" data-axis="row" data-delta="-1" data-id="${esc(card.id)}" title="Reducir alto" aria-label="Reducir alto">↕−</button><button class="card-action" data-action="resize-card" data-axis="row" data-delta="1" data-id="${esc(card.id)}" title="Aumentar alto" aria-label="Aumentar alto">↕＋</button>${configure}<button class="card-action" data-action="rename-card" data-id="${esc(card.id)}" title="Renombrar tarjeta" aria-label="Renombrar tarjeta">✎</button><button class="card-action" data-action="duplicate-card" data-id="${esc(card.id)}" title="Duplicar tarjeta" aria-label="Duplicar tarjeta">⧉</button><button class="card-action" data-action="remove-card" data-id="${esc(card.id)}" title="Quitar tarjeta" aria-label="Quitar tarjeta">×</button></div>`;
}

function cardHTML(card) {
  const attrs = `data-card-id="${esc(card.id)}" draggable="true" style="--card-col:${safeSpan(card.colSpan, layoutDefaults(card).colSpan)};--card-row:${safeSpan(card.rowSpan, layoutDefaults(card).rowSpan, 4)}"`;
  if (card.type === 'kpi') return `<article class="kpi-card dashboard-card" ${attrs}><div class="kpi-icon">${card.metric === 'complete' ? '◒' : card.metric === 'rows' ? '▤' : 'Σ'}</div>${renderKpi(card.metric, card.field)}${cardActions(card)}</article>`;
  if (card.type === 'table') return `<article class="panel dashboard-card card-table" ${attrs}><div class="panel-heading"><div><span class="eyebrow">Tabla</span><h3>${esc(card.title || 'Registros')}</h3></div>${cardActions(card)}</div>${tableHTML(state.filtered, state.columns, 8)}</article>`;
  return `<article class="panel dashboard-card card-chart" ${attrs}><div class="panel-heading"><div><span class="eyebrow">Visual</span><h3>${esc(card.title || 'Visualización')}</h3></div>${cardActions(card)}</div><div class="chart-wrap">${chartSVG(card.chartType || 'bar', state.filtered, card.xField || state.xField, card.yField || state.yField, card.aggregation || 'sum', card.chartSort || 'original', card.seriesField || '', card.secondaryField || '', card.mapBase || 'osm')}</div></article>`;
}

function renderOverview() {
  const cards = state.dashboard.cards.length ? state.dashboard.cards : defaultDashboard().cards;
  if (!state.dashboard.cards.length) state.dashboard.cards = cards;
  return `<div class="overview-toolbar"><div><span class="result-count">${format(state.filtered.length, 0)} filas visibles</span><span class="source-line">Fuente: ${esc(state.sourceDetail)}</span></div><div class="toolbar-actions"><button class="button button-ghost" data-tab="prepare">Editar filtros</button><button class="button button-ghost" data-action="reset-filters">Restablecer filtros</button><button class="button button-soft" data-action="add-table">＋ Tabla</button><button class="button button-soft" data-action="auto-dashboard">✦ Autodashboard</button><button class="button button-soft" data-action="auto-layout">▦ Autoorganizar</button><button class="button button-soft" data-action="reset-dashboard">Restablecer dashboard</button></div></div><div class="dashboard-hint">Arrastra las cajas para cambiar su posición. Usa los controles de cada tarjeta para ajustar ancho, alto o configuración.</div><div class="dashboard-grid">${cards.map(cardHTML).join('')}</div>`;
}

function renderFilters() {
  const controls = state.columns.map(column => {
    if (column.type === 'number') return `<div class="filter-field"><label>${esc(column.name)}<small>mínimo / máximo</small></label><div class="range-fields"><input aria-label="Mínimo de ${esc(column.name)}" type="number" placeholder="mín" data-filter-kind="min" data-filter-key="${esc(column.name)}" value="${esc(state.filters[column.name]?.min ?? '')}"><input aria-label="Máximo de ${esc(column.name)}" type="number" placeholder="máx" data-filter-kind="max" data-filter-key="${esc(column.name)}" value="${esc(state.filters[column.name]?.max ?? '')}"></div></div>`;
    return `<div class="filter-field"><label for="contains-${esc(column.name)}">${esc(column.name)}<small>contiene texto</small></label><input id="contains-${esc(column.name)}" type="search" placeholder="Contiene…" data-filter-kind="contains" data-filter-key="${esc(column.name)}" value="${esc(state.filters[column.name]?.contains ?? '')}"></div>`;
  }).join('');
  const active = Object.entries(state.filters).flatMap(([key, filter]) => Object.entries(filter).map(([kind, value]) => `<button class="filter-chip" data-action="remove-filter" data-key="${esc(key)}" data-filter-part="${esc(kind)}">${esc(key)} ${kind === 'contains' ? 'contiene' : kind}: ${esc(value)} ×</button>`)).join('');
  return `<div class="filter-panel"><div class="filter-panel-header"><div><span class="eyebrow">Filtros</span><strong>${active ? 'Filtros activos' : 'Todos los registros'}</strong></div><button class="button button-ghost" data-action="reset-filters">Limpiar filtros</button></div><div class="filter-search"><label class="sr-only" for="search-input">Buscar en cualquier campo</label><input id="search-input" type="search" aria-label="Buscar en cualquier campo" placeholder="Buscar en cualquier campo…" value="${esc(state.search)}"><button class="button button-soft" data-action="apply-search">Aplicar</button></div>${active ? `<div class="filter-chips">${active}</div>` : ''}<div class="filter-grid">${controls || '<span class="muted">Carga un conjunto de datos para crear filtros.</span>'}</div></div>`;
}

function renderPrepare() {
  return `${renderFilters()}<div class="panel"><div class="panel-heading"><div><span class="eyebrow">Esquema y muestra</span><h3>${format(state.filtered.length, 0)} filas filtradas</h3></div><span class="panel-note">${format(state.columns.length, 0)} campos detectados · todos disponibles para filtrar</span></div>${tableHTML(state.filtered, state.columns, 18)}</div>`;
}

function fieldSelect(id, value, numericOnly = false, allowBlank = false, blankLabel = 'Sin serie') {
  const options = state.columns.filter(column => !numericOnly || column.type === 'number').map(column => `<option value="${esc(column.name)}" ${column.name === value ? 'selected' : ''}>${esc(column.name)} · ${column.type}</option>`).join('');
  const blank = allowBlank ? `<option value="" ${value ? '' : 'selected'}>${esc(blankLabel)}</option>` : '';
  return options ? `<select id="${id}">${blank}${options}</select>` : `<select id="${id}" disabled><option>Sin campos disponibles</option></select>`;
}

function aggregationOptions(selected, hasMetric) {
  return AGGREGATIONS.map(value => {
    const numericOnly = !['count', 'distinct'].includes(value);
    return `<option value="${value}" ${selected === value ? 'selected' : ''}${numericOnly && !hasMetric ? ' disabled' : ''}>${AGGREGATION_LABELS[value]}</option>`;
  }).join('');
}

function renderAnalyze() {
  const hasMetric = numericColumns().length > 0;
  const aggregation = AGGREGATIONS.includes(state.aggregation) && (hasMetric || ['count', 'distinct'].includes(state.aggregation)) ? state.aggregation : 'count';
  if (state.aggregation !== aggregation) state.aggregation = aggregation;
  const geo = coordinates();
  const flow = bestFlowFields();
  const helper = hasMetric ? `Los gráficos se calculan en memoria con las filas filtradas. ${geo.longitude && geo.latitude ? `Se detectan coordenadas ${geo.longitude}/${geo.latitude}; prueba un mapa de puntos, burbujas o densidad.` : 'Puedes cargar un GeoJSON o campos lon/lat para activar el mapa.'} ${flow.source && flow.target ? `Se detecta un flujo ${flow.source} → ${flow.target}; prueba el Sankey.` : ''} ${analysisNumericColumns().length > 1 ? 'El mapa de calor, el combinado y la matriz de correlación comparan métricas compatibles.' : ''}` : 'No hay campos numéricos: se muestra un recuento por dimensión y puedes seguir explorando las categorías.';
  const previewTitle = state.chartTitle || `${state.yField} por ${state.xField}`;
  const chartOptions = Object.entries(CHART_LABELS).map(([value, label]) => `<option value="${value}" ${state.chartType === value ? 'selected' : ''}>${label}</option>`).join('');
  const secondaryLabel = MAP_CHART_TYPES.includes(state.chartType) ? 'Métrica secundaria / tamaño' : 'Métrica secundaria';
  return `<div class="analysis-layout"><aside class="analysis-controls panel"><div class="panel-heading"><div><span class="eyebrow">Configurar</span><h3>Visual actual</h3></div></div><label>Dimensión / X<span>${fieldSelect('x-field', state.xField)}</span></label><label>Métrica / Y<span>${fieldSelect('y-field', state.yField, hasMetric)}</span></label><label>${secondaryLabel}<span>${fieldSelect('secondary-field', state.secondaryField, true, true, 'Sin segunda métrica')}</span></label><label>Serie / color<span>${fieldSelect('series-field', state.seriesField, false, true)}</span></label><label>Tipo de gráfico<select id="chart-type">${chartOptions}</select></label><label>Mapa base<span><select id="map-base" ${MAP_CHART_TYPES.includes(state.chartType) ? '' : 'disabled'}>${mapBaseOptions(state.mapBase || 'osm')}</select></span></label><label>Agregación<select id="aggregation">${aggregationOptions(aggregation, hasMetric)}</select></label><label>Título de la visual<span><input id="chart-title" type="text" maxlength="80" value="${esc(state.chartTitle)}" aria-label="Título de la visual"></span></label><label>Orden de categorías<span><select id="chart-sort"><option value="original" ${state.chartSort === 'original' ? 'selected' : ''}>Orden de aparición</option><option value="value-desc" ${state.chartSort === 'value-desc' ? 'selected' : ''}>Mayor a menor valor</option><option value="value-asc" ${state.chartSort === 'value-asc' ? 'selected' : ''}>Menor a mayor valor</option></select></span></label><button class="button button-primary wide" data-action="add-chart">Añadir al dashboard</button><p class="helper">${helper} Las agregaciones numéricas incluyen suma, media, mediana, mínimo y máximo; también puedes contar filas o valores distintos. En mapas Leaflet, la métrica secundaria controla el tamaño agregado de burbujas y densidad.</p></aside><section class="panel analysis-result"><div class="panel-heading"><div><span class="eyebrow">Vista previa</span><h3>${esc(previewTitle)}</h3></div><div class="panel-heading-actions"><span class="panel-note">${format(state.filtered.length, 0)} filas</span><button class="button button-ghost" data-action="export-svg">Exportar SVG</button></div></div><div class="chart-wrap chart-large">${chartSVG(state.chartType, state.filtered, state.xField, state.yField, aggregation, state.chartSort, state.seriesField, state.secondaryField, state.mapBase || 'osm')}</div></section></div><div class="panel"><div class="panel-heading"><div><span class="eyebrow">Datos de respaldo</span><h3>Filas que alimentan la visual</h3></div></div>${tableHTML(state.filtered, state.columns, 10)}</div>`;
}

function enhanceAnalyzeUI() {
  if (state.activeTab !== 'analyze') return;
  const controls = document.querySelector('.analysis-controls');
  if (!controls || document.querySelector('#chart-title')) return;
  const addButton = controls.querySelector('[data-action="add-chart"]');
  if (!addButton) return;
  addButton.insertAdjacentHTML('beforebegin', `<label>Título de la visual<span><input id="chart-title" type="text" maxlength="80" value="${esc(state.chartTitle)}" aria-label="Título de la visual"></span></label><label>Orden de categorías<span><select id="chart-sort"><option value="original" ${state.chartSort === 'original' ? 'selected' : ''}>Orden de aparición</option><option value="value-desc" ${state.chartSort === 'value-desc' ? 'selected' : ''}>Mayor a menor valor</option><option value="value-asc" ${state.chartSort === 'value-asc' ? 'selected' : ''}>Menor a mayor valor</option></select></span></label>`);
  const preview = document.querySelector('.analysis-result .chart-wrap');
  if (preview) preview.innerHTML = chartSVG(state.chartType, state.filtered, state.xField, state.yField, state.aggregation, state.chartSort, state.seriesField, state.secondaryField, state.mapBase || 'osm');
  const heading = document.querySelector('.analysis-result .panel-heading h3');
  if (heading) heading.textContent = state.chartTitle || 'Visualización principal';
}

function renderQuality() {
  const totalCells = state.rows.length * state.columns.length;
  const missing = state.rows.reduce((sum, row) => sum + state.columns.filter(column => isMissing(row[column.name])).length, 0);
  const duplicateKeys = new Set(state.rows.map(row => JSON.stringify(row)));
  const cards = `<div class="quality-summary"><article class="quality-stat"><span>Completitud</span><strong>${format(totalCells ? (1 - missing / totalCells) * 100 : 0, 1)}%</strong><small>${format(missing, 0)} celdas vacías</small></article><article class="quality-stat"><span>Duplicados exactos</span><strong>${format(state.rows.length - duplicateKeys.size, 0)}</strong><small>Comparación de filas completas</small></article><article class="quality-stat"><span>Campos numéricos</span><strong>${format(numericColumns().length, 0)}</strong><small>Listos para métricas</small></article></div>`;
  const rows = state.columns.map(column => { const values = state.rows.map(row => row[column.name]); const present = values.filter(value => !isMissing(value)); const numbers = present.map(toNumber).filter(value => value !== null); const range = column.type === 'number' && numbers.length ? `${format(Math.min(...numbers), 1)} – ${format(Math.max(...numbers), 1)}` : '—'; return `<tr><td><strong>${esc(column.name)}</strong><small>${esc(column.type)}</small></td><td>${format(state.rows.length - present.length, 0)}</td><td>${format(new Set(present.map(String)).size, 0)}</td><td>${range}</td><td><span class="quality-bar"><i style="width:${state.rows.length ? present.length / state.rows.length * 100 : 0}%"></i></span></td></tr>`; }).join('');
  return `${cards}<div class="panel"><div class="panel-heading"><div><span class="eyebrow">Auditoría por campo</span><h3>Perfil de calidad del conjunto</h3></div><span class="panel-note">Sin enviar datos fuera del navegador</span></div><div class="table-scroll"><table class="quality-table"><thead><tr><th>Campo</th><th>Vacíos</th><th>Únicos</th><th>Rango</th><th>Cobertura</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="provenance"><strong>Lectura responsable</strong><span>El perfil describe el archivo cargado, no valida por sí solo la exactitud semántica, geográfica o estadística de sus valores. Conserva la fuente original y revisa los campos críticos antes de publicar resultados.</span></div>`;
}

function announce(message, kind = 'success') { const alert = document.querySelector('#app-alert'); if (alert) { alert.innerHTML = `<div class="alert alert-${kind}">${esc(message)}<button data-action="clear-alert">×</button></div>`; window.setTimeout(() => { if (alert) alert.innerHTML = ''; }, 6500); } }

function setAIStatus(message, kind = 'idle') {
  const label = document.querySelector('#ai-status');
  const dot = document.querySelector('#ai-status-dot');
  if (label) label.textContent = message;
  if (dot) dot.dataset.state = kind;
}

async function detectLocalAI() {
  const api = window.LanguageModel;
  if (!api) { setAIStatus('IA local no disponible; análisis determinista activo', 'fallback'); return 'unavailable'; }
  try {
    const availability = await api.availability({ expectedInputs: [{ type: 'text', languages: ['es'] }], expectedOutputs: [{ type: 'text', languages: ['es'] }] });
    state.aiAvailability = availability;
    const labels = { available: 'Gemini Nano listo', downloadable: 'Gemini Nano disponible bajo demanda', downloading: 'Descargando modelo bajo demanda', unavailable: 'IA local no disponible' };
    setAIStatus(labels[availability] || `Gemini Nano: ${availability}`, availability === 'available' ? 'ready' : availability === 'unavailable' ? 'fallback' : 'idle');
    return availability;
  } catch {
    setAIStatus('IA local no disponible; análisis determinista activo', 'fallback');
    return 'unavailable';
  }
}

function compactDataProfile() {
  const geo = coordinates();
  const fields = state.columns.map(column => {
    const values = state.rows.map(row => row[column.name]).filter(value => !isMissing(value));
    const numeric = values.map(toNumber).filter(value => value !== null);
    return { name: column.name, type: column.type, missing: state.rows.length - values.length, unique: new Set(values.map(String)).size, min: numeric.length ? Math.min(...numeric) : undefined, max: numeric.length ? Math.max(...numeric) : undefined };
  });
  return { dataset: state.datasetName, rows: state.rows.length, visibleRows: state.filtered.length, fields, coordinates: geo, sample: state.filtered.slice(0, 5).map(row => Object.fromEntries(state.columns.slice(0, 12).map(column => [column.name, row[column.name]]))) };
}

function deterministicInsights() {
  const profile = compactDataProfile();
  const totalCells = state.rows.length * state.columns.length;
  const present = state.rows.reduce((sum, row) => sum + state.columns.filter(column => !isMissing(row[column.name])).length, 0);
  const insights = [`${format(state.filtered.length, 0)} de ${format(state.rows.length, 0)} filas están visibles con los filtros actuales.`, `La completitud global es ${format(totalCells ? present / totalCells * 100 : 0, 1)}%.`];
  const missingFields = state.columns.map(column => ({ name: column.name, count: state.rows.filter(row => isMissing(row[column.name])).length })).filter(item => item.count).sort((a, b) => b.count - a.count);
  if (missingFields.length) insights.push(`Los campos con más vacíos son ${missingFields.slice(0, 3).map(item => `${item.name} (${format(item.count, 0)})`).join(', ')}.`);
  const numeric = analysisNumericColumns();
  numeric.slice(0, 3).forEach(column => {
    const values = state.filtered.map(row => toNumber(row[column.name])).filter(value => value !== null);
    if (values.length) {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      insights.push(`${column.name}: media ${format(mean, 2)}, rango ${format(Math.min(...values), 2)}–${format(Math.max(...values), 2)}.`);
      insights.push(`${column.name}: mediana ${format([...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * .5)], 2)} y desviación estándar descriptiva ${format(Math.sqrt(variance), 2)}.`);
      const sorted = [...values].sort((a, b) => a - b);
      const q1 = sorted[Math.floor((sorted.length - 1) * .25)];
      const q3 = sorted[Math.floor((sorted.length - 1) * .75)];
      const iqr = q3 - q1;
      const outliers = iqr ? values.filter(value => value < q1 - 1.5 * iqr || value > q3 + 1.5 * iqr).length : 0;
      if (outliers) insights.push(`${column.name}: ${format(outliers, 0)} posibles valores atípicos según el rango intercuartílico; revísalos antes de agregarlos.`);
    }
  });
  const temporal = state.columns.find(column => column.type === 'date' || /^(year|año|date|fecha|time|period|periodo)$/i.test(column.name));
  const temporalMetric = numeric[0];
  if (temporal && temporalMetric) {
    const timeline = new Map();
    state.filtered.forEach(row => { const key = String(row[temporal.name] ?? ''); const value = toNumber(row[temporalMetric.name]); if (key && value !== null) timeline.set(key, (timeline.get(key) || 0) + value); });
    const ordered = [...timeline.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es', { numeric: true }));
    if (ordered.length >= 2) { const first = ordered[0][1]; const last = ordered[ordered.length - 1][1]; const change = first ? (last - first) / Math.abs(first) * 100 : null; insights.push(`La evolución de ${temporalMetric.name} entre ${ordered[0][0]} y ${ordered[ordered.length - 1][0]} ${change === null ? 'no permite calcular variación porcentual' : `cambia ${format(change, 1)}%`}.`); }
  }
  if (numeric.length >= 2) {
    const pairs = state.filtered.map(row => [toNumber(row[numeric[0].name]), toNumber(row[numeric[1].name])]).filter(pair => pair.every(value => value !== null));
    if (pairs.length >= 3) {
      const meanX = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
      const meanY = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
      const numerator = pairs.reduce((sum, pair) => sum + (pair[0] - meanX) * (pair[1] - meanY), 0);
      const denominator = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[0] - meanX) ** 2, 0) * pairs.reduce((sum, pair) => sum + (pair[1] - meanY) ** 2, 0));
      if (denominator) {
        const varianceX = pairs.reduce((sum, pair) => sum + (pair[0] - meanX) ** 2, 0);
        const slope = varianceX ? numerator / varianceX : null;
        const residuals = slope === null ? [] : pairs.map(pair => pair[1] - (meanY + slope * (pair[0] - meanX)));
        const totalSquares = pairs.reduce((sum, pair) => sum + (pair[1] - meanY) ** 2, 0);
        const rSquared = totalSquares ? 1 - residuals.reduce((sum, value) => sum + value ** 2, 0) / totalSquares : null;
        insights.push(`La correlación lineal entre ${numeric[0].name} y ${numeric[1].name} es ${format(numerator / denominator, 2)}; describe asociación, no causalidad.`);
        if (slope !== null && rSquared !== null) insights.push(`La regresión lineal descriptiva estima una pendiente de ${format(slope, 3)} y R²=${format(rSquared, 2)}; no es una predicción ni prueba causal.`);
      }
    }
  }
  const text = state.columns.find(column => column.type === 'text');
  if (text) {
    const counts = new Map();
    state.filtered.forEach(row => { const value = String(row[text.name] ?? 'Sin valor'); counts.set(value, (counts.get(value) || 0) + 1); });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) insights.push(`La categoría más frecuente en ${text.name} es “${top[0]}” (${format(top[1], 0)} filas).`);
  }
  if (profile.coordinates.longitude && profile.coordinates.latitude) insights.push(`Se han detectado coordenadas ${profile.coordinates.longitude}/${profile.coordinates.latitude}; el panel automático incluye puntos y densidad WGS84, sin enviar datos a un servidor.`);
  if (temporal && temporalMetric) insights.push(`Recomendación: usa ${temporal.name} como eje temporal y ${temporalMetric.name} como métrica; el panel automático ya prepara esa evolución.`);
  if (numeric.length >= 2) insights.push(`Recomendación: compara ${numeric[0].name} y ${numeric[1].name} con dispersión y revisa los posibles atípicos antes de interpretar.`);
  return insights;
}

async function askLocalModel(request = '', mode = 'analysis') {
  const availability = state.aiAvailability || await detectLocalAI();
  if (!['available', 'downloadable'].includes(availability)) throw new Error('Gemini Nano no está disponible en este navegador.');
  const api = window.LanguageModel;
  if (!state.aiSession) {
    setAIStatus('Preparando Gemini Nano…', 'idle');
    state.aiSession = await api.create({ expectedInputs: [{ type: 'text', languages: ['es'] }], expectedOutputs: [{ type: 'text', languages: ['es'] }], monitor(monitor) { monitor.addEventListener('downloadprogress', event => { setAIStatus(`Descargando Gemini Nano ${Math.round(event.loaded * 100)}%`, 'idle'); }); } });
  }
  const profile = compactDataProfile();
  const prompt = mode === 'plan'
    ? `Actúa como un planificador de operaciones de datos. Devuelve SOLO un objeto JSON válido, sin markdown ni explicación. Elige una sola acción: chart o treatment. Para chart usa exactamente este esquema: {"action":"chart","chartType":"bar|grouped-bar|stacked-bar|line|area|stacked-area|combo|forecast|donut|scatter|histogram|boxplot|map|bubble-map|density-map|heatmap|correlation|funnel|waterfall|radar|treemap|sankey|pareto","xField":"nombre exacto","yField":"nombre exacto","secondaryField":"segunda métrica numérica o cadena vacía","seriesField":"campo de serie o cadena vacía","aggregation":"sum|avg|count","chartSort":"original|value-desc|value-asc","title":"título breve"}. En sankey, xField es origen y seriesField es destino. Para treatment usa: {"action":"treatment","command":"orden breve en español"}. Solo puedes usar nombres de campos que aparezcan en el perfil. No inventes campos, coordenadas ni valores. La orden treatment debe ser una de estas operaciones: eliminar duplicados, eliminar filas vacías, rellenar faltantes, limpiar espacios, normalizar un campo numérico, detectar atípicos o segmentar un campo numérico. Petición: ${request || 'elige un análisis útil'}. Perfil: ${JSON.stringify(profile)}`
    : `Actúa como analista de datos. Responde en español, con prudencia y sin inventar. Analiza este perfil local y propone hasta cinco acciones concretas de limpieza, métricas o visualizaciones. Si el usuario ha pedido una operación, explica cómo ejecutarla con los campos disponibles y no inventes columnas. Si hay coordenadas, recomienda un mapa apropiado. No afirmes causalidad. Petición del usuario: ${request || 'sin petición adicional'}. Perfil: ${JSON.stringify(profile)}`;
  const enhancedPrompt = prompt.replace('"aggregation":"sum|avg|count"', '"aggregation":"sum|avg|median|min|max|count|distinct"');
  const answer = await state.aiSession.prompt(enhancedPrompt);
  setAIStatus('Gemini Nano listo', 'ready');
  return answer;
}

function parseLocalPlan(raw) {
  const candidate = String(raw || '').match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error('Gemini Nano no devolvió un plan JSON interpretable.');
  try { return JSON.parse(candidate); } catch { throw new Error('El plan de Gemini Nano no es un JSON válido.'); }
}

function applyLocalPlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('El plan local está vacío.');
  if (plan.action === 'treatment') {
    if (typeof plan.command !== 'string' || !applyAssistantDataOperation(plan.command)) throw new Error('El plan propone un tratamiento que no ha podido validarse localmente.');
    return;
  }
  if (plan.action !== 'chart') throw new Error('El plan debe indicar una visualización o un tratamiento.');
  const chartType = CHART_TYPES.includes(plan.chartType) ? plan.chartType : '';
  const xField = typeof plan.xField === 'string' && hasColumn(plan.xField) ? plan.xField : '';
  const yField = typeof plan.yField === 'string' && hasColumn(plan.yField) ? plan.yField : '';
  if (!chartType || !xField || !yField) throw new Error('El plan usa un tipo o campos que no existen en este conjunto.');
  if (['scatter', 'heatmap'].includes(chartType) && (!state.columns.find(column => column.name === xField && column.type === 'number') || !state.columns.find(column => column.name === yField && column.type === 'number'))) throw new Error('Esta visualización necesita dos campos numéricos.');
  if (['map', 'bubble-map', 'density-map'].includes(chartType) && (!coordinates().longitude || !coordinates().latitude || xField !== coordinates().longitude || yField !== coordinates().latitude)) throw new Error('El mapa debe usar las coordenadas detectadas en el conjunto.');
  const seriesField = typeof plan.seriesField === 'string' && hasColumn(plan.seriesField) && plan.seriesField !== xField ? plan.seriesField : '';
  const secondaryField = typeof plan.secondaryField === 'string' && hasColumn(plan.secondaryField, 'number') && plan.secondaryField !== yField ? plan.secondaryField : '';
  if (['grouped-bar', 'stacked-bar', 'stacked-area'].includes(chartType) && !seriesField) throw new Error('Esta visualización necesita un campo de serie distinto de la dimensión.');
  if (chartType === 'sankey' && (!seriesField || seriesField === xField)) throw new Error('El Sankey necesita campos origen y destino distintos.');
  if (chartType === 'combo' && !secondaryField) throw new Error('El gráfico combinado necesita una segunda métrica numérica distinta.');
  if (chartType === 'correlation' && (!state.columns.find(column => column.name === xField && column.type === 'number') || !state.columns.find(column => column.name === yField && column.type === 'number'))) throw new Error('La matriz de correlación necesita campos numéricos.');
  const aggregation = AGGREGATIONS.includes(plan.aggregation) ? plan.aggregation : 'count';
  const chartSort = SORT_MODES.includes(plan.chartSort) ? plan.chartSort : 'original';
  const title = typeof plan.title === 'string' && plan.title.trim() ? plan.title.trim().slice(0, 80) : 'Visualización asistida por Gemini Nano';
  state.chartType = chartType;
  state.xField = xField;
  state.yField = yField;
  state.secondaryField = secondaryField;
  state.seriesField = seriesField;
  state.aggregation = aggregation;
  state.chartSort = chartSort;
  state.chartTitle = title;
  state.dashboard.cards.push({ id: `gemini-${Date.now()}`, type: 'chart', title, chartType, xField, yField, secondaryField, seriesField, aggregation, mapBase: state.mapBase || 'osm', chartSort });
  state.activeTab = 'overview';
  renderAll();
  announce(`Plan de Gemini Nano aplicado: ${CHART_LABELS[chartType]}.`);
}

function assistantFieldMatches(command) {
  const normalized = command.toLocaleLowerCase('es');
  return state.columns.filter(column => normalized.includes(String(column.name).toLocaleLowerCase('es')));
}

function buildAssistantPlan(command) {
  const text = String(command || '').trim();
  const normalized = text.toLocaleLowerCase('es');
  const matches = assistantFieldMatches(text);
  const numeric = analysisNumericColumns();
  const geo = coordinates();
  const flow = bestFlowFields();
  const temporal = state.columns.find(column => column.type === 'date' || /^(year|año|date|fecha|time|period|periodo)$/i.test(column.name));
  const dimension = matches.find(column => column.type === 'text' || column.type === 'date')?.name || state.columns.find(column => column.type === 'text')?.name || state.xField;
  const metric = matches.find(column => column.type === 'number' && !/^(id|_row_id|latitude|longitude|year|año)$/i.test(column.name))?.name || metricField();
  let chartType = 'bar';
  let xField = dimension;
  let yField = metric || state.yField;
  let aggregation = 'sum';
  if (/sankey|flujo|origen.*destino|source.*target|procedencia.*destino/.test(normalized) && numeric.length) { chartType = 'sankey'; xField = flow.source || dimension; yField = metric; }
  else if (/barras?\s+apilad|stacked/.test(normalized)) chartType = 'stacked-bar';
  else if (/area\s+apilad|área\s+apilad|stacked\s+area|composici[oó]n\s+temporal/.test(normalized)) chartType = 'stacked-area';
  else if (/combinad|mixto|barras?\s+y\s+l[ií]nea|combo/.test(normalized) && numeric.length >= 2) { chartType = 'combo'; xField = temporal?.name || dimension; yField = numeric[0].name; }
  else if (/proyecci[oó]n|previsi[oó]n|pron[oó]stico|forecast|tendencia futura/.test(normalized) && numeric.length) { chartType = 'forecast'; xField = temporal?.name || dimension; yField = metric; }
  else if (/matriz.*correl|correlaci[oó]n.*matriz/.test(normalized) && numeric.length >= 2) { chartType = 'correlation'; xField = numeric[0].name; yField = numeric[1].name; aggregation = 'count'; }
  else if (/barras?\s+agrupad|grouped|comparar\s+por/.test(normalized)) chartType = 'grouped-bar';
  else if (/pareto|80\/20/.test(normalized)) chartType = 'pareto';
  else if (/embudo|funnel/.test(normalized)) chartType = 'funnel';
  else if (/cascada|waterfall|puente/.test(normalized)) chartType = 'waterfall';
  else if (/radar|araña/.test(normalized)) chartType = 'radar';
  else if (/treemap|árbol|rectángulo/.test(normalized)) chartType = 'treemap';
  else if (/calor|heatmap|bivariad/.test(normalized) && numeric.length >= 2) { chartType = 'heatmap'; xField = matches.find(column => column.type === 'number')?.name || numeric[0].name; yField = matches.filter(column => column.type === 'number')[1]?.name || numeric[1].name; aggregation = 'count'; }
  else if (/mapa|espacial|geogr[aá]fic|ubicaci[oó]n/.test(normalized) && geo.longitude && geo.latitude) { chartType = /densidad|concentraci[oó]n|cuadr[ií]cula/.test(normalized) ? 'density-map' : 'map'; xField = geo.longitude; yField = geo.latitude; aggregation = 'count'; }
  else if (/dispersi[oó]n|correlaci[oó]n|relaci[oó]n/.test(normalized) && numeric.length >= 2) { chartType = 'scatter'; xField = matches.find(column => column.type === 'number')?.name || numeric[0].name; yField = matches.filter(column => column.type === 'number')[1]?.name || numeric[1].name; }
  else if (/histograma|distribuci[oó]n/.test(normalized)) { chartType = 'histogram'; xField = dimension; yField = matches.find(column => column.type === 'number')?.name || metric; }
  else if (/caja|bigotes|variabilidad|at[ií]pic/.test(normalized)) chartType = 'boxplot';
  else if (/anillo|proporci[oó]n|porcentaje|composici[oó]n/.test(normalized)) chartType = 'donut';
  else if (/a[áa]rea/.test(normalized)) chartType = 'area';
  else if (/l[ií]nea|evoluci[oó]n|tendencia|temporal|serie/.test(normalized)) { chartType = 'line'; xField = temporal?.name || dimension; }
  else if (/mediana|median/.test(normalized)) aggregation = 'median';
  else if (/m[ií]nimo|min(?:imum)?/.test(normalized)) aggregation = 'min';
  else if (/m[aá]ximo|max(?:imum)?/.test(normalized)) aggregation = 'max';
  else if (/distint|[uú]nic|unique/.test(normalized)) aggregation = 'distinct';
  else if (/recuento|contar|cu[aá]ntos/.test(normalized)) aggregation = 'count';
  if (chartType === 'histogram') xField = yField;
  if (chartType === 'line' && !temporal && !matches.some(column => column.type === 'date')) xField = dimension;
  let seriesField = '';
  if (['grouped-bar', 'stacked-bar', 'stacked-area'].includes(chartType)) seriesField = bestSeriesField(xField);
  if (chartType === 'sankey') seriesField = flow.target || bestSeriesField(xField);
  const secondaryField = chartType === 'combo' ? numeric.find(column => column.name !== yField)?.name || bestSecondaryField(yField) : '';
  const title = text ? text.replace(/\s+/g, ' ').slice(0, 80) : 'Visualización asistida';
  return { chartType, xField, yField, secondaryField, seriesField, aggregation, chartSort: /ranking|mayor|orden/.test(normalized) ? 'value-desc' : 'original', title };
}

function cloneRows(rows) {
  return rows.map(row => ({ ...row }));
}

function rememberTransformation(label) {
  transformationHistory.push({
    label,
    rows: cloneRows(state.rows),
    meta: { name: state.datasetName, kind: state.sourceKind, detail: state.sourceDetail },
    filters: JSON.parse(JSON.stringify(state.filters)),
    search: state.search,
    activeTab: state.activeTab,
    xField: state.xField,
    yField: state.yField,
    secondaryField: state.secondaryField,
    chartType: state.chartType,
    mapBase: state.mapBase || 'osm',
    chartSort: state.chartSort,
    chartTitle: state.chartTitle,
    aggregation: state.aggregation,
    dashboard: JSON.parse(JSON.stringify(state.dashboard))
  });
  if (transformationHistory.length > 5) transformationHistory.shift();
}

function restoreTransformation(snapshot) {
  loadRows(snapshot.rows, snapshot.meta);
  state.filters = sanitizeFilters(snapshot.filters);
  state.search = typeof snapshot.search === 'string' ? snapshot.search : '';
  state.xField = safeField(snapshot.xField, state.xField);
  state.yField = safeField(snapshot.yField, state.yField, 'number');
  state.secondaryField = hasColumn(snapshot.secondaryField, 'number') && snapshot.secondaryField !== state.yField ? snapshot.secondaryField : '';
  state.chartType = CHART_TYPES.includes(snapshot.chartType) ? snapshot.chartType : 'bar';
  state.mapBase = MAP_BASES[snapshot.mapBase] ? snapshot.mapBase : 'osm';
  state.chartSort = SORT_MODES.includes(snapshot.chartSort) ? snapshot.chartSort : 'original';
  state.chartTitle = typeof snapshot.chartTitle === 'string' && snapshot.chartTitle.trim() ? snapshot.chartTitle : 'Visualización principal';
  state.aggregation = AGGREGATIONS.includes(snapshot.aggregation) ? snapshot.aggregation : 'sum';
  state.dashboard = sanitizeDashboard(snapshot.dashboard);
  state.activeTab = safeTab(snapshot.activeTab);
  applyFilters();
  renderAll();
}

function undoLastTransformation() {
  const snapshot = transformationHistory.pop();
  if (!snapshot) { announce('No hay ninguna transformación local que deshacer.', 'error'); return; }
  restoreTransformation(snapshot);
  announce(`Se ha deshecho: ${snapshot.label}.`);
}

function reloadTransformedRows(rows, detail) {
  const dashboard = JSON.parse(JSON.stringify(state.dashboard));
  loadRows(rows, { name: state.datasetName, kind: state.sourceKind, detail: `${state.sourceDetail} ${detail}`.trim() });
  state.dashboard = sanitizeDashboard(dashboard);
  state.activeTab = 'overview';
  renderAll();
}

function explicitFillValue(command) {
  const numeric = String(command).match(/\bcon\s+(-?\d+(?:[.,]\d+)?)\b/i);
  if (numeric) return toNumber(numeric[1]);
  const text = String(command).match(/\bcon\s+["“']([^"”']+)["”']/i);
  return text ? text[1].trim() : null;
}

function modalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase('es');
}

function modeValue(rows, field) {
  const counts = new Map();
  rows.map(row => row[field]).filter(value => !isMissing(value)).forEach(value => {
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Desconocido';
}

function meanValue(rows, field) {
  const values = rows.map(row => toNumber(row[field])).filter(value => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function applyAssistantDataOperation(command) {
  const text = String(command || '').trim();
  const normalized = modalize(text);
  if (!normalized) return false;
  const matches = assistantFieldMatches(text);

  if (/duplicad|repetid/.test(normalized)) {
    const uniqueRows = [];
    const seen = new Set();
    state.rows.forEach(row => { const key = JSON.stringify(row); if (!seen.has(key)) { seen.add(key); uniqueRows.push(row); } });
    if (uniqueRows.length === state.rows.length) { announce('No se han encontrado duplicados exactos.'); return true; }
    const removed = state.rows.length - uniqueRows.length;
    rememberTransformation('Eliminar duplicados exactos');
    reloadTransformedRows(uniqueRows, `Se eliminaron ${format(removed, 0)} duplicados exactos.`);
    announce(`Se eliminaron ${format(removed, 0)} duplicados exactos.`);
    return true;
  }

  if (/(elimina|quita|borra).*(vac[ií]os?|nulos?|faltantes?)/.test(normalized)) {
    const fields = matches.length ? matches : [];
    const keptRows = state.rows.filter(row => fields.length ? fields.every(column => !isMissing(row[column.name])) : state.columns.some(column => !isMissing(row[column.name])));
    if (keptRows.length === state.rows.length) { announce('No se han encontrado filas vacías con los campos indicados.'); return true; }
    rememberTransformation(fields.length ? `Eliminar filas con vacíos en ${fields.map(column => column.name).join(', ')}` : 'Eliminar filas completamente vacías');
    const removed = state.rows.length - keptRows.length;
    reloadTransformedRows(keptRows, `Se eliminaron ${format(removed, 0)} filas con valores faltantes.`);
    announce(`Se eliminaron ${format(removed, 0)} filas con valores faltantes.`);
    return true;
  }

  if (/(rellena|imputa|completa).*(vac[ií]os?|nulos?|faltantes?)/.test(normalized)) {
    const fields = matches.length ? matches : state.columns;
    const explicit = explicitFillValue(text);
    const nextRows = state.rows.map(row => {
      const next = { ...row };
      fields.forEach(column => {
        if (!isMissing(next[column.name])) return;
        next[column.name] = explicit !== null ? explicit : column.type === 'number' ? meanValue(state.rows, column.name) : modeValue(state.rows, column.name);
      });
      return next;
    });
    const changed = nextRows.some((row, index) => JSON.stringify(row) !== JSON.stringify(state.rows[index]));
    if (!changed) { announce('No se han encontrado valores faltantes que rellenar.'); return true; }
    rememberTransformation(fields.length ? `Rellenar vacíos en ${fields.map(column => column.name).join(', ')}` : 'Rellenar valores faltantes');
    reloadTransformedRows(nextRows, 'Valores faltantes rellenados con media, moda o valor indicado.');
    announce('Valores faltantes rellenados localmente.');
    return true;
  }

  if (/(limpia.*espacios|quita.*espacios|espacios.*texto|trim)/.test(normalized)) {
    const fields = (matches.length ? matches : state.columns.filter(column => column.type === 'text'));
    const nextRows = state.rows.map(row => {
      const next = { ...row };
      fields.forEach(column => { if (typeof next[column.name] === 'string') next[column.name] = next[column.name].trim(); });
      return next;
    });
    const changed = nextRows.some((row, index) => JSON.stringify(row) !== JSON.stringify(state.rows[index]));
    if (!changed) { announce('No se han encontrado espacios exteriores que limpiar.'); return true; }
    rememberTransformation(fields.length ? `Limpiar espacios en ${fields.map(column => column.name).join(', ')}` : 'Limpiar espacios de texto');
    reloadTransformedRows(nextRows, 'Espacios exteriores recortados en campos de texto.');
    announce('Espacios exteriores limpiados localmente.');
    return true;
  }

  if (/normaliza|estandariza/.test(normalized)) {
    const field = matches.find(column => column.type === 'number')?.name || metricField();
    if (!field) { announce('Indica un campo numérico para normalizar, por ejemplo: normaliza finds.', 'error'); return true; }
    const values = state.rows.map(row => toNumber(row[field])).filter(value => value !== null);
    if (!values.length) { announce(`El campo ${field} no contiene valores numéricos normalizables.`, 'error'); return true; }
    const min = Math.min(...values); const max = Math.max(...values); const normalizedField = `${field}_normalizado`;
    let target = normalizedField; let suffix = 2;
    while (state.columns.some(column => column.name === target)) target = `${normalizedField}_${suffix++}`;
    const nextRows = state.rows.map(row => { const value = toNumber(row[field]); return { ...row, [target]: value === null ? null : min === max ? 0.5 : (value - min) / (max - min) }; });
    rememberTransformation(`Normalizar ${field}`);
    reloadTransformedRows(nextRows, `Se creó ${target} en el intervalo 0–1.`);
    announce(`Campo ${target} creado mediante normalización min–max.`);
    return true;
  }

  if (/at[ií]pic|outlier|intercuart[ií]l/.test(normalized)) {
    const field = matches.find(column => column.type === 'number')?.name || metricField();
    if (!field) { announce('Indica un campo numérico para detectar atípicos.', 'error'); return true; }
    const values = state.rows.map(row => toNumber(row[field])).filter(value => value !== null).sort((a, b) => a - b);
    if (values.length < 4) { announce('Se necesitan al menos cuatro valores numéricos para estimar atípicos por IQR.', 'error'); return true; }
    const percentile = ratio => values[Math.floor((values.length - 1) * ratio)];
    const q1 = percentile(.25);
    const q3 = percentile(.75);
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const base = field + '_atipico';
    let target = base;
    let suffix = 2;
    while (state.columns.some(column => column.name === target)) target = base + '_' + suffix++;
    const nextRows = state.rows.map(row => {
      const value = toNumber(row[field]);
      return { ...row, [target]: value === null ? null : value < lower || value > upper ? 'atípico' : 'normal' };
    });
    rememberTransformation('Detectar atípicos en ' + field);
    reloadTransformedRows(nextRows, 'Se creó ' + target + ' mediante límites IQR [' + format(lower, 2) + ', ' + format(upper, 2) + '].');
    announce('Campo ' + target + ' creado con clasificación IQR.');
    return true;
  }

  if (/segmenta|categoriza|clasifica/.test(normalized)) {
    const field = matches.find(column => column.type === 'number')?.name || metricField();
    if (!field) { announce('Indica un campo numérico para segmentar.', 'error'); return true; }
    const values = state.rows.map(row => toNumber(row[field])).filter(value => value !== null);
    if (!values.length) { announce('El campo ' + field + ' no contiene valores numéricos segmentables.', 'error'); return true; }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = (max - min) / 3;
    const base = field + '_segmento';
    let target = base;
    let suffix = 2;
    while (state.columns.some(column => column.name === target)) target = base + '_' + suffix++;
    const nextRows = state.rows.map(row => {
      const value = toNumber(row[field]);
      if (value === null) return { ...row, [target]: null };
      if (max === min) return { ...row, [target]: 'Medio' };
      return { ...row, [target]: value < min + step ? 'Bajo' : value < min + step * 2 ? 'Medio' : 'Alto' };
    });
    rememberTransformation('Segmentar ' + field);
    reloadTransformedRows(nextRows, 'Se creó ' + target + ' en tres tramos Bajo/Medio/Alto.');
    announce('Campo ' + target + ' creado con segmentación local.');
    return true;
  }

  return false;
}

function executeAssistantCommand(command) {
  if (applyAssistantDataOperation(command)) return;
  const plan = buildAssistantPlan(command);
  if (!plan.xField || !plan.yField) throw new Error('No he encontrado campos suficientes para construir esa visualización.');
  state.chartType = plan.chartType;
  state.xField = plan.xField;
  state.yField = plan.yField;
  state.secondaryField = plan.secondaryField || '';
  state.seriesField = plan.seriesField || '';
  state.aggregation = plan.aggregation;
  state.chartSort = plan.chartSort;
  state.chartTitle = plan.title;
  state.dashboard.cards.push({ id: `assistant-${Date.now()}`, type: 'chart', title: plan.title, chartType: plan.chartType, xField: plan.xField, yField: plan.yField, secondaryField: plan.secondaryField || '', seriesField: plan.seriesField || '', aggregation: plan.aggregation, mapBase: state.mapBase || 'osm', chartSort: plan.chartSort });
  state.activeTab = 'overview';
  renderAll();
  announce(`Orden aplicada: ${CHART_LABELS[plan.chartType]} con ${plan.xField} y ${plan.yField}.`);
}

function applyRecommendedDashboard() {
  state.dashboard = defaultDashboard();
  state.activeTab = 'overview';
  renderAll();
  announce('Análisis automático aplicado con KPIs, tendencia, relación entre métricas, mapas y tabla según los campos detectados.');
}

function showAssistantModal() {
  document.querySelector('#assistant-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="assistant-modal" class="modal-backdrop"><div class="modal-card assistant-card" role="dialog" aria-modal="true" aria-labelledby="assistant-title" tabindex="-1"><div class="panel-heading"><div><span class="eyebrow">Asistencia local</span><h2 id="assistant-title">Analista de tu conjunto</h2></div><button class="remove-card" data-modal-action="close" aria-label="Cerrar ventana">×</button></div><p class="helper">Los cálculos y tratamientos se ejecutan en este navegador. Gemini Nano solo se usa si Chrome lo ofrece; no se envían filas a un servidor.</p><label for="assistant-command">Orden para el dashboard o los datos<span><textarea id="assistant-command" rows="3" maxlength="240" placeholder="Ej.: crea un mapa de calor de finds y area_ha · normaliza finds"></textarea></span></label><div class="assistant-actions"><button class="button button-primary" data-modal-action="execute">Ejecutar orden local</button><button class="button button-soft" data-modal-action="insights">Calcular resumen completo</button><button class="button button-ghost" data-modal-action="recommend">Montar análisis automático</button><button class="button button-ghost" data-modal-action="nano-apply">Interpretar y aplicar con Gemini Nano</button><button class="button button-ghost" data-modal-action="nano">Preguntar a Gemini Nano</button></div><div id="assistant-result" class="assistant-result" aria-live="polite"><span class="muted">La orden local puede crear una visual o preparar datos de forma reversible. Gemini Nano puede interpretar y aplicar una orden validada si el navegador lo ofrece.</span></div><div class="provenance"><strong>Privacidad y límites</strong><span>El asistente recibe solo un perfil compacto para interpretar el conjunto. Verifica siempre definiciones, unidades, proyección y calidad de los datos antes de publicar conclusiones.</span></div></div></div>`);
  const modal = document.querySelector('#assistant-modal');
  const previousFocus = document.activeElement;
  const close = () => { modal?.remove(); previousFocus?.focus?.(); };
  modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('[data-modal-action="close"]')) close(); });
  modal.querySelector('[data-modal-action="insights"]').addEventListener('click', () => { modal.querySelector('#assistant-result').innerHTML = `<ul class="assistant-list">${deterministicInsights().map(item => `<li>${esc(item)}</li>`).join('')}</ul>`; });
  modal.querySelector('[data-modal-action="recommend"]').addEventListener('click', () => { close(); applyRecommendedDashboard(); });
  modal.querySelector('[data-modal-action="execute"]').addEventListener('click', () => {
    try { executeAssistantCommand(modal.querySelector('#assistant-command').value); close(); }
    catch (error) { modal.querySelector('#assistant-result').innerHTML = `<div class="alert alert-error">${esc(error.message)}</div>`; }
  });
  modal.querySelector('[data-modal-action="nano-apply"]').addEventListener('click', async event => {
    const button = event.currentTarget;
    const result = modal.querySelector('#assistant-result');
    const command = modal.querySelector('#assistant-command').value.trim();
    button.disabled = true;
    result.innerHTML = '<span class="muted">Gemini Nano está interpretando la orden y comprobando los campos…</span>';
    try { applyLocalPlan(parseLocalPlan(await askLocalModel(command, 'plan'))); close(); }
    catch (error) { result.innerHTML = `<div class="alert alert-error">${esc(error.message)}<br><small>Puedes usar la ejecución local determinista o el resumen sin IA.</small></div>`; }
    finally { button.disabled = false; }
  });
  modal.querySelector('[data-modal-action="nano"]').addEventListener('click', async event => {
    const button = event.currentTarget;
    const result = modal.querySelector('#assistant-result');
    button.disabled = true;
    result.innerHTML = '<span class="muted">Comprobando compatibilidad y preparando el modelo…</span>';
    try { result.innerHTML = `<div class="assistant-answer">${esc(await askLocalModel(modal.querySelector('#assistant-command').value.trim())).replace(/\n/g, '<br>')}</div>`; }
    catch (error) { result.innerHTML = `<div class="alert alert-error">${esc(error.message)}<br><small>El resumen determinista sigue disponible y no requiere IA.</small></div>`; }
    finally { button.disabled = false; }
  });
  modal.focus();
}

function init() {
  state.activeTab = initialTab;
  shellMarkup();
  state.dashboard = defaultDashboard();
  renderAll();
  bind();
  detectLocalAI();
}

function download(name, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 500);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCSV() {
  const header = state.columns.map(column => csvCell(column.name)).join(',');
  const body = state.filtered.map(row => state.columns.map(column => csvCell(row[column.name])).join(',')).join('\n');
  download(`${state.datasetName.replace(/[^\wáéíóúüñ-]+/gi, '-').slice(0, 48) || 'datos'}-filtrado.csv`, `${header}\n${body}`, 'text/csv;charset=utf-8');
  announce('CSV exportado con las filas visibles.');
}

function exportJSON() {
  const payload = { format: 'data-insight-data', version: 1, exportedAt: new Date().toISOString(), dataset: state.datasetName, source: state.sourceDetail, filters: state.filters, search: state.search, columns: state.columns, rows: state.filtered };
  download(`${state.datasetName.replace(/[^\wáéíóúüñ-]+/gi, '-').slice(0, 48) || 'datos'}-filtrado.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  announce('JSON exportado con la población visible y su contexto de filtros.');
}

function exportSVG() {
  const svg = document.querySelector('.analysis-result .chart-svg');
  if (!svg) { announce(document.querySelector('.analysis-result .leaflet-chart-host') ? 'Los mapas Leaflet son interactivos; usa la captura del navegador para conservar sus teselas.' : 'No hay una visualización SVG activa para exportar.', 'error'); return; }
  const serialized = new XMLSerializer().serializeToString(svg);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
  const slug = (state.chartTitle || 'visualizacion').replace(/[^\wáéíóúüñ-]+/gi, '-').slice(0, 48) || 'visualizacion';
  download(`${slug}.svg`, xml, 'image/svg+xml;charset=utf-8');
  announce('SVG exportado con la visualización activa y sus etiquetas.');
}

function saveProject() {
  const project = { format: 'data-insight-project', version: 6, savedAt: new Date().toISOString(), meta: { name: state.datasetName, kind: state.sourceKind, detail: state.sourceDetail }, rows: state.rows, filters: state.filters, search: state.search, activeTab: state.activeTab, xField: state.xField, yField: state.yField, secondaryField: state.secondaryField, seriesField: state.seriesField, chartType: state.chartType, mapBase: state.mapBase || 'osm', chartSort: state.chartSort, chartTitle: state.chartTitle, aggregation: state.aggregation, sortKey: state.sortKey, sortDir: state.sortDir, tableLimit: state.tableLimit, dashboard: state.dashboard };
  download(`${state.datasetName.replace(/[^\wáéíóúüñ-]+/gi, '-').slice(0, 48) || 'proyecto'}.data-insight.json`, JSON.stringify(project, null, 2), 'application/json;charset=utf-8');
  announce('Proyecto guardado. Puedes abrirlo de nuevo desde la barra lateral.');
}

function resetFromDemo() {
  loadRows(DEMO_ROWS, { name: 'Muestra arqueológica local', kind: 'synthetic', detail: 'Datos sintéticos de demostración. No representan un inventario oficial.' });
  transformationHistory.length = 0;
  state.dashboard = defaultDashboard();
  state.activeTab = 'overview';
  announce('Se ha restaurado la muestra local.');
  renderAll();
}

async function importDataset(file) {
  if (!file) return;
  try {
    const rows = parseAny(await file.text(), file.name);
    if (!rows.length) throw new Error('No se encontraron filas interpretables.');
    loadRows(rows, { name: file.name, kind: 'local', detail: `Archivo local ${file.name}. Procesado íntegramente en este navegador.` });
    transformationHistory.length = 0;
    state.dashboard = defaultDashboard();
    state.activeTab = 'overview';
    announce(`${format(rows.length, 0)} filas cargadas desde ${file.name}.`);
    renderAll();
  } catch (error) { announce(error.message || 'No se pudo leer el archivo.', 'error'); }
}

function showPasteModal() {
  document.querySelector('#paste-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="paste-modal" class="modal-backdrop"><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="paste-title" tabindex="-1"><div class="panel-heading"><div><span class="eyebrow">Entrada local</span><h2 id="paste-title">Pega CSV, TSV o JSON</h2></div><button class="remove-card" data-action="close-paste" aria-label="Cerrar ventana">×</button></div><label class="sr-only" for="paste-data">Datos CSV, TSV o JSON</label><textarea id="paste-data" rows="12" placeholder="provincia,valor\nCuenca,12\nToledo,18"></textarea><div class="modal-actions"><button class="button button-ghost" data-action="close-paste">Cancelar</button><button class="button button-primary" data-action="apply-paste">Usar estos datos</button></div></div></div>`);
  const modal = document.querySelector('#paste-modal');
  const previousFocus = document.activeElement;
  const close = () => { document.removeEventListener('keydown', onKeyDown); modal?.remove(); previousFocus?.focus?.(); };
  const onKeyDown = event => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKeyDown);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  modal.querySelectorAll('[data-action="close-paste"]').forEach(button => button.addEventListener('click', close));
  modal.querySelector('[data-action="apply-paste"]').addEventListener('click', () => {
    try {
      const rows = parseAny(modal.querySelector('#paste-data').value, 'pasted.csv');
      if (!rows.length) throw new Error('No se encontraron filas.');
      loadRows(rows, { name: 'Datos pegados', kind: 'pasted', detail: 'Contenido pegado por el usuario y procesado localmente.' });
      transformationHistory.length = 0;
      state.dashboard = defaultDashboard();
      state.activeTab = 'overview';
      close();
      announce(`${format(rows.length, 0)} filas pegadas y listas para analizar.`);
      renderAll();
    } catch (error) { announce(error.message || 'No se pudieron interpretar los datos.', 'error'); }
  });
  modal.querySelector('#paste-data').focus();
}

async function importProject(file) {
  if (!file) return;
  try {
    const project = JSON.parse(await file.text());
    if (project.format !== 'data-insight-project' || !Array.isArray(project.rows) || project.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('El archivo no es un proyecto Data Insight válido.');
    const meta = project.meta && typeof project.meta === 'object' ? project.meta : {};
    const kind = ['synthetic', 'pasted', 'local'].includes(meta.kind) ? meta.kind : 'local';
    loadRows(project.rows, { name: typeof meta.name === 'string' && meta.name.trim() ? meta.name : file.name, kind, detail: typeof meta.detail === 'string' ? meta.detail : 'Proyecto local procesado en este navegador.' });
    transformationHistory.length = 0;
    state.filters = sanitizeFilters(project.filters);
    state.search = typeof project.search === 'string' ? project.search.slice(0, 500) : '';
    state.xField = safeField(project.xField, state.xField);
    state.yField = safeField(project.yField, state.yField, 'number');
    state.secondaryField = hasColumn(project.secondaryField, 'number') && project.secondaryField !== state.yField ? project.secondaryField : '';
    state.seriesField = hasColumn(project.seriesField) && project.seriesField !== state.xField ? project.seriesField : '';
    state.chartType = CHART_TYPES.includes(project.chartType) ? project.chartType : 'bar';
    state.mapBase = MAP_BASES[project.mapBase] ? project.mapBase : 'osm';
    state.chartSort = SORT_MODES.includes(project.chartSort) ? project.chartSort : 'original';
    state.chartTitle = typeof project.chartTitle === 'string' && project.chartTitle.trim() ? project.chartTitle.trim().slice(0, 80) : 'Visualización principal';
    state.aggregation = AGGREGATIONS.includes(project.aggregation) ? project.aggregation : 'sum';
    state.sortKey = hasColumn(project.sortKey) ? project.sortKey : '';
    state.sortDir = project.sortDir === 'desc' ? 'desc' : 'asc';
    state.tableLimit = Number.isFinite(project.tableLimit) ? Math.max(20, project.tableLimit) : 20;
    state.dashboard = sanitizeDashboard(project.dashboard);
    state.activeTab = safeTab(project.activeTab);
    applyFilters();
    announce('Proyecto abierto correctamente.');
    renderAll();
  } catch (error) { announce(error.message || 'No se pudo abrir el proyecto.', 'error'); }
}

function addCalculatedField() {
  const name = window.prompt('Nombre del campo calculado (sin espacios):', 'indice');
  if (!name) return;
  if (!/^[A-Za-z_$][\w$]*$/.test(name) || state.columns.some(column => column.name === name)) { announce('Usa un nombre único sin espacios ni símbolos especiales.', 'error'); return; }
  const formula = window.prompt('Fórmula aritmética usando los nombres de campos. Ejemplo: finds / area_ha', 'finds / area_ha');
  if (!formula || !/^[\w$\s+\-*/().]+$/.test(formula)) { announce('La fórmula solo puede contener campos, números y operaciones aritméticas.', 'error'); return; }
  const names = state.columns.map(column => column.name).filter(field => /^[A-Za-z_$][\w$]*$/.test(field));
  const tokens = formula.match(/[A-Za-z_$][\w$]*/g) || [];
  if (tokens.some(token => !names.includes(token))) { announce('La fórmula usa un campo que no existe o cuyo nombre no es compatible.', 'error'); return; }
  try {
    const calculate = Function(...names, `return (${formula});`);
    const nextRows = state.rows.map(row => { const result = calculate(...names.map(field => toNumber(row[field]) ?? 0)); return { ...row, [name]: Number.isFinite(result) ? result : null }; });
    rememberTransformation(`Añadir campo calculado ${name}`);
    state.rows = nextRows;
    rebuildColumns();
    state.dashboard = defaultDashboard();
    applyFilters();
    announce(`Campo calculado “${name}” añadido localmente.`);
    renderAll();
  } catch { announce('No se pudo evaluar la fórmula.', 'error'); }
}

function updateFilter(input) {
  const key = input.dataset.filterKey;
  const kind = input.dataset.filterKind;
  const value = input.value;
  const filter = { ...(state.filters[key] || {}) };
  if (kind === 'value') { if (value === '') delete filter.value; else filter.value = value; }
  if (kind === 'contains') { if (value === '') delete filter.contains; else filter.contains = value; }
  if (kind === 'min') { if (value === '') delete filter.min; else filter.min = value; }
  if (kind === 'max') { if (value === '') delete filter.max; else filter.max = value; }
  if (!Object.keys(filter).length) delete state.filters[key]; else state.filters[key] = filter;
  renderAll();
}

function moveCard(cardId, delta) {
  const cards = state.dashboard.cards;
  const from = cards.findIndex(card => card.id === cardId);
  const to = Math.min(cards.length - 1, Math.max(0, from + Number(delta)));
  if (from < 0 || from === to) return;
  const [card] = cards.splice(from, 1);
  cards.splice(to, 0, card);
  renderAll();
}

function resizeCard(cardId, axis, delta) {
  const card = state.dashboard.cards.find(item => item.id === cardId);
  if (!card) return;
  const defaults = layoutDefaults(card);
  if (axis === 'col') card.colSpan = safeSpan((card.colSpan || defaults.colSpan) + Number(delta), defaults.colSpan);
  if (axis === 'row') card.rowSpan = safeSpan((card.rowSpan || defaults.rowSpan) + Number(delta), defaults.rowSpan, 4);
  renderAll();
}

function autoOrganizeDashboard() {
  const cards = state.dashboard.cards.length ? state.dashboard.cards : defaultDashboard().cards;
  cards.sort((left, right) => cardSortRank(left) - cardSortRank(right));
  state.dashboard.cards = autoLayoutCards(cards);
  renderAll();
  announce('Dashboard autoorganizado y adaptado al tamaño actual de la pantalla.');
}

function selectOptions(values, selected) {
  return values.map(value => '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(value) + '</option>').join('');
}

function showCardEditor(card) {
  if (!card || card.type !== 'chart') return;
  document.querySelector('#card-editor-modal')?.remove();
  const fields = state.columns.map(column => column.name);
  const chartOptions = Object.entries(CHART_LABELS).map(([value, label]) => '<option value="' + esc(value) + '"' + (value === card.chartType ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
  const seriesOptions = '<option value="">Sin serie</option>' + selectOptions(fields, card.seriesField);
  const numericOptions = '<option value="">Sin segunda métrica</option>' + selectOptions(state.columns.filter(column => column.type === 'number').map(column => column.name), card.secondaryField);
  const markup = '<div id="card-editor-modal" class="modal-backdrop"><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="card-editor-title" tabindex="-1"><div class="panel-heading"><div><span class="eyebrow">Personalizar visual</span><h2 id="card-editor-title">' + esc(card.title || 'Visualización') + '</h2></div><button class="remove-card" data-modal-action="close-card-editor" aria-label="Cerrar ventana">×</button></div><div class="editor-grid"><label>Título<input id="card-editor-name" type="text" maxlength="100" value="' + esc(card.title || '') + '"></label><label>Tipo<select id="card-editor-type">' + chartOptions + '</select></label><label>Mapa base<select id="card-editor-map-base">' + mapBaseOptions(card.mapBase || 'osm') + '</select></label><label>Dimensión / X<select id="card-editor-x">' + selectOptions(fields, card.xField) + '</select></label><label>Métrica / Y<select id="card-editor-y">' + selectOptions(fields, card.yField) + '</select></label><label>Métrica secundaria<select id="card-editor-secondary">' + numericOptions + '</select></label><label>Serie / color<select id="card-editor-series">' + seriesOptions + '</select></label><label>Agregación<select id="card-editor-aggregation">' + selectOptions(AGGREGATIONS, card.aggregation) + '</select></label><label>Orden<select id="card-editor-sort">' + selectOptions(SORT_MODES, card.chartSort) + '</select></label></div><p class="helper">El combinado usa barras y línea con dos métricas; las áreas apiladas y barras comparan una segunda dimensión. Los mapas necesitan longitud y latitud; la dispersión, el calor y la matriz necesitan campos numéricos. La base elegida se conserva en el proyecto.</p><div class="modal-actions"><button class="button button-ghost" data-modal-action="close-card-editor">Cancelar</button><button class="button button-primary" data-modal-action="save-card-editor">Guardar visual</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend', markup);
  const modal = document.querySelector('#card-editor-modal');
  const aggregationSelect = modal?.querySelector('#card-editor-aggregation');
  if (aggregationSelect) aggregationSelect.innerHTML = aggregationOptions(card.aggregation, numericColumns().length > 0);
  const close = () => modal?.remove();
  modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('[data-modal-action="close-card-editor"]')) close(); });
  modal.querySelector('[data-modal-action="save-card-editor"]').addEventListener('click', () => {
    card.title = modal.querySelector('#card-editor-name').value.trim() || 'Visualización';
    card.chartType = CHART_TYPES.includes(modal.querySelector('#card-editor-type').value) ? modal.querySelector('#card-editor-type').value : 'bar';
    card.mapBase = MAP_BASES[modal.querySelector('#card-editor-map-base').value] ? modal.querySelector('#card-editor-map-base').value : 'osm';
    card.xField = hasColumn(modal.querySelector('#card-editor-x').value) ? modal.querySelector('#card-editor-x').value : state.xField;
    card.yField = hasColumn(modal.querySelector('#card-editor-y').value) ? modal.querySelector('#card-editor-y').value : state.yField;
    card.secondaryField = hasColumn(modal.querySelector('#card-editor-secondary').value, 'number') && modal.querySelector('#card-editor-secondary').value !== card.yField ? modal.querySelector('#card-editor-secondary').value : '';
    card.seriesField = hasColumn(modal.querySelector('#card-editor-series').value) && modal.querySelector('#card-editor-series').value !== card.xField ? modal.querySelector('#card-editor-series').value : '';
    card.aggregation = AGGREGATIONS.includes(modal.querySelector('#card-editor-aggregation').value) ? modal.querySelector('#card-editor-aggregation').value : 'count';
    card.chartSort = SORT_MODES.includes(modal.querySelector('#card-editor-sort').value) ? modal.querySelector('#card-editor-sort').value : 'original';
    if (['map', 'bubble-map', 'density-map'].includes(card.chartType)) {
      const geo = coordinates();
      card.xField = geo.longitude || card.xField;
      card.yField = geo.latitude || card.yField;
      if (card.chartType === 'map' || !card.secondaryField) card.aggregation = 'count';
      card.seriesField = '';
    }
    if (['scatter', 'heatmap', 'correlation'].includes(card.chartType)) {
      const numbers = analysisNumericColumns();
      card.xField = numbers.find(column => column.name === card.xField)?.name || numbers[0]?.name || card.xField;
      card.yField = numbers.find(column => column.name === card.yField && column.name !== card.xField)?.name || numbers.find(column => column.name !== card.xField)?.name || card.yField;
      card.secondaryField = '';
      card.seriesField = '';
      if (card.chartType === 'correlation') card.aggregation = 'count';
    }
    if (card.chartType === 'sankey') {
      const flow = bestFlowFields();
      card.xField = flow.source || card.xField;
      card.seriesField = flow.target || card.seriesField;
    }
    state.dashboard = sanitizeDashboard(state.dashboard);
    close();
    renderAll();
    announce('Visual personalizada y guardada en el dashboard.');
  });
  modal.focus();
}

function bind() {
  const app = document.querySelector('.app-shell');
  let filterInputTimer = 0;
  app.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if (tab) { state.activeTab = tab; renderAll(); return; }
    const sortNode = event.target.closest('[data-sort-key]');
    if (sortNode) { const key = sortNode.dataset.sortKey; state.sortDir = state.sortKey === key && state.sortDir === 'asc' ? 'desc' : 'asc'; state.sortKey = key; renderAll(); return; }
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    if (action === 'assistant') { showAssistantModal(); return; }
    if (action === 'undo-transform') { undoLastTransformation(); return; }
    if (action === 'auto-dashboard') { state.dashboard = defaultDashboard(); state.activeTab = 'overview'; renderAll(); announce('Autodashboard compuesto según las dimensiones y métricas detectadas.'); return; }
    if (action === 'auto-layout') { autoOrganizeDashboard(); return; }
    if (action === 'move-card') { moveCard(actionNode.dataset.id, actionNode.dataset.delta); return; }
    if (action === 'resize-card') { resizeCard(actionNode.dataset.id, actionNode.dataset.axis, actionNode.dataset.delta); return; }
    if (action === 'configure-card') { showCardEditor(state.dashboard.cards.find(card => card.id === actionNode.dataset.id)); return; }
    if (action === 'add-chart') {
      state.dashboard.cards.push({ id: 'chart-' + Date.now(), type: 'chart', title: state.chartTitle?.trim() || state.yField + ' por ' + state.xField, chartType: state.chartType, xField: state.xField, yField: state.yField, secondaryField: state.secondaryField, seriesField: state.seriesField, aggregation: state.aggregation, mapBase: state.mapBase || 'osm', chartSort: state.chartSort });
      announce('Visual añadido al dashboard.');
      renderAll();
      return;
    }
    if (action === 'import') document.querySelector('#file-input').click();
    if (action === 'load-project') document.querySelector('#project-input').click();
    if (action === 'paste') showPasteModal();
    if (action === 'export') exportCSV();
    if (action === 'export-json') exportJSON();
    if (action === 'export-svg') exportSVG();
    if (action === 'save') saveProject();
    if (action === 'reset') resetFromDemo();
    if (action === 'reset-filters') { state.filters = {}; state.search = ''; renderAll(); announce('Filtros restablecidos.'); }
    if (action === 'remove-filter') { const key = actionNode.dataset.key; const part = actionNode.dataset.filterPart; if (state.filters[key]) { if (part) delete state.filters[key][part]; else delete state.filters[key]; if (!Object.keys(state.filters[key] || {}).length) delete state.filters[key]; } renderAll(); }
    if (action === 'reset-dashboard') { state.dashboard = defaultDashboard(); renderAll(); announce('Dashboard restablecido.'); }
    if (action === 'show-more') { state.tableLimit += 20; renderAll(); }
    if (action === 'add-calculated') addCalculatedField();
    if (action === 'apply-search') { state.search = document.querySelector('#search-input')?.value || ''; renderAll(); }
    if (action === 'add-table') { state.dashboard.cards.push({ id: `table-${Date.now()}`, type: 'table', title: 'Nueva tabla' }); announce('Tabla añadida al dashboard.'); renderAll(); }
    if (action === 'edit-card' || action === 'rename-card') { const card = state.dashboard.cards.find(item => item.id === actionNode.dataset.id); if (card) { const title = window.prompt('Título de la tarjeta:', card.title || 'Visualización'); if (title?.trim()) { card.title = title.trim(); renderAll(); } } }
    if (action === 'duplicate-card') { const card = state.dashboard.cards.find(item => item.id === actionNode.dataset.id); if (card) { state.dashboard.cards.push({ ...card, id: `${card.type}-${Date.now()}`, title: `${card.title || 'Tarjeta'} (copia)` }); announce('Tarjeta duplicada.'); renderAll(); } }
    if (action === 'remove-card') { state.dashboard.cards = state.dashboard.cards.filter(card => card.id !== actionNode.dataset.id); renderAll(); }
    if (action === 'clear-alert') { const alert = document.querySelector('#app-alert'); if (alert) alert.innerHTML = ''; }
    if (action === 'fullscreen') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
  });
  app.addEventListener('change', event => {
    if (event.target.id === 'file-input') { importDataset(event.target.files[0]); event.target.value = ''; }
    if (event.target.id === 'project-input') { importProject(event.target.files[0]); event.target.value = ''; }
    if (event.target.matches('[data-filter-kind]')) updateFilter(event.target);
    if (event.target.id === 'x-field') { state.xField = event.target.value; if (state.seriesField === state.xField) state.seriesField = ''; renderAll(); }
    if (event.target.id === 'y-field') { state.yField = event.target.value; if (state.secondaryField === state.yField) state.secondaryField = bestSecondaryField(state.yField); renderAll(); }
    if (event.target.id === 'secondary-field') { state.secondaryField = hasColumn(event.target.value, 'number') && event.target.value !== state.yField ? event.target.value : ''; renderAll(); }
    if (event.target.id === 'series-field') { state.seriesField = hasColumn(event.target.value) && event.target.value !== state.xField ? event.target.value : ''; renderAll(); }
    if (event.target.id === 'chart-type') { state.chartType = CHART_TYPES.includes(event.target.value) ? event.target.value : 'bar'; if (MAP_CHART_TYPES.includes(state.chartType)) { const geo = coordinates(); state.xField = geo.longitude || state.xField; state.yField = geo.latitude || state.yField; state.secondaryField = state.chartType === 'map' ? '' : bestSecondaryField(state.yField); state.seriesField = ''; state.aggregation = state.secondaryField ? 'sum' : 'count'; } if (['heatmap', 'scatter', 'correlation'].includes(state.chartType)) { const numbers = analysisNumericColumns(); state.xField = numbers[0]?.name || state.xField; state.yField = numbers[1]?.name || numbers[0]?.name || state.yField; state.secondaryField = ''; state.seriesField = ''; state.aggregation = ['heatmap', 'correlation'].includes(state.chartType) ? 'count' : state.aggregation; } if (['grouped-bar', 'stacked-bar', 'stacked-area'].includes(state.chartType)) state.seriesField = bestSeriesField(state.xField); if (state.chartType === 'sankey') { const flow = bestFlowFields(); state.xField = flow.source || state.xField; state.seriesField = flow.target || bestSeriesField(state.xField); } if (state.chartType === 'combo') { const numbers = analysisNumericColumns(); state.xField = state.xField || state.columns.find(column => column.type === 'text')?.name || ''; state.yField = numbers[0]?.name || state.yField; state.secondaryField = numbers.find(column => column.name !== state.yField)?.name || ''; state.seriesField = ''; } renderAll(); }
    if (event.target.id === 'map-base') { state.mapBase = MAP_BASES[event.target.value] ? event.target.value : 'osm'; renderAll(); }
    if (event.target.id === 'aggregation') { state.aggregation = event.target.value; renderAll(); }
    if (event.target.id === 'chart-sort') { state.chartSort = ['original', 'value-desc', 'value-asc'].includes(event.target.value) ? event.target.value : 'original'; renderAll(); }
    if (event.target.id === 'chart-title') { state.chartTitle = event.target.value.trim() || 'Visualización principal'; renderAll(); }
  });
  app.addEventListener('input', event => {
    if (!event.target.matches('[data-filter-kind]')) return;
    window.clearTimeout(filterInputTimer);
    const input = event.target;
    filterInputTimer = window.setTimeout(() => updateFilter(input), 250);
  });
  app.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.id === 'search-input') { state.search = event.target.value; renderAll(); } });
  app.addEventListener('dragstart', event => { const card = event.target.closest('[data-card-id]'); if (!card) return; app.dataset.dragCard = card.dataset.cardId; card.classList.add('is-dragging'); event.dataTransfer?.setData('text/plain', card.dataset.cardId); });
  app.addEventListener('dragend', event => { event.target.closest('[data-card-id]')?.classList.remove('is-dragging'); delete app.dataset.dragCard; });
  app.addEventListener('dragover', event => { if (event.target.closest('[data-card-id]')) event.preventDefault(); });
  app.addEventListener('drop', event => { const target = event.target.closest('[data-card-id]'); const sourceId = app.dataset.dragCard || event.dataTransfer?.getData('text/plain'); if (!target || !sourceId || target.dataset.cardId === sourceId) return; event.preventDefault(); const cards = state.dashboard.cards; const from = cards.findIndex(card => card.id === sourceId); const to = cards.findIndex(card => card.id === target.dataset.cardId); if (from < 0 || to < 0) return; const [card] = cards.splice(from, 1); cards.splice(to, 0, card); delete app.dataset.dragCard; renderAll(); announce('Tarjeta recolocada.'); });
}

init();

function renderQualityEnhanced() {
  const totalCells = state.rows.length * state.columns.length;
  const missing = state.rows.reduce((sum, row) => sum + state.columns.filter(column => isMissing(row[column.name])).length, 0);
  const duplicateKeys = new Set(state.rows.map(row => JSON.stringify(row)));
  const cards = '<div class="quality-summary"><article class="quality-stat"><span>Completitud</span><strong>' + format(totalCells ? (1 - missing / totalCells) * 100 : 0, 1) + '%</strong><small>' + format(missing, 0) + ' celdas vacías</small></article><article class="quality-stat"><span>Duplicados exactos</span><strong>' + format(state.rows.length - duplicateKeys.size, 0) + '</strong><small>Comparación de filas completas</small></article><article class="quality-stat"><span>Campos numéricos</span><strong>' + format(numericColumns().length, 0) + '</strong><small>Listos para métricas</small></article></div>';
  const rows = state.columns.map(column => {
    const present = state.rows.map(row => row[column.name]).filter(value => !isMissing(value));
    const numbers = present.map(toNumber).filter(value => value !== null).sort((a, b) => a - b);
    const middle = Math.floor(numbers.length / 2);
    const median = numbers.length ? (numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2) : null;
    const mean = numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
    const range = column.type === 'number' && numbers.length ? format(numbers[0], 1) + ' – ' + format(numbers[numbers.length - 1], 1) : '—';
    return '<tr><td><strong>' + esc(column.name) + '</strong><small>' + esc(column.type) + '</small></td><td>' + format(state.rows.length - present.length, 0) + '</td><td>' + format(new Set(present.map(String)).size, 0) + '</td><td>' + (column.type === 'number' ? format(mean, 1) : '—') + '</td><td>' + (column.type === 'number' ? format(median, 1) : '—') + '</td><td>' + range + '</td><td><span class="quality-bar"><i style="width:' + (state.rows.length ? present.length / state.rows.length * 100 : 0) + '%"></i></span></td></tr>';
  }).join('');
  return cards + '<div class="panel"><div class="panel-heading"><div><span class="eyebrow">Auditoría por campo</span><h3>Perfil de calidad del conjunto</h3></div><span class="panel-note">Sin enviar datos fuera del navegador</span></div><div class="table-scroll"><table class="quality-table"><thead><tr><th>Campo</th><th>Vacíos</th><th>Únicos</th><th>Media</th><th>Mediana</th><th>Rango</th><th>Cobertura</th></tr></thead><tbody>' + rows + '</tbody></table></div></div><div class="provenance"><strong>Lectura responsable</strong><span>El perfil describe el archivo cargado, no valida por sí solo la exactitud semántica, geográfica o estadística de sus valores. Conserva la fuente original y revisa los campos críticos antes de publicar resultados.</span></div>';
}
