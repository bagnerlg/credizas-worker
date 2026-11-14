# CrediZas V23.5 — corrección visual del buscador de productos

**Base:** V23.4 completo. No se modifican rutas, flujos de negocio, cálculos crediticios, esquema KV, almacenamiento R2, configuración de Cloudflare ni secretos.

## Problema identificado

La pantalla de precalificación renderizaba los resultados de producto en `<div id="productResults">` antes de la lista de productos añadidos `<div id="selectedProduct">`, pero el CSS aplicaba a los resultados `position:absolute; top:100%` en el contenedor `.product-search-wrap`, que incluye **toda la lista de productos ya agregados**. Esto hacía que los resultados de una segunda búsqueda aparecieran físicamente debajo de las tarjetas anteriores y fuera de la vista inmediata.

## Solución aplicada

El selector mantiene el mismo HTML y funcionalidad de búsqueda, pero los resultados pasan a `position:static` y al flujo normal de la página, inmediatamente después del campo de búsqueda/botón y **antes** de los artículos seleccionados. Se mantiene un máximo de 340 px de altura con desplazamiento vertical interno para que búsquedas extensas no alarguen excesivamente el formulario.

Los productos ya agregados permanecen debajo, con sus cantidades y precios. Se conservan los tres filtros Combo/Individual/FCB, selección múltiple de hasta 20 líneas, permisos FCB, existencias, precios del vendedor y cálculo +10% redondeado al próximo Q50.

## Instalación

1. Conservar una copia de V23.4 y respaldar el repositorio GitHub.
2. Reemplazar el repositorio por **todos los archivos del ZIP V23.5**. Desplegar por el flujo GitHub → Cloudflare existente, rama `main`.
3. Limpiar la caché o recargar forzadamente el navegador (Ctrl+F5) para obtener el CSS nuevo.
4. En Paso 1, seleccionar un artículo, buscar otro código y comprobar que los resultados aparecen **encima** de los artículos ya agregados y se pueden elegir sin desplazarse al final. Repetir con Combo/Individual/FCB en un asesor autorizado.
5. Comprobar que subtotal, enganche y monto a solicitar se mantienen correctos. No se requiere migración.

## Validaciones

- `node --check src/index.js`
- `node tests/regression-v23.mjs`
- `node tests/regression-v23.1-export.mjs`
- `node tests/regression-v23.2-zashome-coverage.mjs`
- `node tests/regression-v23.3-products-fcb-zones.mjs`
- `node tests/regression-v23.4-connections-mixed-pricing.mjs`
- `node tests/regression-v23.5-product-results-layout.mjs`

Las pruebas automatizadas verifican la generación real de HTML, los scripts embebidos y el orden/estilo de resultados. La validación visual manual en navegador real de producción queda pendiente; no se modificó ni desplegó el Worker de producción.
