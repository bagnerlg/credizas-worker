# CrediZas V22.2

Versión basada en V22.1. Mantiene los bindings, KV, R2, variables y secrets existentes.

## Paso 3 actualizado

1. El administrador sube una o varias fotos del listado de plazos/cuotas.
2. Tesseract.js OCR (ejecutado en el navegador) detecta pares Plazo + Cuota usando también la posición visual de los números.
3. El administrador revisa/corrige las opciones detectadas y escribe el enganche (puede ser Q0.00).
4. El administrador envía las opciones al vendedor.
5. El vendedor ve un selector combinado `Plazo — Cuota`, confirma con el cliente y ratifica una sola opción.
6. Solo después de la ratificación se habilita al administrador la sección de solicitud/respuesta final del banco.
7. Al guardar la respuesta final se habilita la carga de exactamente dos PDF para firma y huella.
8. El vendedor descarga los PDF y como último paso sube:
   - selfie/foto final del cliente;
   - una o varias fotos de los documentos firmados;
   - geolocalización (manual, dispositivo o futura API ZasHome).
9. El administrador revisa la evidencia y pulsa `Crédito finalizado con éxito`.

## Tracking para el vendedor

El listado de solicitudes muestra una línea de tiempo visual:

Ingresado → Precalificación → Formalización → Cuotas → Ratificado → Banco → Firma → Evidencia → Finalizado

Así el asesor puede consultar rápidamente en qué punto está el cliente.

## OCR

Se usa Tesseract.js v5 desde CDN en el navegador. Las imágenes se procesan en el navegador y luego se conservan en R2 como respaldo del expediente. Si el OCR no reconoce correctamente una fila, el administrador puede corregirla o agregarla manualmente antes de enviarla al vendedor.

## Infraestructura

No se modifican `wrangler.jsonc`, `package.json`, KV, R2, secrets ni variables existentes.
