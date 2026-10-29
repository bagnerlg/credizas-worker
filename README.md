# CrediZas Worker · V20

Worker de CrediZas desplegado desde GitHub directamente con Cloudflare Workers Builds.

## Cambios principales V20

- Acceso de vendedores por nombre + PIN de 4 dígitos.
- Alta de vendedor desde la propia aplicación.
- PIN guardado como hash firmado en KV; no se guarda en texto plano.
- Protección contra intentos repetidos de PIN.
- Cada vendedor solo ve sus expedientes.
- Después de enviar un paso, el expediente queda bloqueado para el vendedor.
- El vendedor solo puede corregir cuando el administrador marca `REQUIERE DATOS`.
- Al reenviar una corrección, el estado pasa automáticamente a `REINGRESADO`.
- El administrador controla estado y proceso.
- Procesos: `PRECALIFICACION` y `FORMALIZACION DE CREDITO`.
- Estados: `SUBIDA`, `EN REVISION`, `REQUIERE DATOS`, `REINGRESADO`, `APROBADA`, `RECHAZADA`.
- Producto ZasHome mostrado como tarjeta con imagen, SKU y monto solicitado.
- Precio catálogo y cálculo del 50% ocultos al vendedor y no enviados al navegador.
- Panel `/admin` con filtros, columnas seleccionables, cambio rápido de estado/proceso y PDFs por paso.
- Exportación administrativa a Excel compatible (`.xls`).
- Protección R2 al 80% conservada.

## Cloudflare Builds

- Rama: `main`
- Directorio raíz: `/`
- Comando de compilación: ninguno
- Comando de implementación: `npm run deploy`

## Bindings

- KV: `CREDIZAS_KV`
- R2: `CREDIZAS_FILES`

## Secrets runtime

Deben permanecer como Secrets del Worker:

- `OPENAI_API_KEY`
- `ZASHOME_API_KEY` (si el endpoint requiere Bearer)
- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

`ADMIN_SESSION_SECRET` también se usa para firmar las sesiones de vendedores y el hash de sus PIN.

## Uso

- `/` → ingreso de vendedor y solicitudes.
- `/admin` → panel administrativo.

El administrador habilita el Paso 2 cambiando el proceso del expediente a `FORMALIZACION DE CREDITO`.
