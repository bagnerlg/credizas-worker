# CrediZas Worker V22.5

Base: V22.4 estable.

Cambios principales:
- Datos OCR de aprobación bancaria editables antes de guardar (incluye plazo si Tesseract se equivoca).
- Documentos firmados aceptan imágenes o PDF.
- Geolocalización mediante enlace compartido de Google Maps; CrediZas resuelve latitud/longitud automáticamente.
- Eliminados “Fuente de ubicación” y “Usar ubicación del dispositivo”.
- Corregido `/api/stage3/delivery` para el nuevo formato de ubicación y archivos firmados.
- Barra global de progreso en operaciones de envío/guardado para vendedor y administrador; permanece visible hasta recibir respuesta del servidor.
- No cambia wrangler.jsonc, package.json, KV, R2 ni secrets.
