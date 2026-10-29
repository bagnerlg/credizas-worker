# CrediZas Worker V21.1

Corrección del flujo de aprobación del Paso 1.

## Cambios principales
- Guardar del administrador ahora muestra estado de guardado y no depende de `CSS.escape`.
- Al aprobar Paso 1, el proceso cambia explícitamente a `FORMALIZACION DE CREDITO`.
- El vendedor recibe permiso `start_stage2: true` y ve `Completar Paso 2`.
- El listado del vendedor se refresca automáticamente cada 5 segundos.
- Consultas de expedientes se hacen con `cache: no-store`.
- No cambia `wrangler.jsonc`, KV, R2 ni variables existentes.

## Deploy
Cloudflare Builds:
- Build command: Ninguno
- Deploy command: `npm run deploy`
- Root: `/`
