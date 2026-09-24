import { DEMO_ROWS, state, esc, format, toNumber, inferType, parseAny, loadRows, rebuildColumns, applyFilters } from './data.js';
import { chartSVG, tableHTML } from './charts.js';

const root = document.body;
const mode = root.dataset.mode || 'dashboard';
const initialTab = mode === 'profiler' ? 'quality' : mode === 'transform' ? 'analyze' : 'overview';
const numericColumns = () => state.columns.filter(column => column.type === 'number');
const metricField = () => { const all = numericColumns(); const preferred = all.find(column => /find|count|total|value|amount|score|area|metric/i.test(column.name) && !/^(id|_row_id|latitude|longitude)$/i.test(column.name)); return preferred?.name || all.find(column => !/^(id|_row_id|latitude|longitude)$/i.test(column.name))?.name || all[0]?.name || state.yField; };

function defaultDashboard() {
  const numeric = metricField();
  const dimension = state.columns.find(column => column.type === 'text')?.name || state.xField;
  return {
    cards: [
      { id: 'kpi-rows', type: 'kpi', metric: 'rows' },
      { id: 'kpi-sum', type: 'kpi', metric: 'sum', field: numeric },
      { id: 'kpi-complete', type: 'kpi', metric: 'complete' },
      { id: 'chart-main', type: 'chart', title: 'Distribución principal', chartType: 'bar', xField: dimension, yField: numeric, aggregation: 'sum' },
      { id: 'table-main', type: 'table', title: 'Registros filtrados' }
    ]
  };
}

function shellMarkup() {
  root.innerHTML = `<div class="app-shell">
    <header class="appbar"><a class="brand" href="../" aria-label="Data Insight Web Tools"><span class="brand-mark">DI</span><span><strong>Data Insight</strong><small>local analytics studio</small></span></a><div class="appbar-actions"><button class="icon-button" data-action="fullscreen" title="Pantalla completa">⛶</button><button class="button button-ghost" data-action="save">Guardar proyecto</button><button class="button button-primary" data-action="export">Exportar CSV</button></div></header>
    <div class="app-layout">
      <aside class="sidebar"><div class="sidebar-heading"><span class="eyebrow">Espacio de trabajo</span><h2>Explora tus datos</h2></div><div class="dataset-card"><span class="status-dot"></span><strong id="dataset-name">Cargando…</strong><small id="dataset-meta"></small><span id="dataset-kind" class="badge"></span></div>
        <nav class="side-nav" aria-label="Secciones"><button data-tab="overview">▦ <span>Dashboard</span></button><button data-tab="prepare">⌘ <span>Preparar datos</span></button><button data-tab="analyze">◒ <span>Analizar</span></button><button data-tab="quality">✓ <span>Calidad</span></button></nav>
        <div class="side-divider"></div><span class="eyebrow">Entrada y salida</span><div class="side-actions"><button class="button button-soft" data-action="import">＋ Cargar CSV, JSON o GeoJSON</button><button class="button button-ghost wide" data-action="paste">Pegar datos</button><button class="button button-ghost wide" data-action="load-project">Abrir proyecto guardado</button><button class="button button-ghost wide" data-action="reset">Restaurar muestra</button><input id="file-input" type="file" accept=".csv,.tsv,.txt,.json,.geojson,application/json,text/csv" hidden><input id="project-input" type="file" accept=".data-insight.json,application/json" hidden></div>
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
}

function renderContent() {
  if (state.activeTab === 'prepare') return renderPrepare();
  if (state.activeTab === 'analyze') return renderAnalyze();
  if (state.activeTab === 'quality') return renderQuality();
  return renderOverview();
}

function renderKpi(metric, field) {
  const rows = state.filtered;
  let value = rows.length;
  let label = 'Filas filtradas';
  let detail = `${format(state.rows.length, 0)} en el conjunto total`;
  if (metric === 'sum') { value = rows.map(row => toNumber(row[field])).filter(value => value !== null).reduce((sum, item) => sum + item, 0); label = `Total de ${field}`; detail = 'Suma de los valores visibles'; }
  if (metric === 'avg') { const values = rows.map(row => toNumber(row[field])).filter(value => value !== null); value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0; label = `Media de ${field}`; detail = 'Media de los valores visibles'; }
  if (metric === 'complete') { const cells = rows.length * state.columns.length; const present = rows.reduce((sum, row) => sum + state.columns.filter(column => row[column.name] !== null && row[column.name] !== undefined && String(row[column.name]).trim() !== '').length, 0); value = cells ? present / cells * 100 : 0; label = 'Completitud'; detail = 'Celdas con valor'; return `<div class="kpi-value">${format(value, 1)}<small>%</small></div><div class="kpi-label">${label}</div><div class="kpi-detail">${detail}</div>`; }
  return `<div class="kpi-value">${format(value, metric === 'avg' ? 1 : 0)}</div><div class="kpi-label">${esc(label)}</div><div class="kpi-detail">${esc(detail)}</div>`;
}

function cardHTML(card) {
  if (card.type === 'kpi') return `<article class="kpi-card"><div class="kpi-icon">${card.metric === 'complete' ? '◒' : card.metric === 'rows' ? '▤' : 'Σ'}</div>${renderKpi(card.metric, card.field)}</article>`;
  if (card.type === 'table') return `<article class="panel dashboard-card card-table"><div class="panel-heading"><div><span class="eyebrow">Tabla</span><h3>${esc(card.title || 'Registros')}</h3></div><button class="remove-card" data-action="remove-card" data-id="${esc(card.id)}" title="Quitar tarjeta">×</button></div>${tableHTML(state.filtered, state.columns, 8)}</article>`;
  return `<article class="panel dashboard-card card-chart"><div class="panel-heading"><div><span class="eyebrow">Visual</span><h3>${esc(card.title || 'Visualización')}</h3></div><button class="remove-card" data-action="remove-card" data-id="${esc(card.id)}" title="Quitar tarjeta">×</button></div><div class="chart-wrap">${chartSVG(card.chartType || 'bar', state.filtered, card.xField || state.xField, card.yField || state.yField, card.aggregation || 'sum')}</div></article>`;
}

function renderOverview() {
  const cards = state.dashboard.cards.length ? state.dashboard.cards : defaultDashboard().cards;
  if (!state.dashboard.cards.length) state.dashboard.cards = cards;
  return `<div class="overview-toolbar"><div><span class="result-count">${format(state.filtered.length, 0)} filas visibles</span><span class="source-line">Fuente: ${esc(state.sourceDetail)}</span></div><div class="toolbar-actions"><button class="button button-ghost" data-tab="prepare">Editar filtros</button><button class="button button-soft" data-action="add-table">＋ Tabla</button></div></div><div class="dashboard-grid">${cards.map(cardHTML).join('')}</div>`;
}

function renderFilters() {
  const controls = state.columns.slice(0, 10).map(column => {
    const values = [...new Set(state.rows.map(row => row[column.name]).filter(value => value !== null && value !== undefined && String(value) !== ''))].slice(0, 30);
    if (column.type === 'number') return `<div class="filter-field"><label>${esc(column.name)}<small>mínimo / máximo</small></label><div class="range-fields"><input type="number" placeholder="mín" data-filter-kind="min" data-filter-key="${esc(column.name)}" value="${esc(state.filters[column.name]?.min ?? '')}"><input type="number" placeholder="máx" data-filter-kind="max" data-filter-key="${esc(column.name)}" value="${esc(state.filters[column.name]?.max ?? '')}"></div></div>`;
    return `<div class="filter-field"><label>${esc(column.name)}<small>${format(values.length, 0)} valores</small></label><select data-filter-kind="value" data-filter-key="${esc(column.name)}"><option value="">Todos</option>${values.map(value => `<option value="${esc(value)}" ${String(state.filters[column.name]?.value) === String(value) ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></div>`;
  }).join('');
  return `<div class="filter-panel"><div class="filter-search"><input id="search-input" type="search" placeholder="Buscar en cualquier campo…" value="${esc(state.search)}"><button class="button button-soft" data-action="apply-search">Aplicar</button></div><div class="filter-grid">${controls || '<span class="muted">Carga un conjunto de datos para crear filtros.</span>'}</div></div>`;
}

function renderPrepare() {
  return `${renderFilters()}<div class="panel"><div class="panel-heading"><div><span class="eyebrow">Esquema y muestra</span><h3>${format(state.filtered.length, 0)} filas filtradas</h3></div><span class="panel-note">${format(state.columns.length, 0)} campos detectados</span></div>${tableHTML(state.filtered, state.columns, 18)}</div>`;
}

function fieldSelect(id, value, numericOnly = false) {
  const options = state.columns.filter(column => !numericOnly || column.type === 'number').map(column => `<option value="${esc(column.name)}" ${column.name === value ? 'selected' : ''}>${esc(column.name)} · ${column.type}</option>`).join('');
  return `<select id="${id}">${options}</select>`;
}

function renderAnalyze() {
  return `<div class="analysis-layout"><aside class="analysis-controls panel"><div class="panel-heading"><div><span class="eyebrow">Configurar</span><h3>Visual actual</h3></div></div><label>Dimensión<span>${fieldSelect('x-field', state.xField)}</span></label><label>Métrica<span>${fieldSelect('y-field', state.yField, true)}</span></label><label>Tipo de gráfico<select id="chart-type"><option value="bar" ${state.chartType === 'bar' ? 'selected' : ''}>Barras</option><option value="line" ${state.chartType === 'line' ? 'selected' : ''}>Línea</option><option value="donut" ${state.chartType === 'donut' ? 'selected' : ''}>Anillo</option><option value="scatter" ${state.chartType === 'scatter' ? 'selected' : ''}>Dispersión</option><option value="histogram" ${state.chartType === 'histogram' ? 'selected' : ''}>Histograma</option></select></label><label>Agregación<select id="aggregation"><option value="sum" ${state.aggregation === 'sum' ? 'selected' : ''}>Suma</option><option value="avg" ${state.aggregation === 'avg' ? 'selected' : ''}>Media</option><option value="count" ${state.aggregation === 'count' ? 'selected' : ''}>Recuento</option></select></label><button class="button button-primary wide" data-action="add-chart">Añadir al dashboard</button><p class="helper">Los gráficos se calculan en memoria con las filas filtradas y se pueden exportar junto al proyecto.</p></aside><section class="panel analysis-result"><div class="panel-heading"><div><span class="eyebrow">Vista previa</span><h3>${esc(state.yField)} por ${esc(state.xField)}</h3></div><span class="panel-note">${format(state.filtered.length, 0)} filas</span></div><div class="chart-wrap chart-large">${chartSVG(state.chartType, state.filtered, state.xField, state.yField, state.aggregation)}</div></section></div><div class="panel"><div class="panel-heading"><div><span class="eyebrow">Datos de respaldo</span><h3>Filas que alimentan la visual</h3></div></div>${tableHTML(state.filtered, state.columns, 10)}</div>`;
}

function renderQuality() {
  const totalCells = state.rows.length * state.columns.length;
  const missing = state.rows.reduce((sum, row) => sum + state.columns.filter(column => row[column.name] === null || row[column.name] === undefined || String(row[column.name]).trim() === '').length, 0);
  const duplicateKeys = new Set(state.rows.map(row => JSON.stringify(row)));
  const cards = `<div class="quality-summary"><article class="quality-stat"><span>Completitud</span><strong>${format(totalCells ? (1 - missing / totalCells) * 100 : 0, 1)}%</strong><small>${format(missing, 0)} celdas vacías</small></article><article class="quality-stat"><span>Duplicados exactos</span><strong>${format(state.rows.length - duplicateKeys.size, 0)}</strong><small>Comparación de filas completas</small></article><article class="quality-stat"><span>Campos numéricos</span><strong>${format(numericColumns().length, 0)}</strong><small>Listos para métricas</small></article></div>`;
  const rows = state.columns.map(column => { const values = state.rows.map(row => row[column.name]); const present = values.filter(value => value !== null && value !== undefined && String(value).trim() !== ''); const numbers = present.map(toNumber).filter(value => value !== null); return `<tr><td><strong>${esc(column.name)}</strong><small>${esc(column.type)}</small></td><td>${format(state.rows.length - present.length, 0)}</td><td>${format(new Set(present.map(String)).size, 0)}</td><td>${column.type === 'number' ? `${format(Math.min(...numbers), 1)} – ${format(Math.max(...numbers), 1)}` : '—'}</td><td><span class="quality-bar"><i style="width:${state.rows.length ? present.length / state.rows.length * 100 : 0}%"></i></span></td></tr>`; }).join('');
  return `${cards}<div class="panel"><div class="panel-heading"><div><span class="eyebrow">Auditoría por campo</span><h3>Perfil de calidad del conjunto</h3></div><span class="panel-note">Sin enviar datos fuera del navegador</span></div><div class="table-scroll"><table class="quality-table"><thead><tr><th>Campo</th><th>Vacíos</th><th>Únicos</th><th>Rango</th><th>Cobertura</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="provenance"><strong>Lectura responsable</strong><span>El perfil describe el archivo cargado, no valida por sí solo la exactitud semántica, geográfica o estadística de sus valores. Conserva la fuente original y revisa los campos críticos antes de publicar resultados.</span></div>`;
}

function announce(message, kind = 'success') { const alert = document.querySelector('#app-alert'); if (alert) { alert.innerHTML = `<div class="alert alert-${kind}">${esc(message)}<button data-action="clear-alert">×</button></div>`; window.setTimeout(() => { if (alert) alert.innerHTML = ''; }, 6500); } }

function init() {
  state.activeTab = initialTab;
  shellMarkup();
  state.dashboard = defaultDashboard();
  renderAll();
  bind();
}

function download(name, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
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

function saveProject() {
  const project = { format: 'data-insight-project', version: 1, savedAt: new Date().toISOString(), meta: { name: state.datasetName, kind: state.sourceKind, detail: state.sourceDetail }, rows: state.rows, filters: state.filters, search: state.search, activeTab: state.activeTab, xField: state.xField, yField: state.yField, chartType: state.chartType, aggregation: state.aggregation, dashboard: state.dashboard };
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
  document.body.insertAdjacentHTML('beforeend', `<div id="paste-modal" class="modal-backdrop"><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="paste-title"><div class="panel-heading"><div><span class="eyebrow">Entrada local</span><h2 id="paste-title">Pega CSV, TSV o JSON</h2></div><button class="remove-card" data-action="close-paste">×</button></div><textarea id="paste-data" rows="12" placeholder="provincia,valor\nCuenca,12\nToledo,18"></textarea><div class="modal-actions"><button class="button button-ghost" data-action="close-paste">Cancelar</button><button class="button button-primary" data-action="apply-paste">Usar estos datos</button></div></div></div>`);
  const modal = document.querySelector('#paste-modal');
  const close = () => modal?.remove();
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
    if (project.format !== 'data-insight-project' || !Array.isArray(project.rows)) throw new Error('El archivo no es un proyecto Data Insight válido.');
    loadRows(project.rows, project.meta || { name: file.name, kind: 'local' });
    state.filters = project.filters || {};
    state.search = project.search || '';
    state.xField = project.xField || state.xField;
    state.yField = project.yField || state.yField;
    state.chartType = project.chartType || 'bar';
    state.aggregation = project.aggregation || 'sum';
    state.dashboard = project.dashboard || defaultDashboard();
    state.activeTab = project.activeTab || 'overview';
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
    state.rows = state.rows.map(row => ({ ...row, [name]: calculate(...names.map(field => toNumber(row[field]) ?? 0)) }));
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
  if (kind === 'min') { if (value === '') delete filter.min; else filter.min = value; }
  if (kind === 'max') { if (value === '') delete filter.max; else filter.max = value; }
  if (!Object.keys(filter).length) delete state.filters[key]; else state.filters[key] = filter;
  renderAll();
}

function bind() {
  const app = document.querySelector('.app-shell');
  app.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if (tab) { state.activeTab = tab; renderAll(); return; }
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    if (action === 'import') document.querySelector('#file-input').click();
    if (action === 'load-project') document.querySelector('#project-input').click();
    if (action === 'paste') showPasteModal();
    if (action === 'export') exportCSV();
    if (action === 'save') saveProject();
    if (action === 'reset') resetFromDemo();
    if (action === 'add-calculated') addCalculatedField();
    if (action === 'apply-search') { state.search = document.querySelector('#search-input')?.value || ''; renderAll(); }
    if (action === 'add-chart') { state.dashboard.cards.push({ id: `chart-${Date.now()}`, type: 'chart', title: `${state.yField} por ${state.xField}`, chartType: state.chartType, xField: state.xField, yField: state.yField, aggregation: state.aggregation }); announce('Visual añadido al dashboard.'); renderAll(); }
    if (action === 'add-table') { state.dashboard.cards.push({ id: `table-${Date.now()}`, type: 'table', title: 'Nueva tabla' }); announce('Tabla añadida al dashboard.'); renderAll(); }
    if (action === 'remove-card') { state.dashboard.cards = state.dashboard.cards.filter(card => card.id !== actionNode.dataset.id); renderAll(); }
    if (action === 'clear-alert') { const alert = document.querySelector('#app-alert'); if (alert) alert.innerHTML = ''; }
    if (action === 'fullscreen') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
  });
  app.addEventListener('change', event => {
    if (event.target.id === 'file-input') importDataset(event.target.files[0]);
    if (event.target.id === 'project-input') importProject(event.target.files[0]);
    if (event.target.matches('[data-filter-kind]')) updateFilter(event.target);
    if (event.target.id === 'x-field') { state.xField = event.target.value; renderAll(); }
    if (event.target.id === 'y-field') { state.yField = event.target.value; renderAll(); }
    if (event.target.id === 'chart-type') { state.chartType = event.target.value; renderAll(); }
    if (event.target.id === 'aggregation') { state.aggregation = event.target.value; renderAll(); }
  });
  app.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.id === 'search-input') { state.search = event.target.value; renderAll(); } });
}

init();
