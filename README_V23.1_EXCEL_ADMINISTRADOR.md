# CrediZas V23.1 — Reporte Excel completo del administrador

**Base:** CrediZas V23.0 completo, basado en V22.9. Esta entrega corrige únicamente el listado/exportación Excel y amplía las columnas seleccionables del panel administrativo. No hay cambios en el esquema de almacenamiento ni se requiere migración.

## Problema encontrado

El botón «Descargar Excel» enviaba `fields=...` con la selección de **columnas visibles** de la tabla; al no estar marcadas departamento y municipio, nunca se solicitaban. Además, el exportador aceptaba solo los identificadores de su lista limitada `ADMIN_EXPORT_FIELDS`, y `caseSummary()` no incluía departamento, municipio o poblado aunque sí están almacenados en `stage1.data.informacion_complementaria`.

## Corrección

- **Descargar Excel completo:** descarga todas las columnas del reporte, independientemente de cuáles estén visibles en el panel. Incluye **87 columnas**, cuando los datos existen en el expediente: identificación, contacto, departamento, municipio, aldea/caserío/poblado, cobertura BDA, producto, ingresos, Paso 2, tres referencias, estados, responsables, fechas y datos bancarios / de entrega.
- **Excel · columnas visibles:** botón separado para descargar únicamente las columnas marcadas en «Seleccionar columnas visibles».
- El selector visual ahora permite activar en pantalla **Departamento**, **Municipio**, **Aldea / caserío**, **Vivienda**, **Fuente/Origen/Subtipo de ingresos**, **Educación**, **Estado civil**, **Fecha de nacimiento** y **Cobertura BDA**.
- Cada valor se obtiene del expediente en KV existente sin modificarlo. Los campos que aún no están completados se dejan vacíos y los expedientes históricos incompletos no bloquean la exportación.
- DNI/DPI, NIT, teléfonos y número de autorización bancaria se exportan como texto, evitando pérdida de ceros a la izquierda. Los importes se exportan como números. Las fechas ISO se muestran con horario de Guatemala y dd/mm/yyyy.
- Siguen aplicándose filtros de búsqueda, estado, proceso y vendedor, y la exportación requiere sesión de administrador.
- Se conserva el formato Excel XML 2003 (`.xls`) utilizado por la versión anterior, sin introducir dependencias ni modificar `package.json`.

## Verificaciones locales

```bash
node --check src/index.js
node tests/regression-v23.mjs
node tests/regression-v23.1-export.mjs
```

Se verificó con datos simulados un Excel de 87 columnas: departamento, municipio, poblado, referencias P2, cuotas y condiciones bancarias P3, preservación de ceros y caracteres especiales, fechas, filtros, compatibilidad con expedientes sin datos completos y autorización administrativa. Se probó la sintaxis del script embebido de `/admin` y `/` mediante el conjunto de regresión existente. 

**No se ha realizado despliegue ni verificación contra KV/R2 de producción.** No se modificaron bindings, nombres de Worker, secrets, `package.json` ni `wrangler.jsonc`.

## Instalación

1. Hacer copia del repositorio actual y de la configuración del Worker.
2. Usar este ZIP **completo** para actualizar el repositorio existente de CrediZas. Conservar todos los secrets/bindings del despliegue actual.
3. Ejecutar las tres pruebas indicadas y revisar el diff antes de desplegar mediante la integración GitHub/Cloudflare ya configurada.
4. Entrar a `/admin`, aplicar filtros y pulsar **Descargar Excel completo**. Comprobar departamento, municipio y demás datos de un expediente real conocido.

No requiere nuevos servicios, cambios de Wrangler ni migración de KV/R2. Se conserva el README de V23.0 y su configuración de Coberturas ZasHome, incluida la necesidad de configurar `ZASHOME_COVERAGE_URL` con la ruta real, cuando corresponda.
