# CrediZas Worker V21.6

Versión de producción para Cloudflare Workers Builds.

## Cambios V21.6

- El administrador ya no puede cambiar manualmente el proceso.
- Precalificación y Formalización tienen estados independientes.
- Aprobar Precalificación conserva `APROBADA` y habilita automáticamente Formalización en `REQUIERE DATOS`.
- La Formalización mantiene su propio estado sin sobrescribir el de Precalificación.
- El vendedor ve ambos estados en su listado con indicadores grandes y visibles.
- El administrador ve controles de estado separados para Precalificación y Formalización.
- El proceso se deriva automáticamente de los estados del expediente.
- Se mantienen sin cambios `package.json`, `wrangler.jsonc`, KV, R2 y secrets existentes.

## Despliegue

Cloudflare Builds:

- Build command: ninguno
- Deploy command: `npm run deploy`
- Root directory: `/`

No es necesario cambiar variables, secretos ni bindings existentes.
