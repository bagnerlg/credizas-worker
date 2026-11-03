# CrediZas Worker V22.1

Base: V21.8 estable.

## Paso 3
- Admin aprueba Formalización y se habilita Paso 3.
- Admin carga opciones de plazo/cuota.
- Vendedor ratifica con cliente una opción.
- Admin registra envío por correo y respuesta final del banco: autorización, cupo, enganche, plazo y cuota.
- Admin carga exactamente dos PDF para firma/huella.
- Vendedor descarga documentos y registra entrega con foto + geolocalización.

## Respuestas a requerimientos
Cuando Admin usa REQUIERE INFORMACIÓN en Paso 1 o Paso 2, vendedor debe responder qué corrigió/aclaró al reenviar.

## Ejemplos configurables
Admin puede subir ejemplos de selfie con DPI, documento de domicilio, firma/huella y foto de entrega. Se guardan en R2 usando la KV y bindings existentes.

## Geolocalización
Manual o GPS del dispositivo. Se incluye opción de fuente ZasHome para futura integración API; no se llama todavía a una API geográfica porque no se ha definido su endpoint/contrato.


## V22.1 · Evidencia de cuotas

- El administrador sigue siendo quien define y envía las opciones estructuradas de **plazo + cuota**.
- El vendedor solo puede ratificar **una opción de las enviadas por el administrador**.
- El administrador puede guardar opcionalmente de 1 a 8 imágenes del listado original de cuotas/plazos recibido.
- Las imágenes son solo respaldo visual y se almacenan en R2; no sustituyen los valores estructurados.
- El vendedor puede abrir las imágenes de respaldo mientras consulta las opciones enviadas.
