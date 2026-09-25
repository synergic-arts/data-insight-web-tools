import { state, esc, format, toNumber, toCoordinate, isMissing } from './data.js?v=20260925-24';

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

function aggregateValue(items, yField, aggregation) {
  const numbers = items.map(item => toNumber(item[yField])).filter(value => value !== null);
  if (aggregation === 'count') return items.length;
  if (!numbers.length) return null;
  return aggregation === 'avg' ? numbers.reduce((total, item) => total + item, 0) / numbers.length : numbers.reduce((total, item) => total + item, 0);
}

function seriesGroups(rows, xField, yField, seriesField, aggregation, ordering = 'original') {
  if (!seriesField) return null;
  const categories = new Map();
  const series = new Set();
  rows.forEach(row => {
    const category = String(row[xField] ?? 'Sin valor');
    const seriesName = String(row[seriesField] ?? 'Sin serie');
    if (!categories.has(category)) categories.set(category, new Map());
    const categoryRows = categories.get(category);
    if (!categoryRows.has(seriesName)) categoryRows.set(seriesName, []);
    categoryRows.get(seriesName).push(row);
    series.add(seriesName);
  });
  const seriesNames = [...series].slice(0, 8);
  const value = (category, seriesName) => aggregateValue(categories.get(category)?.get(seriesName) || [], yField, aggregation);
  let categoryNames = [...categories.keys()];
  const totals = category => seriesNames.reduce((sum, name) => sum + (value(category, name) ?? 0), 0);
  if (ordering === 'value-desc') categoryNames.sort((left, right) => totals(right) - totals(left));
  if (ordering === 'value-asc') categoryNames.sort((left, right) => totals(left) - totals(right));
  return { categoryNames: categoryNames.slice(0, 18), seriesNames, value };
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
  if (groups.some(item => item.value < 0)) return emptyChart('El anillo necesita valores no negativos');
  const total = groups.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return emptyChart('El anillo necesita un total positivo');
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
  const points = rows.map((row, index) => ({ x: toNumber(row[xField]), y: toNumber(row[yField]), label: row.name ?? row.site ?? row.title ?? `Fila ${index + 1}` })).filter(point => point.x !== null && point.y !== null).slice(0, 250);
  if (!points.length) return emptyChart('Selecciona dos campos numéricos');
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const scale = (value, min, max, start, size) => start + ((value - min) / (max - min || 1)) * size;
  const marks = points.map(point => `<circle class="scatter-point" cx="${scale(point.x, minX, maxX, 74, 700).toFixed(1)}" cy="${(274 - ((point.y - minY) / (maxY - minY || 1)) * 220).toFixed(1)}" r="5"><title>${esc(point.label)} · ${esc(xField)} ${format(point.x, 2)} · ${esc(yField)} ${format(point.y, 2)}</title></circle>`).join('');
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

function areaChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, ordering);
  if (!groups.length) return emptyChart();
  const scale = chartScale(groups.map(item => item.value));
  const step = groups.length === 1 ? 0 : 700 / (groups.length - 1);
  const points = groups.map((item, index) => `${74 + index * step},${scale.y(item.value)}`).join(' ');
  const firstX = 74;
  const lastX = 74 + (groups.length - 1) * step;
  const areaPoints = `${firstX},${scale.baseline} ${points} ${lastX},${scale.baseline}`;
  const dots = groups.map((item, index) => {
    const x = 74 + index * step;
    const y = scale.y(item.value);
    return `<circle cx="${x}" cy="${y}" r="5" fill="#70e1bb"><title>${esc(item.label)}: ${format(item.value, 1)}</title></circle><text class="chart-axis-label" x="${x}" y="296" text-anchor="middle">${axisLabel(item.label)}</text>`;
  }).join('');
  const zero = scale.baseline === 274 ? '' : `<line class="chart-zero" x1="62" y1="${scale.baseline.toFixed(1)}" x2="790" y2="${scale.baseline.toFixed(1)}"/>`;
  return chartFrame(`<text class="chart-axis-title" x="62" y="20">${esc(yField)}</text>${zero}<polygon points="${areaPoints}" fill="#70e1bb26"/><polyline class="chart-line" points="${points}" fill="none" stroke="#70e1bb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}`, `${xField} como área`);
}

function stackedAreaChart(rows, xField, yField, seriesField, aggregation, ordering) {
  const split = seriesGroups(rows, xField, yField, seriesField, aggregation, ordering);
  if (!split || !split.seriesNames.length) return emptyChart('El área apilada necesita una serie categórica');
  const categoryNames = split.categoryNames;
  const seriesNames = split.seriesNames;
  const totals = categoryNames.map(category => seriesNames.reduce((sum, name) => sum + Math.max(0, split.value(category, name) ?? 0), 0));
  const max = Math.max(...totals, 1);
  const step = categoryNames.length === 1 ? 0 : 700 / (categoryNames.length - 1);
  const scale = amount => 274 - amount / max * 220;
  const running = Array.from({ length: categoryNames.length }, () => 0);
  const areas = seriesNames.map((name, seriesIndex) => {
    const lower = running.slice();
    const upper = categoryNames.map((category, index) => { running[index] += Math.max(0, split.value(category, name) ?? 0); return running[index]; });
    const top = upper.map((amount, index) => (74 + index * step).toFixed(1) + ',' + scale(amount).toFixed(1)).join(' ');
    const bottom = lower.map((amount, index) => (74 + index * step).toFixed(1) + ',' + scale(amount).toFixed(1)).reverse().join(' ');
    return '<polygon points="' + top + ' ' + bottom + '" fill="' + COLORS[seriesIndex % COLORS.length] + '55" stroke="' + COLORS[seriesIndex % COLORS.length] + '" stroke-width="2"><title>' + esc(name) + '</title></polygon>';
  }).join('');
  const labels = categoryNames.map((category, index) => '<text class="chart-axis-label" x="' + (74 + index * step).toFixed(1) + '" y="296" text-anchor="middle">' + axisLabel(category) + '</text>').join('');
  const legend = seriesNames.map((name, index) => '<g transform="translate(' + (430 + (index % 3) * 112) + ' ' + (38 + Math.floor(index / 3) * 20) + ')"><rect width="10" height="10" rx="3" fill="' + COLORS[index % COLORS.length] + '"/><text x="16" y="9">' + axisLabel(name) + '</text></g>').join('');
  return chartFrame('<text class="chart-axis-title" x="62" y="20">Área apilada · ' + esc(yField) + '</text>' + legend + areas + labels, xField + ' por ' + yField + ' y ' + seriesField);
}

function comboChart(rows, xField, yField, secondaryField, aggregation, ordering) {
  if (!secondaryField) return emptyChart('El combinado necesita una segunda métrica numérica');
  const primary = groupRows(rows, xField, yField, aggregation, ordering);
  const secondary = groupRows(rows, xField, secondaryField, aggregation, ordering);
  const labels = [...new Set([...primary.map(item => item.label), ...secondary.map(item => item.label)])].slice(0, 18);
  if (!labels.length) return emptyChart();
  const primaryMap = new Map(primary.map(item => [item.label, item.value]));
  const secondaryMap = new Map(secondary.map(item => [item.label, item.value]));
  const values = labels.flatMap(label => [primaryMap.get(label), secondaryMap.get(label)]).filter(value => value !== null && value !== undefined);
  const scale = chartScale(values);
  const slot = 700 / labels.length;
  const bars = labels.map((label, index) => {
    const value = primaryMap.get(label);
    if (value === undefined || value === null) return '';
    const valueY = scale.y(value);
    const x = 74 + index * slot + slot * 0.12;
    const width = slot * 0.48;
    const height = Math.max(2, Math.abs(scale.baseline - valueY));
    return '<g><title>' + esc(label) + ' · ' + esc(yField) + ': ' + format(value, 1) + '</title><rect x="' + x.toFixed(1) + '" y="' + Math.min(scale.baseline, valueY).toFixed(1) + '" width="' + width.toFixed(1) + '" height="' + height.toFixed(1) + '" rx="6" fill="#67e8f9"/><text class="chart-axis-label" x="' + (x + width / 2).toFixed(1) + '" y="296" text-anchor="middle">' + axisLabel(label) + '</text></g>';
  }).join('');
  const points = labels.map((label, index) => {
    const value = secondaryMap.get(label);
    return value === undefined || value === null ? null : [74 + index * slot + slot * 0.56, scale.y(value), label, value];
  }).filter(Boolean);
  const line = points.length > 1 ? '<polyline points="' + points.map(point => point[0].toFixed(1) + ',' + point[1].toFixed(1)).join(' ') + '" fill="none" stroke="#fbbf24" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' : '';
  const dots = points.map(point => '<circle cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1) + '" r="5" fill="#fbbf24"><title>' + esc(point[2]) + ' · ' + esc(secondaryField) + ': ' + format(point[3], 1) + '</title></circle>').join('');
  const zero = scale.baseline === 274 ? '' : '<line class="chart-zero" x1="62" y1="' + scale.baseline.toFixed(1) + '" x2="790" y2="' + scale.baseline.toFixed(1) + '"/>';
  const legend = '<g transform="translate(560 38)"><rect width="10" height="10" rx="3" fill="#67e8f9"/><text x="16" y="9">' + axisLabel(yField) + '</text><rect x="104" width="10" height="10" rx="3" fill="#fbbf24"/><text x="120" y="9">' + axisLabel(secondaryField) + '</text></g>';
  return chartFrame('<text class="chart-axis-title" x="62" y="20">Combinado · ' + esc(yField) + ' + ' + esc(secondaryField) + '</text>' + legend + zero + bars + line + dots, xField + ': barras y línea');
}

function forecastChart(rows, xField, yField, aggregation) {
  const observed = groupRows(rows, xField, yField, aggregation, 'original').slice(0, 18);
  if (observed.length < 3) return emptyChart('La proyección necesita al menos tres periodos con datos');
  const values = observed.map(item => item.value);
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  const varianceX = values.reduce((sum, _value, index) => sum + (index - meanX) ** 2, 0);
  const slope = varianceX ? values.reduce((sum, value, index) => sum + (index - meanX) * (value - meanY), 0) / varianceX : 0;
  const intercept = meanY - slope * meanX;
  const horizon = 3;
  const lastLabel = String(observed.at(-1).label);
  const projected = Array.from({ length: horizon }, (_, index) => ({ label: /^\d{4}$/.test(lastLabel) ? String(Number(lastLabel) + index + 1) : `+${index + 1}`, value: intercept + slope * (n + index) }));
  const all = [...values, ...projected.map(item => item.value)];
  const scale = chartScale(all);
  const slot = 700 / (n + horizon);
  const observedPoints = values.map((value, index) => [74 + index * slot + slot / 2, scale.y(value)]);
  const projectedPoints = projected.map((item, index) => [74 + (n + index) * slot + slot / 2, scale.y(item.value), item]);
  const observedLine = '<polyline points="' + observedPoints.map(point => point[0].toFixed(1) + ',' + point[1].toFixed(1)).join(' ') + '" fill="none" stroke="#67e8f9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
  const trendPoints = Array.from({ length: n + horizon }, (_, index) => [74 + index * slot + slot / 2, scale.y(intercept + slope * index)]);
  const trendLine = '<polyline points="' + trendPoints.map(point => point[0].toFixed(1) + ',' + point[1].toFixed(1)).join(' ') + '" fill="none" stroke="#fbbf24" stroke-width="3" stroke-dasharray="8 6" stroke-linecap="round"/>';
  const dots = observedPoints.map((point, index) => '<circle cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1) + '" r="5" fill="#67e8f9"><title>' + esc(observed[index].label) + ' · ' + esc(yField) + ': ' + format(values[index], 1) + '</title></circle>').join('');
  const futureDots = projectedPoints.map(point => '<circle cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1) + '" r="6" fill="#10233f" stroke="#fbbf24" stroke-width="3"><title>' + esc(point[2].label) + ' · estimación lineal: ' + format(point[2].value, 1) + '</title></circle>').join('');
  const labels = [...observed.map(item => item.label), ...projected.map(item => item.label)].map((label, index) => '<text class="chart-axis-label" x="' + (74 + index * slot + slot / 2).toFixed(1) + '" y="296" text-anchor="middle">' + axisLabel(label) + '</text>').join('');
  const divider = '<line x1="' + (74 + n * slot).toFixed(1) + '" y1="34" x2="' + (74 + n * slot).toFixed(1) + '" y2="274" stroke="#fbbf24" stroke-dasharray="3 5" opacity=".65"/><text class="chart-axis-label" x="' + (74 + n * slot + 6).toFixed(1) + '" y="48">proyección</text>';
  const legend = '<g transform="translate(470 20)"><rect width="10" height="10" rx="3" fill="#67e8f9"/><text x="16" y="9">observado</text><rect x="92" width="10" height="10" rx="3" fill="#fbbf24"/><text x="108" y="9">tendencia / estimación</text></g>';
  return chartFrame('<text class="chart-axis-title" x="62" y="20">Proyección lineal descriptiva · no es predicción</text>' + legend + divider + observedLine + trendLine + dots + futureDots + labels, xField + ': tendencia y proyección de ' + yField);
}

function correlationChart(rows) {
  const columns = state.columns.filter(column => column.type === 'number' && !/^(id|_row_id|year|año|latitude|longitude|lat|lon|lng)$/i.test(column.name)).slice(0, 8);
  if (columns.length < 2) return emptyChart('La matriz de correlación necesita dos campos numéricos');
  const correlation = (left, right) => {
    const pairs = rows.map(row => [toNumber(row[left]), toNumber(row[right])]).filter(pair => pair.every(value => value !== null));
    if (pairs.length < 3) return null;
    const meanLeft = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
    const meanRight = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
    const numerator = pairs.reduce((sum, pair) => sum + (pair[0] - meanLeft) * (pair[1] - meanRight), 0);
    const denominator = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[0] - meanLeft) ** 2, 0) * pairs.reduce((sum, pair) => sum + (pair[1] - meanRight) ** 2, 0));
    return denominator ? numerator / denominator : null;
  };
  const size = Math.min(52, 226 / columns.length);
  const startX = 188;
  const startY = 52;
  const labels = columns.map((column, index) => '<text class="chart-axis-label" x="' + (startX + index * size + size / 2).toFixed(1) + '" y="' + (startY - 8) + '" text-anchor="middle">' + axisLabel(column.name) + '</text><text class="chart-axis-label" x="' + (startX - 10) + '" y="' + (startY + index * size + size / 2 + 4).toFixed(1) + '" text-anchor="end">' + axisLabel(column.name) + '</text>').join('');
  const cells = columns.flatMap((left, rowIndex) => columns.map((right, columnIndex) => {
    const value = correlation(left.name, right.name);
    const positive = value === null || value >= 0;
    const opacity = value === null ? 0.18 : 0.22 + Math.abs(value) * 0.7;
    const fill = positive ? '#67e8f9' : '#fb7185';
    return '<g><rect x="' + (startX + columnIndex * size).toFixed(1) + '" y="' + (startY + rowIndex * size).toFixed(1) + '" width="' + (size - 2).toFixed(1) + '" height="' + (size - 2).toFixed(1) + '" rx="4" fill="' + fill + '" opacity="' + opacity.toFixed(2) + '"><title>' + esc(left.name) + ' / ' + esc(right.name) + ': ' + (value === null ? 'sin datos suficientes' : format(value, 2)) + '</title></rect><text x="' + (startX + columnIndex * size + size / 2).toFixed(1) + '" y="' + (startY + rowIndex * size + size / 2 + 4).toFixed(1) + '" text-anchor="middle">' + (value === null ? '—' : format(value, 2)) + '</text></g>';
  })).join('');
  return chartFrame('<text class="chart-axis-title" x="62" y="20">Matriz de correlación lineal</text>' + labels + cells + '<text class="chart-axis-label" x="188" y="300">azul: positiva · rosa: negativa · escala de -1 a 1</text>', 'Matriz de correlación');
}

function boxPlotChart(rows, xField, yField, ordering) {
  const groups = new Map();
  rows.forEach(row => {
    const value = toNumber(row[yField]);
    if (value === null) return;
    const label = String(row[xField] ?? 'Sin valor');
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(value);
  });
  let items = [...groups.entries()].map(([label, values]) => {
    values.sort((a, b) => a - b);
    const q = percentile => values[Math.min(values.length - 1, Math.floor((values.length - 1) * percentile))];
    return { label, min: values[0], q1: q(.25), median: q(.5), q3: q(.75), max: values[values.length - 1], count: values.length };
  });
  if (ordering === 'value-desc') items.sort((a, b) => b.median - a.median);
  if (ordering === 'value-asc') items.sort((a, b) => a.median - b.median);
  items = items.slice(0, 16);
  if (!items.length) return emptyChart('Selecciona una dimensión y una métrica numérica');
  const min = Math.min(...items.map(item => item.min));
  const max = Math.max(...items.map(item => item.max));
  const scale = value => 274 - ((value - min) / (max - min || 1)) * 220;
  const slot = 700 / items.length;
  const marks = items.map((item, index) => {
    const center = 74 + index * slot + slot / 2;
    const boxWidth = Math.min(42, slot * .52);
    const yMin = scale(item.min);
    const yQ1 = scale(item.q1);
    const yMedian = scale(item.median);
    const yQ3 = scale(item.q3);
    const yMax = scale(item.max);
    return `<g class="box-plot"><title>${esc(item.label)} · n=${item.count} · mediana ${format(item.median, 1)}</title><line x1="${center}" y1="${yMax}" x2="${center}" y2="${yMin}" stroke="#8bc9ff" stroke-width="2"/><line x1="${center - boxWidth / 3}" y1="${yMax}" x2="${center + boxWidth / 3}" y2="${yMax}" stroke="#8bc9ff"/><line x1="${center - boxWidth / 3}" y1="${yMin}" x2="${center + boxWidth / 3}" y2="${yMin}" stroke="#8bc9ff"/><rect x="${center - boxWidth / 2}" y="${yQ3}" width="${boxWidth}" height="${Math.max(3, yQ1 - yQ3)}" rx="5" fill="#a78bfa66" stroke="#a78bfa"/><line x1="${center - boxWidth / 2}" y1="${yMedian}" x2="${center + boxWidth / 2}" y2="${yMedian}" stroke="#fbbf24" stroke-width="3"/><text class="chart-axis-label" x="${center}" y="296" text-anchor="middle">${axisLabel(item.label)}</text></g>`;
  }).join('');
  return chartFrame(`<text class="chart-axis-title" x="62" y="20">${esc(yField)} · distribución por ${esc(xField)}</text>${marks}<text class="chart-axis-label" x="50" y="38" text-anchor="end">${format(max, 1)}</text><text class="chart-axis-label" x="50" y="274" text-anchor="end">${format(min, 1)}</text>`, 'Diagrama de caja');
}

function mapChart(rows, longitudeField, latitudeField, bubbles = false) {
  const rawPoints = rows.map((row, index) => ({
    longitude: toCoordinate(row[longitudeField]),
    latitude: toCoordinate(row[latitudeField]),
    label: row.name ?? row.site ?? row.title ?? `Fila ${index + 1}`,
    row
  })).filter(point => point.longitude !== null && point.latitude !== null && Math.abs(point.longitude) <= 180 && Math.abs(point.latitude) <= 90).slice(0, 500);
  const points = bubbles ? [...rawPoints.reduce((groups, point) => { const key = `${point.longitude.toFixed(5)}|${point.latitude.toFixed(5)}`; const current = groups.get(key) || { ...point, count: 0 }; current.count += 1; groups.set(key, current); return groups; }, new Map()).values()] : rawPoints.map(point => ({ ...point, count: 1 }));
  if (!points.length) return emptyChart('Selecciona longitud y latitud numéricas para crear el mapa');
  const minLon = Math.min(...points.map(point => point.longitude));
  const maxLon = Math.max(...points.map(point => point.longitude));
  const minLat = Math.min(...points.map(point => point.latitude));
  const maxLat = Math.max(...points.map(point => point.latitude));
  const padLon = (maxLon - minLon || 1) * .08;
  const padLat = (maxLat - minLat || 1) * .08;
  const x = value => 74 + ((value - (minLon - padLon)) / ((maxLon + padLon) - (minLon - padLon) || 1)) * 700;
  const y = value => 274 - ((value - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat) || 1)) * 220;
  const grid = [0.25, 0.5, 0.75].map(step => `<line x1="${74 + step * 700}" y1="34" x2="${74 + step * 700}" y2="274"/><line x1="74" y1="${274 - step * 220}" x2="774" y2="${274 - step * 220}"/>`).join('');
  const marks = points.map((point, index) => `<circle class="map-point" cx="${x(point.longitude).toFixed(1)}" cy="${y(point.latitude).toFixed(1)}" r="${bubbles ? Math.min(18, 5 + Math.sqrt(point.count) * 3) : 5}" fill="${COLORS[index % COLORS.length]}"><title>${esc(point.label)} · lon ${format(point.longitude, 5)} · lat ${format(point.latitude, 5)}${bubbles ? ` · ${point.count} registros` : ''}</title></circle>`).join('');
  const title = bubbles ? 'Mapa de burbujas · tamaño por registros coincidentes' : 'Mapa de puntos · coordenadas WGS84';
  return chartFrame(`<g class="map-grid">${grid}</g><text class="chart-axis-title" x="62" y="20">${title}</text>${marks}<text class="chart-axis-label" x="74" y="296">${format(minLon, 4)}°</text><text class="chart-axis-label" x="774" y="296" text-anchor="end">${format(maxLon, 4)}°</text><text class="chart-axis-label" x="58" y="40" text-anchor="end">${format(maxLat, 4)}°</text><text class="chart-axis-label" x="58" y="274" text-anchor="end">${format(minLat, 4)}°</text>`, bubbles ? 'Mapa de burbujas' : 'Mapa de puntos');
}

function densityMapChart(rows, longitudeField, latitudeField) {
  const points = rows.map((row, index) => ({
    longitude: toCoordinate(row[longitudeField]),
    latitude: toCoordinate(row[latitudeField]),
    label: row.name ?? row.site ?? row.title ?? `Fila ${index + 1}`
  })).filter(point => point.longitude !== null && point.latitude !== null && Math.abs(point.longitude) <= 180 && Math.abs(point.latitude) <= 90).slice(0, 2000);
  if (!points.length) return emptyChart('Selecciona longitud y latitud numéricas para calcular la densidad');
  const minLon = Math.min(...points.map(point => point.longitude));
  const maxLon = Math.max(...points.map(point => point.longitude));
  const minLat = Math.min(...points.map(point => point.latitude));
  const maxLat = Math.max(...points.map(point => point.latitude));
  const spanLon = maxLon - minLon || 1;
  const spanLat = maxLat - minLat || 1;
  const padLon = spanLon * .04;
  const padLat = spanLat * .04;
  const left = minLon - padLon;
  const right = maxLon + padLon;
  const bottom = minLat - padLat;
  const top = maxLat + padLat;
  const columns = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(points.length * 1.5))));
  const rowsCount = Math.min(7, Math.max(4, Math.ceil(columns * spanLat / spanLon)));
  const bins = Array.from({ length: rowsCount }, () => Array.from({ length: columns }, () => []));
  points.forEach(point => {
    const column = Math.min(columns - 1, Math.max(0, Math.floor((point.longitude - left) / (right - left) * columns)));
    const row = Math.min(rowsCount - 1, Math.max(0, rowsCount - 1 - Math.floor((point.latitude - bottom) / (top - bottom) * rowsCount)));
    bins[row][column].push(point);
  });
  const peak = Math.max(...bins.flat().map(cell => cell.length), 1);
  const palette = ['#d9f7ef', '#a7ead5', '#70ddba', '#39c39a', '#159576', '#0b6657'];
  const cellWidth = 700 / columns;
  const cellHeight = 220 / rowsCount;
  const marks = bins.flatMap((row, rowIndex) => row.map((cell, columnIndex) => {
    if (!cell.length) return '';
    const intensity = Math.min(palette.length - 1, Math.ceil(cell.length / peak * palette.length) - 1);
    const x = 74 + columnIndex * cellWidth;
    const y = 34 + rowIndex * cellHeight;
    const lonA = left + columnIndex / columns * (right - left);
    const lonB = left + (columnIndex + 1) / columns * (right - left);
    const latB = top - rowIndex / rowsCount * (top - bottom);
    const latA = top - (rowIndex + 1) / rowsCount * (top - bottom);
    const label = `${cell.length} registros · lon ${format(lonA, 4)}–${format(lonB, 4)} · lat ${format(latA, 4)}–${format(latB, 4)}`;
    return `<rect class="density-cell" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, cellWidth - 1).toFixed(1)}" height="${Math.max(1, cellHeight - 1).toFixed(1)}" rx="4" fill="${palette[intensity]}"><title>${esc(label)}</title></rect>`;
  })).join('');
  return chartFrame(`<g class="map-grid">${marks}</g><text class="chart-axis-title" x="62" y="20">Densidad por cuadrícula · ${points.length} coordenadas WGS84</text><text class="chart-axis-label" x="74" y="296">${format(minLon, 4)}°</text><text class="chart-axis-label" x="774" y="296" text-anchor="end">${format(maxLon, 4)}°</text><text class="chart-axis-label" x="58" y="40" text-anchor="end">${format(maxLat, 4)}°</text><text class="chart-axis-label" x="58" y="274" text-anchor="end">${format(minLat, 4)}°</text>`, 'Mapa de densidad por cuadrícula');
}

function heatmapChart(rows, xField, yField) {
  const points = rows.map(row => ({ x: toNumber(row[xField]), y: toNumber(row[yField]) })).filter(point => point.x !== null && point.y !== null).slice(0, 2500);
  if (!points.length) return emptyChart('Selecciona dos campos numéricos para calcular el mapa de calor');
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const columns = 8;
  const rowsCount = 6;
  const bins = Array.from({ length: rowsCount }, () => Array.from({ length: columns }, () => 0));
  points.forEach(point => {
    const column = Math.min(columns - 1, Math.max(0, Math.floor((point.x - minX) / spanX * columns)));
    const row = Math.min(rowsCount - 1, Math.max(0, rowsCount - 1 - Math.floor((point.y - minY) / spanY * rowsCount)));
    bins[row][column] += 1;
  });
  const peak = Math.max(...bins.flat(), 1);
  const palette = ['#d8ecfa', '#a9d4f0', '#70b9df', '#398fc4', '#1f6598', '#14466f'];
  const cellWidth = 700 / columns;
  const cellHeight = 220 / rowsCount;
  const marks = bins.flatMap((row, rowIndex) => row.map((count, columnIndex) => {
    if (!count) return '';
    const intensity = Math.min(palette.length - 1, Math.ceil(count / peak * palette.length) - 1);
    const x = 74 + columnIndex * cellWidth;
    const y = 34 + rowIndex * cellHeight;
    const xA = minX + columnIndex / columns * spanX;
    const xB = minX + (columnIndex + 1) / columns * spanX;
    const yB = maxY - rowIndex / rowsCount * spanY;
    const yA = maxY - (rowIndex + 1) / rowsCount * spanY;
    return `<rect class="heatmap-cell" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, cellWidth - 1).toFixed(1)}" height="${Math.max(1, cellHeight - 1).toFixed(1)}" rx="4" fill="${palette[intensity]}"><title>${format(count, 0)} registros · ${esc(xField)} ${format(xA, 2)}–${format(xB, 2)} · ${esc(yField)} ${format(yA, 2)}–${format(yB, 2)}</title></rect>`;
  })).join('');
  return chartFrame(`<g class="map-grid">${marks}</g><text class="chart-axis-title" x="62" y="20">Mapa de calor bivariado · recuento por celda</text><text class="chart-axis-label" x="74" y="296">${format(minX, 2)}</text><text class="chart-axis-label" x="774" y="296" text-anchor="end">${format(maxX, 2)}</text><text class="chart-axis-label" x="58" y="40" text-anchor="end">${format(maxY, 2)}</text><text class="chart-axis-label" x="58" y="274" text-anchor="end">${format(minY, 2)}</text>`, `${xField} y ${yField} · mapa de calor`);
}

function multiBarChart(rows, xField, yField, seriesField, aggregation, ordering, stacked = false) {
  const split = seriesGroups(rows, xField, yField, seriesField, aggregation, ordering);
  if (!split || !split.categoryNames.length || !split.seriesNames.length) return emptyChart('Selecciona una serie categórica para comparar grupos');
  const totals = split.categoryNames.map(category => split.seriesNames.reduce((sum, name) => sum + Math.max(0, split.value(category, name) ?? 0), 0));
  const max = Math.max(...(stacked ? totals : split.categoryNames.flatMap(category => split.seriesNames.map(name => Math.max(0, split.value(category, name) ?? 0)))), 1);
  const slot = 700 / split.categoryNames.length;
  const bars = split.categoryNames.map((category, categoryIndex) => {
    let offset = 0;
    return split.seriesNames.map((seriesName, seriesIndex) => {
      const value = Math.max(0, split.value(category, seriesName) ?? 0);
      const width = stacked ? slot * .72 : slot * .72 / split.seriesNames.length;
      const x = 74 + categoryIndex * slot + (stacked ? slot * .14 : slot * .14 + seriesIndex * width);
      const height = value / max * 220;
      const y = 274 - (stacked ? offset + height : height);
      offset += stacked ? height : 0;
      return `<g><title>${esc(category)} · ${esc(seriesName)}: ${format(value, 1)}</title><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(2, width - 2).toFixed(1)}" height="${Math.max(2, height).toFixed(1)}" rx="5" fill="${COLORS[seriesIndex % COLORS.length]}"/><text class="chart-axis-label" x="${(x + width / 2).toFixed(1)}" y="${Math.max(30, y - 5).toFixed(1)}" text-anchor="middle">${format(value, 0)}</text></g>`;
    }).join('') + (stacked ? '' : '');
  }).join('');
  const legend = split.seriesNames.map((name, index) => `<g transform="translate(${400 + (index % 4) * 96} ${8 + Math.floor(index / 4) * 15})"><rect width="9" height="9" rx="2" fill="${COLORS[index % COLORS.length]}"/><text class="chart-axis-label" x="14" y="8">${axisLabel(name)}</text></g>`).join('');
  const labels = split.categoryNames.map((category, index) => `<text class="chart-axis-label" x="${(74 + index * slot + slot / 2).toFixed(1)}" y="296" text-anchor="middle">${axisLabel(category)}</text>`).join('');
  return chartFrame(`<text class="chart-axis-title" x="62" y="20">${stacked ? 'Barras apiladas' : 'Barras agrupadas'} · ${esc(yField)}</text>${legend}${bars}${labels}`, `${xField} por ${yField} y ${seriesField}`);
}

function paretoChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, 'value-desc').slice(0, 18);
  if (!groups.length) return emptyChart();
  const total = groups.reduce((sum, item) => sum + Math.max(0, item.value || 0), 0) || 1;
  const max = Math.max(...groups.map(item => Math.max(0, item.value || 0)), 1);
  const slot = 700 / groups.length;
  let cumulative = 0;
  const marks = groups.map((item, index) => {
    const value = Math.max(0, item.value || 0);
    cumulative += value;
    const x = 74 + index * slot + slot * .14;
    const width = slot * .72;
    const height = value / max * 220;
    const lineX = x + width / 2;
    const lineY = 274 - cumulative / total * 220;
    return `<g><title>${esc(item.label)}: ${format(value, 1)} · acumulado ${format(cumulative / total * 100, 1)}%</title><rect x="${x.toFixed(1)}" y="${(274 - height).toFixed(1)}" width="${width.toFixed(1)}" height="${Math.max(2, height).toFixed(1)}" rx="6" fill="${COLORS[index % COLORS.length]}"/><circle cx="${lineX.toFixed(1)}" cy="${lineY.toFixed(1)}" r="4" fill="#fbbf24"/><text class="chart-axis-label" x="${lineX.toFixed(1)}" y="296" text-anchor="middle">${axisLabel(item.label)}</text></g>`;
  }).join('');
  const points = groups.map((item, index) => {
    const before = groups.slice(0, index + 1).reduce((sum, group) => sum + Math.max(0, group.value || 0), 0);
    return `${(74 + index * slot + slot * .5).toFixed(1)},${(274 - before / total * 220).toFixed(1)}`;
  }).join(' ');
  return chartFrame(`<text class="chart-axis-title" x="62" y="20">Pareto · ${esc(yField)} ordenado de mayor a menor</text>${marks}<polyline points="${points}" fill="none" stroke="#fbbf24" stroke-width="3" stroke-linejoin="round"/><text class="chart-axis-label" x="790" y="42" text-anchor="end">100%</text>`, 'Pareto');
}

function funnelChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, ordering).filter(item => item.value >= 0).slice(0, 8);
  if (!groups.length) return emptyChart('El embudo necesita valores no negativos');
  const max = Math.max(...groups.map(item => item.value), 1);
  const marks = groups.map((item, index) => {
    const width = Math.max(42, 650 * item.value / max);
    const x = 420 - width / 2;
    const y = 42 + index * 38;
    return '<g><title>' + esc(item.label) + ': ' + format(item.value, 1) + '</title><path d="M ' + x.toFixed(1) + ' ' + y + ' L ' + (x + width).toFixed(1) + ' ' + y + ' L ' + (x + width * .88).toFixed(1) + ' ' + (y + 29) + ' L ' + (x + width * .12).toFixed(1) + ' ' + (y + 29) + ' Z" fill="' + COLORS[index % COLORS.length] + '" opacity=".9"/><text x="420" y="' + (y + 19) + '" text-anchor="middle">' + axisLabel(item.label) + ' · ' + format(item.value, 0) + '</text></g>';
  }).join('');
  return chartFrame('<text class="chart-axis-title" x="62" y="20">Embudo por ' + esc(xField) + '</text>' + marks, 'Embudo');
}

function waterfallChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, ordering).slice(0, 12);
  if (!groups.length) return emptyChart();
  let running = 0;
  const steps = groups.map(item => { const start = running; running += item.value; return { ...item, start, end: running }; });
  const extent = steps.flatMap(item => [item.start, item.end]);
  const min = Math.min(0, ...extent);
  const max = Math.max(0, ...extent);
  const span = max - min || 1;
  const y = value => 274 - ((value - min) / span) * 220;
  const baseline = y(0);
  const slot = 700 / steps.length;
  const marks = steps.map((item, index) => {
    const top = Math.min(y(item.start), y(item.end));
    const height = Math.max(2, Math.abs(y(item.start) - y(item.end)));
    const x = 74 + index * slot + slot * .14;
    const width = slot * .72;
    const color = item.value >= 0 ? '#70e1bb' : '#fb7185';
    return '<g><title>' + esc(item.label) + ': ' + format(item.value, 1) + ' · acumulado ' + format(item.end, 1) + '</title><rect x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + width.toFixed(1) + '" height="' + height.toFixed(1) + '" rx="6" fill="' + color + '"/><text class="chart-axis-label" x="' + (x + width / 2).toFixed(1) + '" y="296" text-anchor="middle">' + axisLabel(item.label) + '</text></g>';
  }).join('');
  return chartFrame('<text class="chart-axis-title" x="62" y="20">Cascada · ' + esc(yField) + '</text><line class="chart-zero" x1="62" y1="' + baseline.toFixed(1) + '" x2="790" y2="' + baseline.toFixed(1) + '"/>' + marks, 'Cascada');
}

function radarChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, ordering).filter(item => item.value >= 0).slice(0, 8);
  if (!groups.length) return emptyChart();
  const max = Math.max(...groups.map(item => item.value), 1);
  const cx = 400; const cy = 150; const radius = 105;
  const point = (index, value) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / groups.length; const distance = radius * value / max; return [cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance]; };
  const grid = [0.33, 0.66, 1].map(level => { const points = groups.map((_, index) => { const p = point(index, max * level); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); return '<polygon points="' + points + '" fill="none" stroke="#33506c" stroke-width="1"/>'; }).join('');
  const axes = groups.map((item, index) => { const edge = point(index, max); const label = point(index, max * 1.16); return '<line x1="' + cx + '" y1="' + cy + '" x2="' + edge[0].toFixed(1) + '" y2="' + edge[1].toFixed(1) + '" stroke="#33506c"/><text class="chart-axis-label" x="' + label[0].toFixed(1) + '" y="' + label[1].toFixed(1) + '" text-anchor="middle">' + axisLabel(item.label) + '</text>'; }).join('');
  const values = groups.map((item, index) => { const p = point(index, item.value); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
  return chartFrame('<text class="chart-axis-title" x="62" y="20">Radar · ' + esc(yField) + '</text>' + grid + axes + '<polygon points="' + values + '" fill="#70e1bb44" stroke="#70e1bb" stroke-width="3"/><circle cx="' + cx + '" cy="' + cy + '" r="4" fill="#70e1bb"/>', 'Radar');
}

function treemapChart(rows, xField, yField, aggregation, ordering) {
  const groups = groupRows(rows, xField, yField, aggregation, ordering).filter(item => item.value >= 0).slice(0, 18);
  const total = groups.reduce((sum, item) => sum + item.value, 0);
  if (!groups.length || total <= 0) return emptyChart('El treemap necesita un total positivo');
  let cursor = 74;
  const marks = groups.map((item, index) => {
    const width = Math.max(3, 700 * item.value / total);
    const x = cursor; cursor += width;
    return '<g><title>' + esc(item.label) + ': ' + format(item.value, 1) + '</title><rect x="' + x.toFixed(1) + '" y="54" width="' + Math.max(2, width - 2).toFixed(1) + '" height="190" rx="6" fill="' + COLORS[index % COLORS.length] + '"/>' + (width > 45 ? '<text x="' + (x + width / 2).toFixed(1) + '" y="150" text-anchor="middle">' + axisLabel(item.label) + '</text><text class="chart-axis-label" x="' + (x + width / 2).toFixed(1) + '" y="170" text-anchor="middle">' + format(item.value, 0) + '</text>' : '') + '</g>';
  }).join('');
  return chartFrame('<text class="chart-axis-title" x="62" y="20">Treemap · ' + esc(yField) + '</text>' + marks, 'Treemap');
}

function sankeyChart(rows, sourceField, valueField, targetField, aggregation) {
  if (!targetField || targetField === sourceField) return emptyChart('El flujo necesita campos origen y destino distintos');
  const links = new Map();
  rows.forEach(row => {
    const source = String(row[sourceField] ?? 'Sin origen');
    const target = String(row[targetField] ?? 'Sin destino');
    const key = source + '\u0000' + target;
    if (!links.has(key)) links.set(key, []);
    links.get(key).push(row);
  });
  const values = [...links.entries()].map(([key, items]) => {
    const [source, target] = key.split('\u0000');
    return { source, target, value: aggregateValue(items, valueField, aggregation) };
  }).filter(link => link.value !== null && link.value > 0).sort((left, right) => right.value - left.value).slice(0, 80);
  if (!values.length) return emptyChart('No hay flujos positivos que representar');
  const sources = [...new Set(values.map(link => link.source))].slice(0, 8);
  const targets = [...new Set(values.map(link => link.target))].slice(0, 8);
  const filtered = values.filter(link => sources.includes(link.source) && targets.includes(link.target));
  const total = filtered.reduce((sum, link) => sum + link.value, 0);
  if (!total) return emptyChart();
  const sourceTotals = new Map(sources.map(source => [source, filtered.filter(link => link.source === source).reduce((sum, link) => sum + link.value, 0)]));
  const targetTotals = new Map(targets.map(target => [target, filtered.filter(link => link.target === target).reduce((sum, link) => sum + link.value, 0)]));
  const nodeHeight = amount => Math.max(14, amount / total * 184);
  const layout = (names, totals, x) => {
    const gap = 8;
    const heights = names.map(name => nodeHeight(totals.get(name)));
    const used = heights.reduce((sum, height) => sum + height, 0) + Math.max(0, names.length - 1) * gap;
    let y = 54 + Math.max(0, (184 - used) / 2);
    return new Map(names.map((name, index) => { const item = { x, y, height: heights[index] }; y += heights[index] + gap; return [name, item]; }));
  };
  const sourceLayout = layout(sources, sourceTotals, 120);
  const targetLayout = layout(targets, targetTotals, 620);
  const sourceCursor = new Map(sources.map(source => [source, 0]));
  const targetCursor = new Map(targets.map(target => [target, 0]));
  const ribbons = filtered.map((link, index) => {
    const source = sourceLayout.get(link.source);
    const target = targetLayout.get(link.target);
    const sourceThickness = Math.max(2, link.value / sourceTotals.get(link.source) * source.height);
    const targetThickness = Math.max(2, link.value / targetTotals.get(link.target) * target.height);
    const sourceY = source.y + sourceCursor.get(link.source) + sourceThickness / 2;
    const targetY = target.y + targetCursor.get(link.target) + targetThickness / 2;
    sourceCursor.set(link.source, sourceCursor.get(link.source) + sourceThickness);
    targetCursor.set(link.target, targetCursor.get(link.target) + targetThickness);
    return '<path d="M 248 ' + sourceY.toFixed(1) + ' C 370 ' + sourceY.toFixed(1) + ' 490 ' + targetY.toFixed(1) + ' 572 ' + targetY.toFixed(1) + '" fill="none" stroke="' + COLORS[index % COLORS.length] + '" stroke-width="' + Math.max(2, Math.min(26, (sourceThickness + targetThickness) / 2)).toFixed(1) + '" opacity=".62"><title>' + esc(link.source) + ' → ' + esc(link.target) + ': ' + format(link.value, 1) + '</title></path>';
  }).join('');
  const nodeMarkup = [...sources.map((name, index) => ({ name, item: sourceLayout.get(name), side: 'Origen', color: COLORS[index % COLORS.length] })), ...targets.map((name, index) => ({ name, item: targetLayout.get(name), side: 'Destino', color: COLORS[(index + sources.length) % COLORS.length] }))].map(node => {
    const labelX = node.item.x < 400 ? node.item.x - 10 : node.item.x + 60;
    const anchor = node.item.x < 400 ? 'end' : 'start';
    return '<g><rect x="' + node.item.x + '" y="' + node.item.y.toFixed(1) + '" width="50" height="' + node.item.height.toFixed(1) + '" rx="7" fill="' + node.color + '" opacity=".9"><title>' + esc(node.side + ': ' + node.name) + '</title></rect><text class="chart-axis-label" x="' + labelX + '" y="' + (node.item.y + node.item.height / 2 + 4).toFixed(1) + '" text-anchor="' + anchor + '">' + axisLabel(node.name) + '</text></g>';
  }).join('');
  return chartFrame('<text class="chart-axis-title" x="62" y="20">Flujo · ' + esc(sourceField) + ' → ' + esc(targetField) + ' · ' + esc(valueField) + '</text><text class="chart-axis-label" x="145" y="38">origen</text><text class="chart-axis-label" x="620" y="38">destino</text>' + ribbons + nodeMarkup, 'Diagrama Sankey de flujo');
}

export function chartSVG(type, rows, xField, yField, aggregation, ordering = 'original', seriesField = '', secondaryField = '') {
  if (type === 'grouped-bar') return multiBarChart(rows, xField, yField, seriesField, aggregation, ordering, false);
  if (type === 'stacked-bar') return multiBarChart(rows, xField, yField, seriesField, aggregation, ordering, true);
  if (type === 'line') return signedLineChart(rows, xField, yField, aggregation, ordering);
  if (type === 'area') return areaChart(rows, xField, yField, aggregation, ordering);
  if (type === 'stacked-area') return stackedAreaChart(rows, xField, yField, seriesField, aggregation, ordering);
  if (type === 'combo') return comboChart(rows, xField, yField, secondaryField, aggregation, ordering);
  if (type === 'forecast') return forecastChart(rows, xField, yField, aggregation);
  if (type === 'donut') return donutChart(rows, xField, yField, aggregation, ordering);
  if (type === 'scatter') return scatterChart(rows, xField, yField);
  if (type === 'histogram') return histogramChart(rows, yField);
  if (type === 'boxplot') return boxPlotChart(rows, xField, yField, ordering);
  if (type === 'map') return mapChart(rows, xField, yField);
  if (type === 'bubble-map') return mapChart(rows, xField, yField, true);
  if (type === 'density-map') return densityMapChart(rows, xField, yField);
  if (type === 'heatmap') return heatmapChart(rows, xField, yField);
  if (type === 'correlation') return correlationChart(rows);
  if (type === 'funnel') return funnelChart(rows, xField, yField, aggregation, ordering);
  if (type === 'waterfall') return waterfallChart(rows, xField, yField, aggregation, ordering);
  if (type === 'radar') return radarChart(rows, xField, yField, aggregation, ordering);
  if (type === 'treemap') return treemapChart(rows, xField, yField, aggregation, ordering);
  if (type === 'sankey') return sankeyChart(rows, xField, yField, seriesField, aggregation);
  if (type === 'pareto') return paretoChart(rows, xField, yField, aggregation, ordering);
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
