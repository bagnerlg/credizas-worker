> **V23.9:** corrige el conteo de envíos Paso 1, separa expedientes con actividad, permite comparar dos rangos de fechas y alinea columnas y totales del análisis. Ver `README_V23.9_ANALISIS_RANGOS_Y_RECONCILIACION.md`.

> **V23.8:** separa Casos y Análisis en pestañas de Administración. El embudo y los resultados por departamento están únicamente en Análisis. Véase `README_V23.8_PESTANA_ANALISIS.md`.

> **V23.7:** incluye tablero administrativo de métricas por día/mes/año, cierres por departamento y seguimiento no responde. Véase `README_V23.7_TABLERO_METRICAS.md`.

# CrediZas V23.3

Continuidad completa sobre V23.2: prueba de conexión ZasHome, productos múltiples Combo/Individual/FCB, permisos FCB por asesor y bodega, Enter, selección desplegable editable de ubicaciones, y notas BDA por zona. Consulta `README_V23.3_FCB_MULTIPRODUCTO_BDA.md` para secretos, seguridad, pruebas y despliegue.

---

# CrediZas V23.2

Continuidad sobre V23.1. Se habilitó por defecto la URL oficial de la API ZasHome Coberturas para departamentos y municipios, manteniendo BDA para poblados y reglas de crédito. Lee `README_V23.2_ZASHOME_COBERTURAS.md` para configuración, seguridad, pruebas y despliegue. Se conservaron todas las mejoras y documentos anteriores.

---

# CrediZas V23.1

Continuidad sobre V23.0. Se corrigió la exportación Excel administrativa; consulta `README_V23.1_EXCEL_ADMINISTRADOR.md`. Conserva todos los cambios y documentación anteriores.

---

# CrediZas V23.0

Continuidad sobre la base oficial V22.9. Consulta `README_V23.0_CAMBIOS_Y_DESPLIEGUE.md` para las cuatro mejoras, limitaciones y pruebas.

---

# CrediZas V22.9

Base: **V22.8**. Mantiene sin cambios `package.json`, `wrangler.jsonc`, KV, R2, bindings, secrets y recursos existentes.

## Cambios principales

1. **PDF Paso 1 enriquecido**
   - Incluye miniatura del producto/combo seleccionado cuando la imagen del catálogo está disponible.
   - Muestra descripción/nombre del producto, SKU y precio de catálogo recibido desde la API de ZasHome.
   - Incluye monto solicitado y enganche de precalificación.

2. **Enganche de precalificación**
   - Se calcula automáticamente como 5% del monto solicitado.
   - Se presenta como referencia inicial y se aclara que puede ser Q0.00 según récord crediticio.
   - Las cuotas estimadas aclaran que pueden ser menores según el récord crediticio del cliente.

3. **Ratificación de condiciones antes de Formalización**
   - El enganche real enviado por administración se presenta de forma grande y llamativa.
   - El vendedor puede confirmar las condiciones o marcar `Cliente rechaza las condiciones`.
   - El rechazo cierra el expediente con estado `CREDITO NO ACEPTADO POR CLIENTE`.

4. **Progreso al preparar documentos de Formalización**
   - Al seleccionar selfie, documento de domicilio o sustento de ingresos se muestra la ventana compacta de progreso mientras el navegador prepara los archivos.
   - La lectura con IA continúa mostrando su progreso hasta finalizar.

5. **Dirección completa Paso 2**
   - Se fuerza la lectura directa del campo visible de dirección antes de construir el payload, evitando falsos mensajes de `Hace falta la dirección completa` cuando el usuario ya la escribió.

6. **PDF completo Paso 2**
   - El PDF final se genera y persiste antes de ocultar el formulario del vendedor.
   - Ya no se descartan silenciosamente errores de generación.
   - Al enviarse Formalización, el administrador debe ver el enlace `P2` cuando la generación finaliza correctamente.

7. **Seguimiento de Formalización**
   - Un Paso 2 enviado en `SUBIDA`, `REINGRESADO`, `EN REVISION` o `REQUIERE DATOS` ya posiciona el seguimiento visual en `Formalización`.
   - En Administración aparece una acción destacada `⚡ Revisar Formalización` en lugar de `Sin acción pendiente`.
   - Al aprobar Formalización, la siguiente acción continúa siendo `⚡ Paso 3 · Banco y firma`.

8. **Paso 3**
   - Conserva el requisito de exactamente 3 PDF para firma y huella.
   - Mantiene OCR bancario editable, evidencia final y cierre administrativo.

## Infraestructura

No requiere cambios de Cloudflare. El catálogo continúa usando:

`https://api.zashome.com.gt/api/integrations/excel/catalog`

## CrediZas V23.4 — continuidad (14/11/2026)

Esta versión deriva de V23.3. Corrige `fetch()` de ambas integraciones para Cloudflare Workers; mejora la venta FCB con precios unitarios editables por vendedor autorizado, total y subtotales en vivo, solicitudes que mezclan Combo/Individual/FCB, y refuerza la validación de stock sumado y el detalle de PDF. Ver `README_V23.4_CONEXIONES_PRECIOS_MIXTOS.md`.

## V23.5 — Corrección del buscador al agregar varios productos

El listado de resultados ahora se muestra inmediatamente después de la búsqueda, antes de las líneas ya seleccionadas, incluso al buscar un segundo o tercer producto. Consultar `README_V23.5_RESULTADOS_PRODUCTOS.md`.

## V23.6 — Un único desplegable dentro de cada campo de domicilio

Se corrigió la doble flecha y los botones externos de los campos departamento, municipio, aldea/colonia/barrio/caserío y zona. Ahora una sola flecha interior abre la lista, incluso si el campo ya tiene una selección, y se conserva la búsqueda o escritura manual. Ver `README_V23.6_SELECTORES_DOMICILIO.md`.
