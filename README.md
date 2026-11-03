# CrediZas V22.3

Versión basada en V22.2. Mantiene los bindings, KV, R2, variables, secrets, `package.json` y `wrangler.jsonc` existentes.

## Cambios principales

### 1. Cuotas por OCR sin guardar las fotos

- El administrador selecciona una o varias fotos del listado de cuotas/plazos.
- Tesseract.js procesa las imágenes en el navegador.
- CrediZas genera el listado estructurado `Plazo + Cuota`.
- El administrador revisa/corrige los pares detectados y escribe el enganche, que puede ser Q0.00.
- Al pulsar `Enviar cuotas al vendedor`, solo se guardan los datos estructurados.
- Las fotos usadas para OCR de cuotas **no se suben a R2** y se descartan al salir de la pantalla.
- Si existían fotos de cuotas almacenadas por V22.1/V22.2, el administrador puede eliminarlas para liberar espacio.

Si el administrador modifica las cuotas después de que el vendedor ya ratificó, CrediZas advierte que se reiniciará la ratificación y los pasos posteriores. El backend elimina la aprobación bancaria, PDFs y evidencias posteriores para evitar mezclar condiciones diferentes.

### 2. Aprobación final del banco por OCR

Después de la ratificación del vendedor:

1. El administrador selecciona la captura/imagen de aprobación del banco.
2. Tesseract.js lee automáticamente:
   - Número de autorización
   - Cupo autorizado
   - Enganche
   - Plazo
   - Cuota
   - Fecha de respuesta
3. Los datos aparecen como una vista de revisión, sin campos de digitación manual.
4. Solo se habilita `Guardar respuesta detectada del banco` cuando los seis campos fueron reconocidos.
5. La imagen de aprobación sí se guarda en R2 como respaldo del expediente.

Si se reemplaza la imagen y los datos de autorización cambian, los PDF y evidencias posteriores se invalidan automáticamente para mantener coherencia documental.

### 3. Administración de archivos

El administrador puede ver y eliminar archivos persistentes del expediente:

- DPI frente/reverso
- Selfie con DPI
- Domicilio
- Sustento de ingresos
- Imagen de aprobación bancaria
- PDFs de firma/huella
- Selfie/foto final
- Fotos de documentos firmados
- Fotos de cuotas antiguas de versiones anteriores

En Paso 3 existe además un acordeón `Administrar todos los archivos del expediente` para revisar archivos de las tres etapas.

Eliminar ciertos archivos obligatorios puede reiniciar etapas posteriores. Por ejemplo:

- eliminar la aprobación bancaria invalida los PDF y la evidencia final;
- eliminar un PDF vuelve el Paso 3 a la fase de documentos;
- eliminar evidencia final permite que el vendedor la cargue nuevamente.

### 4. Flujo del Paso 3

Cuotas OCR → vendedor ratifica → solicitud al banco → aprobación OCR → 2 PDF → evidencia final + geolocalización → `Crédito finalizado con éxito`.

## Tracking del vendedor

Se mantiene la línea de tiempo visual:

Ingresado → Precalificación → Formalización → Cuotas → Ratificado → Banco → Firma → Evidencia → Finalizado

## Infraestructura

No se modifican `package.json`, `wrangler.jsonc`, KV, R2, secrets ni variables existentes.
