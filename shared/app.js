import { DEMO_ROWS, state, esc, format, toNumber, isMissing, parseAny, loadRows, rebuildColumns, applyFilters, geoFields } from './data.js';
import { chartSVG, tableHTML } from './charts.js';

const root = document.body;
const mode = root.dataset.mode || 'dashboard';
const initialTab = mode === 'profiler' ? 'quality' : mode === 'transform' ? 'analyze' : 'overview';
const TAB_IDS = ['overview', 'prepare', 'analyze', 'quality'];
const CHART_TYPES = ['bar', 'line', 'area', 'donut', 'scatter', 'histogram', 'boxplot', 'map', 'bubble-map', 'density-map', 'heatmap'];
const CHART_LABELS = { bar: 'Barras', line: 'Línea', area: 'Área', donut: 'Anillo', scatter: 'Dispersión', histogram: 'Histograma', boxplot: 'Caja y bigotes', map: 'Mapa de puntos', 'bubble-map': 'Mapa de burbujas', 'density-map': 'Densidad por cuadrícula', heatmap: 'Mapa de calor bivariado' };
const AGGREGATIONS = ['sum', 'avg', 'count'];
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
      if ((metric === 'sum' || metric === 'avg') && !numericColumns().length) return { id, type, metric: 'rows', title };
      return { id, type, metric, field: safeField(card.field, metricField(), 'number'), title };
    }
    if (type === 'table') return { id, type, title: title || 'Registros' };
    const aggregation = AGGREGATIONS.includes(card.aggregation) ? card.aggregation : 'sum';
    return { id, type, title: title || 'Visualización', chartType: CHART_TYPES.includes(card.chartType) ? card.chartType : 'bar', xField: safeField(card.xField, state.xField), yField: safeField(card.yField, state.yField, aggregation === 'count' ? '' : 'number'), aggregation, chartSort: SORT_MODES.includes(card.chartSort) ? card.chartSort : 'original' };
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
  if (dimension) cards.push({ id: 'chart-main', type: 'chart', title: 'Distribución principal', chartType: 'bar', xField: dimension, yField: numeric || dimension, aggregation });
  if (temporal && numeric) cards.push({ id: 'chart-trend', type: 'chart', title: 'Evolución temporal', chartType: 'line', xField: temporal.name, yField: numeric, aggregation: 'sum', chartSort: 'original' });
  if (analysisNumbers.length >= 2) cards.push({ id: 'chart-relation', type: 'chart', title: 'Relación entre métricas', chartType: 'scatter', xField: analysisNumbers[0].name, yField: analysisNumbers[1].name, aggregation: 'sum' });
  if (geo.longitude && geo.latitude) cards.push({ id: 'map-main', type: 'chart', title: 'Distribución espacial', chartType: 'map', xField: geo.longitude, yField: geo.latitude, aggregation: 'count' });
  if (geo.longitude && geo.latitude) cards.push({ id: 'density-main', type: 'chart', title: 'Concentración espacial', chartType: 'density-map', xField: geo.longitude, yField: geo.latitude, aggregation: 'count' });
  cards.push({ id: 'table-main', type: 'table', title: 'Registros filtrados' });
  return {
    cards
  };
}

function shellMarkup() {
  root.innerHTML = `<div class="app-shell">
    <header class="appbar"><a class="brand" href="../" aria-label="Data Insight Web Tools"><span class="brand-mark">DI</span><span><strong>Data Insight</strong><small>local analytics studio</small></span></a><div class="appbar-actions"><button class="button button-soft" data-action="assistant">✦ Asistente local</button><button class="icon-button" data-action="fullscreen" title="Pantalla completa" aria-label="Pantalla completa">⛶</button><button class="button button-ghost" data-action="save">Guardar proyecto</button><button class="button button-ghost" data-action="export-json">Exportar JSON</button><button class="button button-primary" data-action="export">Exportar CSV</button></div></header>
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
}

function renderAll() {
  applyFilters();
  renderMeta();
  const info = pageInfo(state.activeTab);
  document.querySelector('#breadcrumb-current').textContent = info[0];
  document.querySelector('#page-title').textContent = info[1];
  document.querySelector('#page-subtitle').textContent = info[2];
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === state.activeTab));
  document.querySelector('#app-content').innerHTML = renderContent();
  enhanceAnalyzeUI();
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

function cardActions(card) {
  return `<div class="card-actions"><button class="card-action" data-action="edit-card" data-id="${esc(card.id)}" title="Renombrar tarjeta" aria-label="Renombrar tarjeta">✎</button><button class="card-action" data-action="duplicate-card" data-id="${esc(card.id)}" title="Duplicar tarjeta" aria-label="Duplicar tarjeta">⧉</button><button class="card-action" data-action="remove-card" data-id="${esc(card.id)}" title="Quitar tarjeta" aria-label="Quitar tarjeta">×</button></div>`;
}

function cardHTML(card) {
  if (card.type === 'kpi') return `<article class="kpi-card"><div class="kpi-icon">${card.metric === 'complete' ? '◒' : card.metric === 'rows' ? '▤' : 'Σ'}</div>${renderKpi(card.metric, card.field)}</article>`;
  if (card.type === 'table') return `<article class="panel dashboard-card card-table"><div class="panel-heading"><div><span class="eyebrow">Tabla</span><h3>${esc(card.title || 'Registros')}</h3></div>${cardActions(card)}</div>${tableHTML(state.filtered, state.columns, 8)}</article>`;
  return `<article class="panel dashboard-card card-chart"><div class="panel-heading"><div><span class="eyebrow">Visual</span><h3>${esc(card.title || 'Visualización')}</h3></div>${cardActions(card)}</div><div class="chart-wrap">${chartSVG(card.chartType || 'bar', state.filtered, card.xField || state.xField, card.yField || state.yField, card.aggregation || 'sum', card.chartSort || 'original')}</div></article>`;
}

function renderOverview() {
  const cards = state.dashboard.cards.length ? state.dashboard.cards : defaultDashboard().cards;
  if (!state.dashboard.cards.length) state.dashboard.cards = cards;
  return `<div class="overview-toolbar"><div><span class="result-count">${format(state.filtered.length, 0)} filas visibles</span><span class="source-line">Fuente: ${esc(state.sourceDetail)}</span></div><div class="toolbar-actions"><button class="button button-ghost" data-tab="prepare">Editar filtros</button><button class="button button-ghost" data-action="reset-filters">Restablecer filtros</button><button class="button button-soft" data-action="add-table">＋ Tabla</button><button class="button button-soft" data-action="reset-dashboard">Restablecer dashboard</button></div></div><div class="dashboard-grid">${cards.map(cardHTML).join('')}</div>`;
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

function fieldSelect(id, value, numericOnly = false) {
  const options = state.columns.filter(column => !numericOnly || column.type === 'number').map(column => `<option value="${esc(column.name)}" ${column.name === value ? 'selected' : ''}>${esc(column.name)} · ${column.type}</option>`).join('');
  return options ? `<select id="${id}">${options}</select>` : `<select id="${id}" disabled><option>Sin campos disponibles</option></select>`;
}

function renderAnalyze() {
  const hasMetric = numericColumns().length > 0;
  const aggregation = hasMetric && AGGREGATIONS.includes(state.aggregation) ? state.aggregation : 'count';
  if (state.aggregation !== aggregation) state.aggregation = aggregation;
  const disabledMetricOptions = hasMetric ? '' : ' disabled';
  const geo = coordinates();
  const helper = hasMetric ? `Los gráficos se calculan en memoria con las filas filtradas. ${geo.longitude && geo.latitude ? `Se detectan coordenadas ${geo.longitude}/${geo.latitude}; prueba un mapa de puntos, burbujas o densidad.` : 'Puedes cargar un GeoJSON o campos lon/lat para activar el mapa.'} ${analysisNumericColumns().length > 1 ? 'El mapa de calor compara dos campos numéricos.' : ''}` : 'No hay campos numéricos: se muestra un recuento por dimensión y puedes seguir explorando las categorías.';
  const previewTitle = state.chartTitle || `${state.yField} por ${state.xField}`;
  const chartOptions = Object.entries(CHART_LABELS).map(([value, label]) => `<option value="${value}" ${state.chartType === value ? 'selected' : ''}>${label}</option>`).join('');
  return `<div class="analysis-layout"><aside class="analysis-controls panel"><div class="panel-heading"><div><span class="eyebrow">Configurar</span><h3>Visual actual</h3></div></div><label>Dimensión / X<span>${fieldSelect('x-field', state.xField)}</span></label><label>Métrica / Y<span>${fieldSelect('y-field', state.yField, hasMetric)}</span></label><label>Tipo de gráfico<select id="chart-type">${chartOptions}</select></label><label>Agregación<select id="aggregation"><option value="sum" ${aggregation === 'sum' ? 'selected' : ''}${disabledMetricOptions}>Suma</option><option value="avg" ${aggregation === 'avg' ? 'selected' : ''}${disabledMetricOptions}>Media</option><option value="count" ${aggregation === 'count' ? 'selected' : ''}>Recuento</option></select></label><label>Título de la visual<span><input id="chart-title" type="text" maxlength="80" value="${esc(state.chartTitle)}" aria-label="Título de la visual"></span></label><label>Orden de categorías<span><select id="chart-sort"><option value="original" ${state.chartSort === 'original' ? 'selected' : ''}>Orden de aparición</option><option value="value-desc" ${state.chartSort === 'value-desc' ? 'selected' : ''}>Mayor a menor valor</option><option value="value-asc" ${state.chartSort === 'value-asc' ? 'selected' : ''}>Menor a mayor valor</option></select></span></label><button class="button button-primary wide" data-action="add-chart">Añadir al dashboard</button><p class="helper">${helper}</p></aside><section class="panel analysis-result"><div class="panel-heading"><div><span class="eyebrow">Vista previa</span><h3>${esc(previewTitle)}</h3></div><div class="panel-heading-actions"><span class="panel-note">${format(state.filtered.length, 0)} filas</span><button class="button button-ghost" data-action="export-svg">Exportar SVG</button></div></div><div class="chart-wrap chart-large">${chartSVG(state.chartType, state.filtered, state.xField, state.yField, aggregation, state.chartSort)}</div></section></div><div class="panel"><div class="panel-heading"><div><span class="eyebrow">Datos de respaldo</span><h3>Filas que alimentan la visual</h3></div></div>${tableHTML(state.filtered, state.columns, 10)}</div>`;
}

function enhanceAnalyzeUI() {
  if (state.activeTab !== 'analyze') return;
  const controls = document.querySelector('.analysis-controls');
  if (!controls || document.querySelector('#chart-title')) return;
  const addButton = controls.querySelector('[data-action="add-chart"]');
  if (!addButton) return;
  addButton.insertAdjacentHTML('beforebegin', `<label>Título de la visual<span><input id="chart-title" type="text" maxlength="80" value="${esc(state.chartTitle)}" aria-label="Título de la visual"></span></label><label>Orden de categorías<span><select id="chart-sort"><option value="original" ${state.chartSort === 'original' ? 'selected' : ''}>Orden de aparición</option><option value="value-desc" ${state.chartSort === 'value-desc' ? 'selected' : ''}>Mayor a menor valor</option><option value="value-asc" ${state.chartSort === 'value-asc' ? 'selected' : ''}>Menor a mayor valor</option></select></span></label>`);
  const preview = document.querySelector('.analysis-result .chart-wrap');
  if (preview) preview.innerHTML = chartSVG(state.chartType, state.filtered, state.xField, state.yField, state.aggregation, state.chartSort);
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
      insights.push(`${column.name}: media ${format(mean, 2)}, rango ${format(Math.min(...values), 2)}–${format(Math.max(...values), 2)}.`);
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
      if (denominator) insights.push(`La correlación lineal entre ${numeric[0].name} y ${numeric[1].name} es ${format(numerator / denominator, 2)}; describe asociación, no causalidad.`);
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

async function askLocalModel() {
  const availability = state.aiAvailability || await detectLocalAI();
  if (!['available', 'downloadable'].includes(availability)) throw new Error('Gemini Nano no está disponible en este navegador.');
  const api = window.LanguageModel;
  if (!state.aiSession) {
    setAIStatus('Preparando Gemini Nano…', 'idle');
    state.aiSession = await api.create({ expectedInputs: [{ type: 'text', languages: ['es'] }], expectedOutputs: [{ type: 'text', languages: ['es'] }], monitor(monitor) { monitor.addEventListener('downloadprogress', event => { setAIStatus(`Descargando Gemini Nano ${Math.round(event.loaded * 100)}%`, 'idle'); }); } });
  }
  const profile = compactDataProfile();
  const prompt = `Actúa como analista de datos. Responde en español, con prudencia y sin inventar. Analiza este perfil local y propone hasta cinco acciones concretas de limpieza, métricas o visualizaciones. Si hay coordenadas, recomienda un mapa apropiado. No afirmes causalidad. Perfil: ${JSON.stringify(profile)}`;
  const answer = await state.aiSession.prompt(prompt);
  setAIStatus('Gemini Nano listo', 'ready');
  return answer;
}

function applyRecommendedDashboard() {
  state.dashboard = defaultDashboard();
  state.activeTab = 'overview';
  renderAll();
  announce('Análisis automático aplicado con KPIs, tendencia, relación entre métricas, mapas y tabla según los campos detectados.');
}

function showAssistantModal() {
  document.querySelector('#assistant-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="assistant-modal" class="modal-backdrop"><div class="modal-card assistant-card" role="dialog" aria-modal="true" aria-labelledby="assistant-title" tabindex="-1"><div class="panel-heading"><div><span class="eyebrow">Asistencia local</span><h2 id="assistant-title">Analista de tu conjunto</h2></div><button class="remove-card" data-modal-action="close" aria-label="Cerrar ventana">×</button></div><p class="helper">Los cálculos se ejecutan en este navegador. Gemini Nano solo se usa si Chrome lo ofrece; no se envían filas a un servidor.</p><div class="assistant-actions"><button class="button button-soft" data-modal-action="insights">Calcular resumen completo</button><button class="button button-ghost" data-modal-action="recommend">Montar análisis automático</button><button class="button button-primary" data-modal-action="nano">Preguntar a Gemini Nano</button></div><div id="assistant-result" class="assistant-result" aria-live="polite"><span class="muted">Elige una acción para empezar.</span></div><div class="provenance"><strong>Privacidad y límites</strong><span>El asistente recibe solo un perfil compacto para interpretar el conjunto. Verifica siempre definiciones, unidades, proyección y calidad de los datos antes de publicar conclusiones.</span></div></div></div>`);
  const modal = document.querySelector('#assistant-modal');
  const previousFocus = document.activeElement;
  const close = () => { modal?.remove(); previousFocus?.focus?.(); };
  modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('[data-modal-action="close"]')) close(); });
  modal.querySelector('[data-modal-action="insights"]').addEventListener('click', () => { modal.querySelector('#assistant-result').innerHTML = `<ul class="assistant-list">${deterministicInsights().map(item => `<li>${esc(item)}</li>`).join('')}</ul>`; });
  modal.querySelector('[data-modal-action="recommend"]').addEventListener('click', () => { close(); applyRecommendedDashboard(); });
  modal.querySelector('[data-modal-action="nano"]').addEventListener('click', async event => {
    const button = event.currentTarget;
    const result = modal.querySelector('#assistant-result');
    button.disabled = true;
    result.innerHTML = '<span class="muted">Comprobando compatibilidad y preparando el modelo…</span>';
    try { result.innerHTML = `<div class="assistant-answer">${esc(await askLocalModel()).replace(/\n/g, '<br>')}</div>`; }
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
  if (!svg) { announce('No hay una visualización SVG activa para exportar.', 'error'); return; }
  const serialized = new XMLSerializer().serializeToString(svg);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
  const slug = (state.chartTitle || 'visualizacion').replace(/[^\wáéíóúüñ-]+/gi, '-').slice(0, 48) || 'visualizacion';
  download(`${slug}.svg`, xml, 'image/svg+xml;charset=utf-8');
  announce('SVG exportado con la visualización activa y sus etiquetas.');
}

function saveProject() {
  const project = { format: 'data-insight-project', version: 3, savedAt: new Date().toISOString(), meta: { name: state.datasetName, kind: state.sourceKind, detail: state.sourceDetail }, rows: state.rows, filters: state.filters, search: state.search, activeTab: state.activeTab, xField: state.xField, yField: state.yField, chartType: state.chartType, chartSort: state.chartSort, chartTitle: state.chartTitle, aggregation: state.aggregation, sortKey: state.sortKey, sortDir: state.sortDir, tableLimit: state.tableLimit, dashboard: state.dashboard };
  download(`${state.datasetName.replace(/[^\wáéíóúüñ-]+/gi, '-').slice(0, 48) || 'proyecto'}.data-insight.json`, JSON.stringify(project, null, 2), 'application/json;charset=utf-8');
  announce('Proyecto guardado. Puedes abrirlo de nuevo desde la barra lateral.');
}

function resetFromDemo() {
  loadRows(DEMO_ROWS, { name: 'Muestra arqueológica local', kind: 'synthetic', detail: 'Datos sintéticos de demostración. No representan un inventario oficial.' });
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
    state.filters = sanitizeFilters(project.filters);
    state.search = typeof project.search === 'string' ? project.search.slice(0, 500) : '';
    state.xField = safeField(project.xField, state.xField);
    state.yField = safeField(project.yField, state.yField, 'number');
    state.chartType = CHART_TYPES.includes(project.chartType) ? project.chartType : 'bar';
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
    state.rows = state.rows.map(row => { const result = calculate(...names.map(field => toNumber(row[field]) ?? 0)); return { ...row, [name]: Number.isFinite(result) ? result : null }; });
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
    if (action === 'add-chart') {
      state.dashboard.cards.push({ id: 'chart-' + Date.now(), type: 'chart', title: state.chartTitle?.trim() || state.yField + ' por ' + state.xField, chartType: state.chartType, xField: state.xField, yField: state.yField, aggregation: state.aggregation, chartSort: state.chartSort });
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
    if (action === 'edit-card') { const card = state.dashboard.cards.find(item => item.id === actionNode.dataset.id); if (card) { const title = window.prompt('Título de la tarjeta:', card.title || 'Visualización'); if (title?.trim()) { card.title = title.trim(); renderAll(); } } }
    if (action === 'duplicate-card') { const card = state.dashboard.cards.find(item => item.id === actionNode.dataset.id); if (card) { state.dashboard.cards.push({ ...card, id: `${card.type}-${Date.now()}`, title: `${card.title || 'Tarjeta'} (copia)` }); announce('Tarjeta duplicada.'); renderAll(); } }
    if (action === 'remove-card') { state.dashboard.cards = state.dashboard.cards.filter(card => card.id !== actionNode.dataset.id); renderAll(); }
    if (action === 'clear-alert') { const alert = document.querySelector('#app-alert'); if (alert) alert.innerHTML = ''; }
    if (action === 'fullscreen') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
  });
  app.addEventListener('change', event => {
    if (event.target.id === 'file-input') { importDataset(event.target.files[0]); event.target.value = ''; }
    if (event.target.id === 'project-input') { importProject(event.target.files[0]); event.target.value = ''; }
    if (event.target.matches('[data-filter-kind]')) updateFilter(event.target);
    if (event.target.id === 'x-field') { state.xField = event.target.value; renderAll(); }
    if (event.target.id === 'y-field') { state.yField = event.target.value; renderAll(); }
    if (event.target.id === 'chart-type') { state.chartType = CHART_TYPES.includes(event.target.value) ? event.target.value : 'bar'; if (['map', 'bubble-map', 'density-map'].includes(state.chartType)) { const geo = coordinates(); state.xField = geo.longitude || state.xField; state.yField = geo.latitude || state.yField; state.aggregation = 'count'; } if (state.chartType === 'heatmap') { const numbers = analysisNumericColumns(); state.xField = numbers[0]?.name || state.xField; state.yField = numbers[1]?.name || numbers[0]?.name || state.yField; state.aggregation = 'count'; } renderAll(); }
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
