# CrediZas V23.4 — conexiones y productos mixtos

**Base oficial:** V23.3, sin cambios de arquitectura ni migraciones destructivas.

## Diagnóstico y corrección del error

V23.3 utilizaba `redirect: "error"` en llamadas `fetch()` a ZasHome Coverage y FCB. Cloudflare Workers solo admite `"manual"` o `"follow"`; por eso aparecía `Invalid redirect value...` incluso antes de comprobar si había credenciales correctas. V23.4 usa `redirect: "manual"` y valida cada destino antes de seguir redirecciones (hasta tres), permitiendo exclusivamente HTTPS en el host oficial correspondiente. Jamás reenvía credenciales a otro host.

- **Prueba ZasHome:** Administrador → Conexiones y permisos FCB → `Probar conexión ZasHome · Departamentos y municipios`.
- **Prueba FCB:** Administrador → Conexiones y permisos FCB → `Probar FCB y cargar bodegas`.
- Ante HTTP 401/403 en FCB, revisar `FCB_API_USER` y `FCB_API_PASSWORD` como **secrets** ya configurados en el Worker, y los permisos del webhook. No introducir estas credenciales en el navegador o en GitHub.
- Ante HTTP 401/403 en la API ZasHome privada, revisar `ZASHOME_API_KEY` (si el servicio la requiere). La ruta pública se intenta sin Bearer, como indica el contrato.
- Ante un 302/307 a otro dominio, la conexión se rechaza por seguridad; verificar el endpoint de origen. Ante JSON inválido, verificar autenticación y formato del webhook.
- El `304 Not Modified` visto en la consola de otro navegador no significa necesariamente que la consulta desde el Worker fallará. Desde el backend se solicita contenido sin caché y se necesita HTTP 200 con JSON.

## Productos y precios

El vendedor puede elegir **Combo, Individual y FCB** en cualquier orden, conservar las selecciones anteriores y agregar hasta 20 líneas distintas; cada línea tiene cantidad entre 1 y 99. El mismo SKU FCB se distingue por bodega. FCB está disponible únicamente para vendedores que cuenten con permisos asignados por el administrador para sus bodegas. El backend vuelve a comprobar permisos, stock acumulado y precios.

Para cada línea FCB el **vendedor autorizado escribe un precio de venta unitario (Q)**; ese valor no procede de `costo` del inventario DUPAZA, que nunca se expone al vendedor. Cada línea muestra subtotal y el total se actualiza mientras se escribe o ajusta la cantidad. No se puede enviar si falta el precio de venta de algún FCB o si tiene más de dos decimales.

**Monto base** = suma de cantidad × precio unitario de cada línea, ya sea Combo, Individual o FCB.

**Monto solicitado al banco** = redondear hacia arriba a múltiplo de Q50 (monto base × 1.10).

**Enganche estimado** = 5 % del monto solicitado. Las cuotas estimadas y la resolución bancaria mantienen sus reglas anteriores.

Ejemplo validado: Combo Q1,000×1; Individual Q250×2; FCB Q325.50×2, Q270×1 y Q145×1. Base Q2,566; +10 % = Q2,822.60; monto banco Q2,850; enganche estimado Q142.50.

Los documentos PDF de Paso 1/2 incluyen el desglose por artículo con precio unitario y subtotal, y el monto total a solicitar. Los expedientes antiguos conservan los campos históricos; los nuevos guardan adicionalmente `solicitud.total_venta_productos` sin alterar estructuras anteriores.

## Instalación

1. Realizar copia de seguridad del repositorio GitHub y conservar cualquier configuración Cloudflare actual.
2. Reemplazar los archivos del repositorio `bagnerlg/credizas-worker` con el contenido **completo** del ZIP V23.4; mantener la rama `main` y el despliegue existente. No borrar datos KV/R2 ni cambiar secrets.
3. Verificar que `package.json` y `wrangler.jsonc` conservan los valores actuales. No se requiere migración de KV/R2.
4. Permitir que Cloudflare despliegue la nueva versión desde GitHub como en V23.3.
5. Entrar a `/admin`, ejecutar **ambos botones de conexión**, autorizar al vendedor sus bodegas FCB y guardar permisos.
6. Entrar como vendedor autorizado; seleccionar Combo → Individual → FCB → otro FCB; escribir precio de venta de cada línea y confirmar base, +10 %, Q50, enganche y cuotas estimadas.
7. Completar precalificación de prueba y revisar listado administrativo, PDF y Excel. No usar datos reales para probar hasta verificar el comportamiento esperado.

## Pruebas locales verificadas

- `node --check src/index.js` — correcto.
- `node tests/regression-v23.mjs` — correcto.
- `node tests/regression-v23.1-export.mjs` — correcto.
- `node tests/regression-v23.2-zashome-coverage.mjs` — correcto (actualizada la aserción a `manual`, manteniendo la restricción de host).
- `node tests/regression-v23.3-products-fcb-zones.mjs` — correcto.
- `node tests/regression-v23.4-connections-mixed-pricing.mjs` — correcto; incluye redirecciones seguras y maliciosas, 5 líneas mixtas, distintas bodegas, precios FCB, validación de stock sumado, permisos y HTML/JS embebido.

**Limitaciones:** Las llamadas a APIs externas de estas pruebas son simuladas; no se probaron credenciales reales de FCB ni lectura de inventario en vivo, y no se verificó el comportamiento completo en un navegador gráfico. No se desplegó esta versión en producción.

## Archivos de configuración protegidos

`package.json` y `wrangler.jsonc` son **idénticos** a V23.3. Se mantienen el Worker `datosform`, los bindings `CREDIZAS_KV`/`CREDIZAS_FILES`, namespace KV, bucket R2, variables y secrets existentes. La lógica BDA y las restricciones por zona existentes se conservan sin cambios.
