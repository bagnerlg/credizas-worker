# CrediZas Worker V22.3.3

Corrección de compatibilidad del Paso 3 en administración.

## Corrección principal
- `adminDocManagerHtml()` ya no puede bloquear el render del Paso 3.
- Normaliza y filtra documentos heredados/incompletos.
- Si el administrador de archivos encuentra un error, muestra una advertencia y el Paso 3 continúa cargando.
- `wireAdminDocDelete()` también queda protegido contra nodos/IDs inválidos.
- Compatible con expedientes antiguos que todavía conservan `stage3_documents.quote_evidence` de V22.1/V22.2.

## Conserva
- OCR temporal de cuotas sin guardar nuevas fotos en R2.
- OCR de aprobación final del banco.
- Eliminación de archivos desde administración.
- Flujo de ratificación, banco, PDFs, evidencia y cierre.

No modifica `wrangler.jsonc`, `package.json`, KV, R2, secrets ni variables existentes.
