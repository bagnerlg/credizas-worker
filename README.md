# CrediZas Worker V22.0

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
