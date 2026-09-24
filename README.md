# Data Insight Web Tools

Colección de herramientas estáticas para análisis, tratamiento y comunicación de datos. Incluye un estudio web local, inspirado en los flujos de Tableau/MicroStrategy, sin servidor ni subida de archivos.

## Incluye

- **Dashboard Studio**: KPIs, tablas y gráficos de barras, líneas, anillo, dispersión e histogramas.
- **Data Profiler**: vacíos, duplicados exactos, tipos, cardinalidad, rangos y cobertura por campo.
- **Transform Lab**: filtros combinados, búsqueda, campos calculados aritméticos y exportación.
- Entrada local de CSV, TSV, JSON, GeoJSON y datos pegados.
- Guardado y reapertura de proyectos `.data-insight.json`.
- Ordenación de tablas, paginación progresiva, chips de filtros, reinicio de vistas y duplicación/renombrado de tarjetas.
- Service worker para reutilizar la interfaz sin conexión después de la primera visita.
- Diseño responsive y controles táctiles para escritorio, tableta y móvil.

## Privacidad y trazabilidad

Los archivos se leen en el navegador mediante JavaScript y no se envían a un servidor. La muestra incluida es **sintética** y sirve solo para probar la interfaz; no representa un inventario oficial ni una fuente estadística. Cuando se cargue un archivo propio, la aplicación muestra su nombre como procedencia y conserva las filas dentro del proyecto guardado.

## Uso

Puede abrirse con GitHub Pages o mediante un servidor estático local, por ejemplo `python -m http.server 8000`. El uso de HTTP local permite que el service worker y las importaciones ES funcionen de forma consistente.
