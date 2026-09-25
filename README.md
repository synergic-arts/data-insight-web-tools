# Data Insight Web Tools

Colección de herramientas estáticas para análisis, tratamiento y comunicación de datos. Incluye un estudio web local, inspirado en los flujos de Tableau/MicroStrategy, sin servidor ni subida de archivos.

## Incluye

- **Dashboard Studio**: KPIs, tablas y 23 familias de visualización: barras simples, agrupadas y apiladas, líneas, áreas simples y apiladas, combinado de barras y línea, proyección lineal descriptiva, anillos, dispersión, histogramas, cajas, mapas de puntos, mapas de burbujas, densidad por cuadrícula WGS84, calor bivariado, matriz de correlación, embudo, cascada, radar, treemap, Sankey de flujos y Pareto.
- **Mapas Leaflet configurables**: los mapas de puntos, burbujas y densidad muestran las filas filtradas sobre OpenStreetMap o bases Esri de calles, oscuro y satélite; incluyen control de capas, zoom, ajuste a la extensión, atribución, tooltips y ficha emergente con todos los atributos del registro.
- **Data Profiler**: vacíos, duplicados exactos, tipos, cardinalidad, media, mediana, rangos y cobertura por campo.
- **Transform Lab**: filtros combinados, búsqueda, campos calculados aritméticos y exportación.
- **Pivot Lab**: agrupaciones y agregaciones locales por categoría, comparación visual y exportación del resumen.
- Entrada local de CSV, TSV, JSON, GeoJSON y datos pegados.
- Guardado y reapertura de proyectos `.data-insight.json`.
- Ordenación de tablas, paginación progresiva, chips de filtros, reinicio de vistas y duplicación/renombrado de tarjetas.
- Filtros de rango numérico y búsqueda por contenido en todos los campos, con actualización mientras se escribe.
- Visuales con título, orden por valor y configuración persistida; exportación CSV o JSON de la población visible con filtros y procedencia.
- Creador de visualizaciones por caja: elige campos X/Y, métrica secundaria para el tamaño agregado de burbujas/densidad, serie, operación, orden, tipo de gráfico y base cartográfica; cada configuración se puede editar, duplicar, recolocar, redimensionar y guardar en el proyecto.
- Agregaciones configurables por visual: suma, media, mediana, mínimo, máximo, recuento y valores distintos; se aplican localmente a las filas filtradas y se conservan al guardar el proyecto.
- Dashboard responsive de 12 columnas: tarjetas arrastrables, movimiento arriba/abajo, ajuste de ancho y alto, edición por tarjeta, autoorganización adaptada a escritorio/tableta/móvil y modo Autodashboard según el esquema detectado.
- Series por color para comparar una segunda dimensión en barras agrupadas o apiladas; Pareto ordenado con acumulado y leyendas compactas.
- Comparación de dos métricas en un gráfico combinado, composición temporal mediante áreas apiladas y matriz de correlación lineal para todos los campos numéricos compatibles.
- Escalas firmadas para gráficos de barras y líneas, con línea cero y tooltips accesibles para valores negativos y positivos.
- Recuento automático por categoría cuando el conjunto no contiene métricas numéricas; el anillo rechaza valores negativos o sin total interpretable.
- Detección de coordenadas por alias habituales (`lat`, `latitude`, `latitud`, `lon`, `lng`, `longitude`, `longitud`, `x`, `y`), mapas de puntos con tooltips por registro y burbujas agregadas por coordenadas coincidentes; el mapa no inventa una cartografía base cuando solo hay coordenadas.
- Coordenadas profesionales en decimal o DMS (`39:47:31.2N`, `3°42'36.0W`), autodetección de alias Este/Norte y conversión local de geometrías GeoJSON declaradas como Web Mercator (EPSG:3857/900913) o UTM ETRS89/WGS84 (EPSG:258xx/326xx/327xx) a WGS84, conservando el CRS detectado como metadato.
- Mapa de densidad por cuadrícula: divide la extensión real de las coordenadas en celdas, muestra la concentración de registros y conserva en cada celda el rango lon/lat y el recuento; no debe confundirse con una superficie estadística interpolada.
- Exportación SVG de la visualización activa para conservar escala vectorial, etiquetas y tooltips del gráfico en un archivo portable.
- Panel automático enriquecido: añade suma, media, completitud, distribución, evolución temporal, relación entre métricas, puntos espaciales, densidad y tabla cuando el esquema contiene los campos necesarios.
- Resumen analítico local con campos incompletos, rangos, valores atípicos IQR, variación temporal, correlación descriptiva y recomendaciones de visualización; no afirma causalidad.
- Órdenes de dashboard en lenguaje natural sin servidor: reconoce peticiones de mapas, calor bivariado, dispersión, histogramas, cajas, anillos, líneas, áreas simples/apiladas, gráficos combinados, matriz de correlación, barras agrupadas/apiladas, Pareto, embudos, cascadas, radar y treemap; valida los campos disponibles y añade la visual resultante al panel.
- Órdenes locales de tratamiento en lenguaje natural: elimina duplicados, quita filas vacías, rellena faltantes con media/moda o un valor indicado, limpia espacios, crea campos normalizados min–max, marca atípicos por IQR y segmenta métricas en Bajo/Medio/Alto; cada cambio queda en un historial reversible con `Deshacer`.
- Asistente local con resumen determinista, panel recomendado y compatibilidad opcional con Gemini Nano mediante la Prompt API de Chrome. La IA solo se inicia tras una acción explícita y no sustituye la validación de unidades, proyección ni semántica.
- Gemini Nano puede devolver un plan JSON validado contra el esquema real y aplicar una visualización o tratamiento permitido; el plan no puede inventar campos y los tratamientos siguen pasando por la ruta local reversible.
- El resumen automático incluye mediana, desviación estándar descriptiva, correlación, pendiente y R² de regresión descriptiva cuando hay pares numéricos; se muestran como asociación, no como causalidad ni predicción.
- Reapertura tolerante de proyectos: valida pestañas, campos, filtros, tarjetas y metadatos antes de reconstruir la vista.
- Service worker para reutilizar la interfaz sin conexión después de la primera visita.
- Instalación PWA con icono, diseño responsive y controles táctiles para escritorio, tableta y móvil.

## Privacidad y trazabilidad

Los archivos se leen en el navegador mediante JavaScript y no se envían a un servidor. La muestra incluida es **sintética** y sirve solo para probar la interfaz; no representa un inventario oficial ni una fuente estadística. Cuando se cargue un archivo propio, la aplicación muestra su nombre como procedencia y conserva las filas dentro del proyecto guardado.

Los mapas Leaflet necesitan conexión para descargar las teselas seleccionadas. Cada base mantiene la atribución del proveedor; la capa de datos y sus atributos siguen procesándose localmente y no se transmiten.

La integración con Gemini Nano es progresiva: si el navegador no expone `window.LanguageModel`, el estudio conserva el resumen y las recomendaciones deterministas sin descargar ningún modelo. En Chrome, la disponibilidad se consulta con `LanguageModel.availability()` y el modelo se solicita bajo demanda, siguiendo la [Prompt API oficial](https://developer.chrome.com/docs/ai/prompt-api).

## Uso

Puede abrirse con GitHub Pages o mediante un servidor estático local, por ejemplo `python -m http.server 8000`. El uso de HTTP local permite que el service worker y las importaciones ES funcionen de forma consistente.
