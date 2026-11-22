# CrediZas V23.10 — Rechazos visibles en Análisis

**Base acumulativa:** V23.9 completa. Solo se cambian el motor de indicadores, la presentación de la pestaña Análisis y las pruebas relacionadas. No se modifica la operación de solicitudes, aprobación bancaria, catálogos, FCB, cobertura BDA, archivos, Excel, autenticación ni infraestructura.

## Causa

El motor V23.9 únicamente capturaba `STAGE3_RECHAZADO_CLIENTE` / `stage3.client_rejection.rejected_at` para el indicador «Cliente rechaza las condiciones». **No reconocía** los eventos `ADMIN_CONTROL_PRECALIFICACION` y `ADMIN_CONTROL_FORMALIZACION` con `to_state: 'RECHAZADA'`, aunque el administrador sí guardaba esos cambios en el historial y en los controles de cada etapa.

## Nuevos indicadores

En **Administrador → Análisis → Resultados y embudo de créditos**, para los rangos A y B y el asesor seleccionado:

- **Precalificaciones rechazadas (administrador):** expedientes con rechazo de Paso 1.
- **Formalizaciones rechazadas (administrador):** expedientes con rechazo de Paso 2.
- **Total de rechazos administrativos:** un expediente como máximo por rango aunque sea rechazado más de una vez.
- **TOTAL DE SOLICITUDES RECHAZADAS (incluye cliente):** unión de rechazos administrativos y rechazos expresos del cliente, sin duplicados por expediente dentro del período.
- «Cliente rechaza las condiciones» mantiene su indicador separado original. «Cliente no responde» sigue siendo un seguimiento abierto, **no** un rechazo.

Dos tarjetas nuevas muestran **Solicitudes rechazadas · A** y **Rechazadas por administrador · A**, además de la comparación con B. El total de casos actualmente en estado rechazado se presenta en la nota informativa independientemente del rango, para facilitar la conciliación.

## Fechas y compatibilidad

- Las fechas se interpretan según `America/Guatemala`, igual que en V23.9.
- Se prioriza la fecha de los eventos de rechazo administrativo y del cliente guardados en el historial.
- Los expedientes anteriores sin evento de rechazo fechado se consultan de forma defensiva: si siguen en estado `RECHAZADA`, se usa `closed_at` o una fecha de decisión específica cuando exista.
- Si solo existe `updated_at`, se utiliza como **aproximación claramente advertida**; no debe considerarse una fecha auditada.
- Si no existe fecha utilizable, el expediente rechazado se cuenta en el total de rechazadas **actualmente** y se advierte que no puede ubicarse con certeza en un período A/B.
- Un expediente reabierto puede conservar sus eventos de rechazo históricos; un mismo expediente solo se cuenta una vez por indicador dentro del mismo rango.
- Los rechazos **no se cuentan como créditos finalizados con éxito**, ni cambian la medición de montos bancarios finales.

## Pruebas ejecutadas

Suite nueva `tests/regression-v23.10-rejections.mjs`: rechazo en ambos pasos, rechazo de cliente, doble motivo de rechazo en un mismo expediente sin duplicar el total, fechas Guatemala en límite de día, expedientes reabiertos, respaldo para datos legados, reporte de estimaciones y casos sin fecha, conteos por día/mes/año, filtro por asesor, autenticación de `/api/admin/analytics` y renderizado real de las filas/tarjetas del frontend en VM.

También se ejecutaron con éxito las 11 suites existentes. Se actualizó solamente la aserción de cantidad de filas y KPI de la prueba `regression-v23.9-front-alignment.mjs` para reflejar los nuevos indicadores. Sintaxis `node --check` aprobada. Las pruebas son locales con expedientes simulados; **no** constituyen comprobación visual en Chromium ni una conciliación de los datos reales de producción.

## Instalación

Reemplaza los archivos del repositorio en su raíz por los del ZIP V23.10 y utiliza el despliegue actual de GitHub → Cloudflare. Recarga `/admin`, entra a **Análisis** y selecciona los rangos A/B y el asesor. No requiere migraciones, reinicio de datos, nuevas variables ni secretos. `package.json`, `wrangler.jsonc`, bindings KV/R2 y configuración Cloudflare se conservan literalmente.
