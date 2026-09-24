# Data Insight Web Tools

Colección de herramientas estáticas para análisis, tratamiento y comunicación de datos. Incluye un estudio web local, inspirado en los flujos de Tableau/MicroStrategy, sin servidor ni subida de archivos.

## Incluye

- **Dashboard Studio**: KPIs, tablas y visualizaciones de barras, líneas, áreas, anillos, dispersión, histogramas, cajas, mapas de puntos, mapas de burbujas, densidad por cuadrícula WGS84 y mapas de calor bivariados.
- **Data Profiler**: vacíos, duplicados exactos, tipos, cardinalidad, media, mediana, rangos y cobertura por campo.
- **Transform Lab**: filtros combinados, búsqueda, campos calculados aritméticos y exportación.
- **Pivot Lab**: agrupaciones y agregaciones locales por categoría, comparación visual y exportación del resumen.
- Entrada local de CSV, TSV, JSON, GeoJSON y datos pegados.
- Guardado y reapertura de proyectos `.data-insight.json`.
- Ordenación de tablas, paginación progresiva, chips de filtros, reinicio de vistas y duplicación/renombrado de tarjetas.
- Filtros de rango numérico y búsqueda por contenido en todos los campos, con actualización mientras se escribe.
- Visuales con título, orden por valor y configuración persistida; exportación CSV o JSON de la población visible con filtros y procedencia.
- Escalas firmadas para gráficos de barras y líneas, con línea cero y tooltips accesibles para valores negativos y positivos.
- Recuento automático por categoría cuando el conjunto no contiene métricas numéricas; el anillo rechaza valores negativos o sin total interpretable.
- Detección de coordenadas por alias habituales (`lat`, `latitude`, `latitud`, `lon`, `lng`, `longitude`, `longitud`, `x`, `y`), mapas de puntos con tooltips por registro y burbujas agregadas por coordenadas coincidentes; el mapa no inventa una cartografía base cuando solo hay coordenadas.
- Mapa de densidad por cuadrícula: divide la extensión real de las coordenadas en celdas, muestra la concentración de registros y conserva en cada celda el rango lon/lat y el recuento; no debe confundirse con una superficie estadística interpolada.
- Exportación SVG de la visualización activa para conservar escala vectorial, etiquetas y tooltips del gráfico en un archivo portable.
- Panel automático enriquecido: añade suma, media, completitud, distribución, evolución temporal, relación entre métricas, puntos espaciales, densidad y tabla cuando el esquema contiene los campos necesarios.
- Resumen analítico local con campos incompletos, rangos, valores atípicos IQR, variación temporal, correlación descriptiva y recomendaciones de visualización; no afirma causalidad.
- Asistente local con resumen determinista, panel recomendado y compatibilidad opcional con Gemini Nano mediante la Prompt API de Chrome. La IA solo se inicia tras una acción explícita y no sustituye la validación de unidades, proyección ni semántica.
- Reapertura tolerante de proyectos: valida pestañas, campos, filtros, tarjetas y metadatos antes de reconstruir la vista.
- Service worker para reutilizar la interfaz sin conexión después de la primera visita.
- Instalación PWA con icono, diseño responsive y controles táctiles para escritorio, tableta y móvil.

## Privacidad y trazabilidad

Los archivos se leen en el navegador mediante JavaScript y no se envían a un servidor. La muestra incluida es **sintética** y sirve solo para probar la interfaz; no representa un inventario oficial ni una fuente estadística. Cuando se cargue un archivo propio, la aplicación muestra su nombre como procedencia y conserva las filas dentro del proyecto guardado.

La integración con Gemini Nano es progresiva: si el navegador no expone `window.LanguageModel`, el estudio conserva el resumen y las recomendaciones deterministas sin descargar ningún modelo. En Chrome, la disponibilidad se consulta con `LanguageModel.availability()` y el modelo se solicita bajo demanda, siguiendo la [Prompt API oficial](https://developer.chrome.com/docs/ai/prompt-api).

## Uso

Puede abrirse con GitHub Pages o mediante un servidor estático local, por ejemplo `python -m http.server 8000`. El uso de HTTP local permite que el service worker y las importaciones ES funcionen de forma consistente.
