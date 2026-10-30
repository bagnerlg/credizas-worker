# CrediZas Worker · V21.4

Versión correctiva sobre V21.2.

## Cambios principales

- Paso 2 muestra únicamente campos obligatorios:
  - Dirección completa del domicilio.
  - Datos de empresa/institución cuando corresponde.
  - Datos de actividad/oficio/remesas cuando corresponde.
  - Tres referencias.
- Se ocultaron campos opcionales que saturaban la captura: zona/sector, referencia de ubicación, contador, ingreso documentado, correo y NIT de empresa.
- Los campos obligatorios del Paso 2 se pintan rojo/verde según validación.
- Selfie, documento de domicilio y sustento de ingresos del Paso 2 se guardan en R2.
- Los metadatos de documentos quedan asociados al expediente en KV.
- Al abrir un expediente desde vendedor o administrador se recuperan datos y documentos anteriores.
- Al cambiar un archivo se vuelve a habilitar el análisis con IA; si son los mismos documentos ya analizados, permanece deshabilitado.
- Eliminar desde administración borra el registro KV, PDFs y documentos asociados en R2 y retira la fila inmediatamente del listado.
- El backend valida los campos obligatorios y la existencia de documentos antes de aceptar el Paso 2.
- `package.json` y `wrangler.jsonc` se conservan sin cambios respecto de V21.2; no se crean bindings, variables ni recursos nuevos.

## Despliegue

Sustituir los archivos del repositorio y hacer commit a `main`. Cloudflare Builds conserva:

- Comando de compilación: ninguno.
- Implementar comando: `npm run deploy`.
- Directorio raíz: `/`.


## Cambios V21.4
- DPI frente/reverso se guardan en R2 y se restauran al editar o consultar un expediente.
- Expedientes antiguos intentan recuperar DPI desde el caché local del mismo navegador; si nunca se almacenó, se solicita volver a subirlo una vez.
- Botón Cancelar edición en Paso 1 y Paso 2.
- El vendedor ve el Estado y Proceso como indicadores visibles en su listado.
- La eliminación administrativa también elimina las fotos DPI guardadas en R2.
