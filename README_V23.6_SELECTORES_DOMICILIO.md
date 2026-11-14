# CrediZas V23.6 — desplegables de domicilio dentro del campo

**Base obligatoria:** V23.5 completa. Esta entrega contiene el proyecto completo. No reconstruye el Worker ni cambia infraestructura, esquemas KV/R2, bindings, `package.json`, `wrangler.jsonc` o secrets.

## Problema confirmado

Los campos de departamento, municipio y zona mezclaban el atributo HTML `list=` (que puede dibujar su propia flecha nativa, según el navegador) con un botón separado `▾` y otro botón externo de limpieza. Además, la lista personalizada no se aplicaba al campo aldea/colonia/barrio/caserío. La doble interacción confundía y el botón nativo podía no abrir la lista personalizada.

## Corrección

- Los cuatro campos (departamento, municipio, aldea/colonia/barrio/caserío y zona) utilizan **una sola flecha visible dentro del borde derecho del campo**.
- Se retira `list=` de esos cuatro `<input>` para eliminar el desplegable nativo duplicado, sin eliminar los `<datalist>` que contienen las opciones recibidas por la API de ZasHome o la matriz BDA. Las listas se usan como fuente para el menú personalizado.
- Clic en la flecha, o clic sobre el campo, abre la lista sin borrar el valor existente. Clic en una opción lo sustituye, con actualización normal del formulario y la cobertura BDA.
- Escribir filtra las coincidencias. Se puede seguir escribiendo manualmente si no existe la ubicación. Enter o flechas del teclado sirven para elegir; Escape cierra.
- Se quitó el botón exterior `×`; se puede editar con el teclado o usar «Borrar selección» dentro del menú desplegado.
- El menú conserva su propio desplazamiento para listas extensas. Cuando cambian las opciones por una carga asíncrona, el menú abierto se actualiza.
- Cambiar manualmente el departamento limpia municipio, poblado y zona; cambiar municipio limpia poblado y zona; cambiar poblado limpia zona. Esto evita guardar un poblado de otro municipio. Al cargar expedientes existentes desde los datos guardados se conservan sus campos, ya que el llenado programático emite `change` en lugar de `input`.
- Se descartan respuestas asíncronas de municipios, poblados o zonas correspondientes a una ubicación anterior.

## Áreas no modificadas

Fuente de departamentos/municipios ZasHome, fuente de poblados/zonas y observaciones BDA, advertencia no bloqueante de cobertura, múltiples productos Combo/Individual/FCB, precios FCB, permisos por bodega, cálculo +10% y redondeo superior a Q50, seguimiento, PDF y Excel se mantienen.

## Verificaciones realizadas

- `node --check src/index.js`
- `node tests/regression-v23.6-location-dropdowns.mjs`: valida HTML y CSS renderizado por el Worker, ausencia de `list=`/botones duplicados, opciones, eventos de apertura, selección, búsqueda, borrado y sintaxis de scripts en ambas vistas.
- Suites de regresión V23 a V23.5 ejecutadas.
- Verificación byte por byte de `package.json`, `wrangler.jsonc` y `src/bda-zones.js` frente a V23.5.

**No se certifica una prueba visual completa en Chromium:** el navegador headless disponible no logra navegar correctamente en este entorno; falta probar los clics visualmente en producción después del despliegue.

## Despliegue

1. Hacer backup del repositorio GitHub actual (V23.5).
2. Extraer el ZIP **completo V23.6**, reemplazar los archivos existentes y confirmar los cambios en `main`; el desplegador Cloudflare GitHub seguirá siendo el actual.
3. No cambiar ni reingresar variables, secrets, KV o R2. No hay migración.
4. Tras desplegar, recargar con Ctrl+F5.
5. En Paso 1 abrir cada una de las cuatro listas mediante la flecha interior, elegir una opción, volver a abrir y elegir otra sin borrar manualmente; probar escribir, seleccionar, borrar y escribir ubicación manual. Confirmar que la advertencia BDA se actualiza.
6. Comprobar una solicitud existente para verificar que sus campos se conservan y que se pueden añadir productos como antes.
