import { state, esc, format, toNumber, isMissing } from './data.js';

const COLORS = ['#67e8f9', '#a78bfa', '#fbbf24', '#34d399', '#fb7185', '#60a5fa', '#c084fc', '#2dd4bf', '#f97316', '#f472b6'];

function emptyChart(message = 'No hay datos para representar') {
  return `<div class="empty-chart"><span>◌</span><strong>${esc(message)}</strong><small>Ajusta los filtros o carga otro conjunto de datos.</small></div>`;
}

function groupRows(rows, xField, yField, aggregation, ordering = 'original') {
  const groups = new Map();
  rows.forEach(row => {
    const key = String(row[xField] ?? 'Sin valor');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const result = [...groups.entries()].map(([label, items]) => {
    const numbers = items.map(item => toNumber(item[yField])).filter(value => value !== null);
    let value = items.length;
    if (aggregation === 'sum') value = numbers.length ? numbers.reduce((total, item) => total + item, 0) : null;
    if (aggregation === 'avg') value = numbers.length ? numbers.reduce((total, item) => total + item, 0) / numbers.length : null;
    return { label, value: value === null ? null : Number(value), count: items.length, hasValue: aggregation === 'count' || numbers.length > 0 };
  }).filter(item => item.hasValue);
  if (ordering === 'value-desc') result.sort((a, b) => b.value - a.value);
  if (ordering === 'value-asc') result.sort((a, b) => a.value - b.value);
  return result.slice(0, 24);
}

function axisLabel(value) {
  const text = String(value);
  return esc(text.length > 16 ? `${text.slice(0, 15)}…` : text);
}

function chartFrame(content, title = '') {
  return `<svg class="chart-svg" viewBox="0 0 820 330" role="img" aria-label="${esc(title || 'Gráfico')}" preserveAspectRatio="xMidYMid meet"><g class="chart-grid"><line x1="62" y1="34" x2="62" y2="274"/><line x1="62" y1="274" x2="790" y2="274"/></g>${content}</svg>`;
}

function barChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, ordering);
  if (!groups.length) return emptyChart();
  const max = Math.max(...groups.map(item => item.value), 1);
  const slot = 700 / groups.length;
  const bars = groups.map((item, index) => {
    const height = Math.max(2, item.value / max * 220);
    const x = 74 + index * slot + slot * 0.14;
    const width = slot * 0.72;
    return `<g class="chart-bar"><rect x="${x.toFixed(1)}" y="${(274 - height).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="8" fill="${COLORS[index % COLORS.length]}"/><text x="${(x + width / 2).toFixed(1)}" y="${(266 - height).toFixed(1)}" text-anchor="middle">${format(item.value, 0)}</text><text class="chart-axis-label" x="${(x + width / 2).toFixed(1)}" y="296" text-anchor="middle">${axisLabel(item.label)}</text></g>`;
  }).join('');
  return chartFrame(`<text class="chart-axis-title" x="62" y="20">${esc(yField)}</text>${bars}`, `${xField} por ${yField}`);
}

function lineChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, ordering);
  if (!groups.length) return emptyChart();
  const max = Math.max(...groups.map(item => item.value), 1);
  const step = groups.length === 1 ? 0 : 700 / (groups.length - 1);
  const points = groups.map((item, index) => `${74 + index * step},${274 - item.value / max * 220}`).join(' ');
  const dots = groups.map((item, index) => {
    const x = 74 + index * step;
    const y = 274 - item.value / max * 220;
    return `<circle cx="${x}" cy="${y}" r="5" fill="#67e8f9"/><text class="chart-axis-label" x="${x}" y="296" text-anchor="middle">${axisLabel(item.label)}</text>`;
  }).join('');
  return chartFrame(`<text class="chart-axis-title" x="62" y="20">${esc(yField)}</text><polyline class="chart-line" points="${points}" fill="none" stroke="#67e8f9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}`, `${xField} en el tiempo`);
}

function donutChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, ordering).slice(0, 8);
  if (!groups.length) return emptyChart();
  const total = groups.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 0;
  const arcs = groups.map((item, index) => {
    const length = item.value / total * 251.2;
    const arc = `<circle cx="210" cy="155" r="80" fill="none" stroke="${COLORS[index % COLORS.length]}" stroke-width="34" stroke-dasharray="${length} ${251.2 - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 210 155)"/>`;
    offset += length;
    return arc;
  }).join('');
  const legend = groups.map((item, index) => `<g transform="translate(400 ${62 + index * 28})"><rect width="13" height="13" rx="4" fill="${COLORS[index % COLORS.length]}"/><text x="22" y="11">${axisLabel(item.label)} · ${format(item.value, 0)}</text></g>`).join('');
  return chartFrame(`${arcs}<text class="donut-total" x="210" y="151" text-anchor="middle">${format(total, 0)}</text><text class="donut-caption" x="210" y="172" text-anchor="middle">total</text>${legend}`, `${xField} distribuido`);
}

function scatterChart(rows, xField, yField) {
  const points = rows.map(row => ({ x: toNumber(row[xField]), y: toNumber(row[yField]) })).filter(point => point.x !== null && point.y !== null).slice(0, 250);
  if (!points.length) return emptyChart('Selecciona dos campos numéricos');
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const scale = (value, min, max, start, size) => start + ((value - min) / (max - min || 1)) * size;
  const marks = points.map(point => `<circle class="scatter-point" cx="${scale(point.x, minX, maxX, 74, 700).toFixed(1)}" cy="${(274 - ((point.y - minY) / (maxY - minY || 1)) * 220).toFixed(1)}" r="5"/>`).join('');
  return chartFrame(`<text class="chart-axis-title" x="62" y="20">${esc(yField)} frente a ${esc(xField)}</text>${marks}<text class="chart-axis-label" x="74" y="300">${format(minX, 1)}</text><text class="chart-axis-label" x="774" y="300" text-anchor="end">${format(maxX, 1)}</text>`, 'Dispersión');
}

function histogramChart(rows, field) {
  const values = rows.map(row => toNumber(row[field])).filter(value => value !== null);
  if (!values.length) return emptyChart('Selecciona un campo numérico');
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bins = Array.from({ length: 8 }, () => 0);
  values.forEach(value => { const index = Math.min(7, Math.floor(((value - min) / (max - min || 1)) * 8)); bins[index] += 1; });
  const peak = Math.max(...bins, 1);
  const slot = 700 / bins.length;
  const bars = bins.map((count, index) => {
    const height = Math.max(2, count / peak * 220);
    const x = 74 + index * slot + 4;
    return `<rect x="${x}" y="${274 - height}" width="${slot - 8}" height="${height}" rx="6" fill="${COLORS[index % COLORS.length]}"/><text class="chart-axis-label" x="${x + (slot - 8) / 2}" y="296" text-anchor="middle">${format(min + (max - min) * index / 8, 0)}</text>`;
  }).join('');
  return chartFrame(`<text class="chart-axis-title" x="62" y="20">Distribución de ${esc(field)}</text>${bars}`, 'Histograma');
}

export function chartSVG(type, rows, xField, yField, aggregation, ordering = 'original') {
  if (type === 'line') return signedLineChart(rows, xField, yField, aggregation, ordering);
  if (type === 'donut') return donutChart(rows, xField, yField, aggregation, ordering);
  if (type === 'scatter') return scatterChart(rows, xField, yField);
  if (type === 'histogram') return histogramChart(rows, yField);
  return signedBarChart(rows, xField, yField, aggregation, ordering);
}

function chartScale(values) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const y = value => 274 - ((value - min) / span) * 220;
  return { y, baseline: y(0) };
}

function signedBarChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, ordering);
  if (!groups.length) return emptyChart();
  const scale = chartScale(groups.map(item => item.value));
  const bars = groups.map((item, index) => {
    const valueY = scale.y(item.value);
    const baseY = scale.baseline;
    const x = 74 + index * (700 / groups.length) + (700 / groups.length) * 0.14;
    const width = (700 / groups.length) * 0.72;
    const height = Math.max(2, Math.abs(baseY - valueY));
    const y = Math.min(baseY, valueY);
    const labelY = item.value >= 0 ? Math.max(20, y - 8) : Math.min(294, y + height + 16);
    return '<g class="chart-bar"><title>' + esc(item.label) + ': ' + format(item.value, 1) + '</title><rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + width.toFixed(1) + '" height="' + height.toFixed(1) + '" rx="8" fill="' + COLORS[index % COLORS.length] + '"/><text x="' + (x + width / 2).toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="middle">' + format(item.value, 1) + '</text><text class="chart-axis-label" x="' + (x + width / 2).toFixed(1) + '" y="296" text-anchor="middle">' + axisLabel(item.label) + '</text></g>';
  }).join('');
  const zero = scale.baseline === 274 ? '' : '<line class="chart-zero" x1="62" y1="' + scale.baseline.toFixed(1) + '" x2="790" y2="' + scale.baseline.toFixed(1) + '"/>';
  return chartFrame('<text class="chart-axis-title" x="62" y="20">' + esc(yField) + '</text>' + zero + bars, xField + ' por ' + yField);
}

function signedLineChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, ordering);
  if (!groups.length) return emptyChart();
  const scale = chartScale(groups.map(item => item.value));
  const step = groups.length === 1 ? 0 : 700 / (groups.length - 1);
  const points = groups.map((item, index) => (74 + index * step) + ',' + scale.y(item.value)).join(' ');
  const dots = groups.map((item, index) => {
    const x = 74 + index * step;
    const y = scale.y(item.value);
    return '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#67e8f9"><title>' + esc(item.label) + ': ' + format(item.value, 1) + '</title></circle><text class="chart-axis-label" x="' + x + '" y="296" text-anchor="middle">' + axisLabel(item.label) + '</text>';
  }).join('');
  const zero = scale.baseline === 274 ? '' : '<line class="chart-zero" x1="62" y1="' + scale.baseline.toFixed(1) + '" x2="790" y2="' + scale.baseline.toFixed(1) + '"/>';
  return chartFrame('<text class="chart-axis-title" x="62" y="20">' + esc(yField) + '</text>' + zero + '<polyline class="chart-line" points="' + points + '" fill="none" stroke="#67e8f9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' + dots, xField + ' por ' + yField);
}

export function tableHTML(rows, columns, limit = 12) {
  if (!rows.length) return `<div class="empty-state"><strong>No hay filas que mostrar</strong><span>Revisa los filtros o importa un archivo.</span></div>`;
  const visible = columns.slice(0, 12);
  const ordered = state.sortKey && visible.some(column => column.name === state.sortKey) ? [...rows].sort((left, right) => {
    const a = left[state.sortKey];
    const b = right[state.sortKey];
    if (isMissing(a) && isMissing(b)) return 0;
    if (isMissing(a)) return 1;
    if (isMissing(b)) return -1;
    const na = toNumber(a);
    const nb = toNumber(b);
    const result = na !== null && nb !== null ? na - nb : String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
    return state.sortDir === 'desc' ? -result : result;
  }) : rows;
  const shown = Math.min(limit, state.tableLimit, ordered.length);
  return `<div class="table-scroll"><table><thead><tr>${visible.map(column => `<th><button class="sort-button" data-sort-key="${esc(column.name)}" title="Ordenar por ${esc(column.name)}">${esc(column.name)} <span>${state.sortKey === column.name ? state.sortDir === 'asc' ? '↑' : '↓' : '↕'}</span></button><small>${esc(column.type)}</small></th>`).join('')}</tr></thead><tbody>${ordered.slice(0, shown).map(row => `<tr>${visible.map(column => `<td>${esc(row[column.name] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${ordered.length > shown ? `<div class="table-note table-more-row"><span>Mostrando ${format(shown, 0)} de ${format(ordered.length, 0)} filas.</span><button class="button button-ghost" data-action="show-more">Mostrar más</button></div>` : ordered.length ? `<p class="table-note">${format(ordered.length, 0)} filas visibles.</p>` : ''}`;
}
