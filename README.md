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
