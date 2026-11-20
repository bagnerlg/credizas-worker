# CrediZas V23.9 — Análisis conciliado y comparación de dos rangos

Versión completa acumulativa **sobre CrediZas V23.8**. Cambia únicamente el motor de métricas y la presentación de la pestaña **Análisis**. Las funciones de Casos, crédito, archivos, API, FCB, catálogo, cobertura BDA, PDF, Excel, sesiones, Cloudflare KV y R2 permanecen con el comportamiento anterior.

## Motivo de la corrección

En V23.8 `Solicitudes ingresadas` se agregaba con `created_at` (fecha de creación del registro), aunque en el flujo de negocio el envío de Precalificación es el evento relevante. La pantalla informaba a la vez `N expedientes analizados` (toda la base consultada), lo que podía interpretarse erróneamente como `N enviados durante el día`. También solo admitía un período con comparación automática contra el anterior, y el ancho/encabezado de las tablas no dejaba suficientemente claros los totales comparados.

## Nuevo significado de las cifras

- **Solicitudes enviadas (Paso 1):** fecha del evento original `STAGE1_SUBIDA` o `ADMIN_CREATE_STAGE1`. Si no hay historial original válido, `stage1.submitted_at`. Si el historial solo contiene correcciones y existe `created_at`, se utiliza como fecha **aproximada** (advertida expresamente). Nunca se toma una corrección como un envío nuevo si puede evitarse.
- **Expedientes con actividad registrada:** casos distintos con al menos un movimiento fechado (historial o `updated_at`) en el rango, aunque la solicitud sea anterior. No se suman como solicitudes nuevas.
- **Expedientes en base analizados:** cantidad de registros KV leídos para construir las métricas, con independencia del período. No es el total enviado.
- **Otras etapas:** eventos de aprobación, cuotas, confirmación/rechazo, Formalización y respuesta bancaria por sus fechas correspondientes, sin mezclar fecha de creación ni última modificación.
- **Créditos finalizados:** solamente `stage3.status === 'CREDITO FINALIZADO CON EXITO'`, por `finalized_at` o evento histórico de cierre; cupo bancario real. Una aprobación parcial no cuenta como cierre.
- **Un expediente por indicador por rango:** el mismo evento repetido en un rango no infla el total; los rangos A/B se computan separadamente.
- **Eficiencia:** cohorte de solicitudes enviadas en A o B y su avance acumulado conocido, separada de los eventos registrados en el rango.

Las fechas se interpretan con `America/Guatemala`. Si falta fecha cierta en un expediente antiguo, se informa en las notas en lugar de inventar un momento de envío o cierre. No es posible garantizar la conciliación exacta con producción sin poder consultar los datos KV reales.

## Comparaciones personalizadas

Pestaña **Análisis**:

1. Elegir vista **Por día / Por mes / Por año**.
2. Seleccionar **Período A: Desde / Hasta**.
3. Seleccionar **Período B: Desde / Hasta**.
4. Elegir asesor o todos, y pulsar **Actualizar métricas**.

De forma predeterminada A es el día/mes/año actual y B es el inmediatamente anterior. Se pueden comparar dos intervalos no contiguos; ambos usan la misma definición de indicadores. Validaciones: Desde <= Hasta; límites de 93 días / 36 meses / 20 años por rango para mantener legible y manejable la tabla.

La tabla por departamento muestra columnas del intervalo A (desglose diario/mensual/anual), más **Total A, Total B, Variación y Monto A**, con un pie de totales alineado con los encabezados. Las etiquetas de la tabla de eventos indican claramente A y B. Las columnas están formadas con el mismo orden y número para cabecera, filas y pie; el desplazamiento horizontal permite intervalos más largos.

## Ejemplo de conciliación en producción

Para investigar un día como **19/11/2026**:

1. Elegir **Por día** y A desde/hasta `19/11/2026`.
2. Elegir B desde/hasta `18/11/2026`, o el rango histórico deseado.
3. Confirmar en el historial de los expedientes qué casos enviaron por primera vez el Paso 1 el 19; esos son **Solicitudes enviadas**.
4. Los casos modificados o revisados el 19, pero iniciados antes, aparecerán en **Expedientes con actividad**, no en nuevos enviados.
5. Revisar el número **expedientes en base analizados**: informa el volumen del conjunto consultado, no los envíos del día.
6. Si aparecen advertencias de estimación histórica, no tratar esas fechas como exactas. Para cifras auditadas en expedientes antiguos, cotejar la fuente documental.
7. Para departamentos, filtrar expedientes con estado exacto `CREDITO FINALIZADO CON EXITO` y comparar la fecha de cierre, no la fecha de inicio.

## Pruebas

Ejecutadas localmente las suites anteriores de `tests/` y dos nuevas:

- `tests/regression-v23.9-analytics-ranges.mjs`: fecha de envío vs creación y modificación; historial de correcciones; comparación A/B no contigua; zona horaria GT; totales y montos; filtro por asesor; API segura; 214 expedientes paginados; fechas inválidas.
- `tests/regression-v23.9-front-alignment.mjs`: mismo número de columnas en cabeceras, filas y pie en las tres vistas, además de indicadores A/B y notas.

También se verificó la sintaxis de los scripts embebidos en el HTML del administrador y se conservaron las suites V23.0–V23.8. La prueba visual completa en Chromium **no pudo finalizar** por restricciones del entorno. No se consultaron ni cambiaron registros reales en Cloudflare.

## Despliegue

Entregar la carpeta raíz del ZIP al repositorio existente `bagnerlg/credizas-worker` en `main`, conservando su mismo pipeline GitHub → Cloudflare Worker `datosform`. No cambiar `package.json`, `wrangler.jsonc`, bindings `CREDIZAS_KV`, `CREDIZAS_FILES`, bucket ni secretos. No se requieren nuevas variables ni migración de datos.

Una vez que Cloudflare publique la nueva revisión, recargar `/admin` con Ctrl+F5 y abrir **Análisis**. Las cifras reales solo se validarán en ese entorno, no en las pruebas simuladas.
