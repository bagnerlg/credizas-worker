# CrediZas Worker V22.4

Base: V22.3.3, conservando la infraestructura y configuración de V22.2.

Cambios principales:
- OCR de cuotas automático al seleccionar una o varias imágenes.
- Las imágenes de cuotas siguen siendo temporales y no se guardan en R2.
- OCR de cuotas usa estructura visual de Tesseract (blocks/words), corrige confusiones como 1O -> 10 y empareja Plazo/Cuota por fila.
- OCR de aprobación bancaria automático al seleccionar la imagen.
- Detección reforzada de Plazo, incluyendo fallback por posición visual.
- Paso 3 administrativo progresivo: después de completar una acción desaparece su formulario y solo se muestra la siguiente tarea.
- Flujo administrador: Cuotas -> Ratificación -> Respuesta banco -> 2 PDF -> Evidencia vendedor -> Cierre.
- Flujo vendedor también oculta formularios ya completados y muestra solo la acción pendiente.
- Las imágenes de aprobación bancaria continúan guardándose como respaldo del expediente.
- No modifica package.json, wrangler.jsonc, bindings, KV, R2, secrets ni variables existentes.
