# CrediZas V23.8 — pestaña exclusiva de Análisis

Base acumulativa: **CrediZas V23.7**, sin modificar las reglas de métricas ni las operaciones de expedientes.

## Cambio solicitado

En `/admin`, al iniciar sesión, aparecen dos pestañas principales:

- **Casos** (predeterminada): conserva la gestión de expedientes, filtros, edición de estados, nueva solicitud, descarga Excel completa/visible, configuraciones de ejemplos, conexiones/permisos FCB y tabla operativa.
- **Análisis**: aloja exclusivamente los dos módulos agregados en V23.7: **Resultados y embudo de créditos** y **Créditos finalizados por departamento**. Conserva sus filtros por día, mes, año y asesor, indicadores, comparaciones, montos y reglas de fecha de cierre.

Los dos módulos de métricas **ya no aparecen encima de la tabla de casos**.

## Uso

1. Acceder a `/admin` e ingresar con la sesión administrativa habitual.
2. Pulsar **Casos** para gestionar solicitudes.
3. Pulsar **Análisis** para consultar reportes. La pestaña se puede abrir directamente como `/admin#analisis` después del ingreso.
4. Pulsar **Casos** para volver a la tabla sin perder la configuración de filtros del listado.

Las métricas se cargan cuando se abre Análisis, y se actualizan al volver a esa pestaña. Buscar expedientes en Casos no genera consultas de métricas innecesarias.

## Datos, seguridad e infraestructura

- No se modifica `/api/admin/analytics`, sus fórmulas, la definición de `CREDITO FINALIZADO CON EXITO`, la seguridad por sesión o la agregación por departamento.
- No cambia ninguna ruta del vendedor, selección de productos, ZasHome, FCB, BDA, Excel, OCR ni la administración de documentos.
- No se modifica `package.json`, `wrangler.jsonc`, bindings `CREDIZAS_KV` y `CREDIZAS_FILES` ni secretos.
- No requiere migración de KV/R2 ni nuevas variables.

## Verificación local realizada

- `node --check src/index.js` sin errores.
- Sintaxis del JavaScript embebido en `/admin` y `/` comprobada.
- Estructura del HTML comprobada: la tabla y sus controles están solo en **Casos**, las dos secciones de métricas solo en **Análisis**.
- Prueba `tests/regression-v23.8-analysis-tabs.mjs` valida separación, cambio de pestañas, enlaces de navegación, carga diferida y refresco posterior.
- Pruebas `tests/regression-v23*.mjs` de versiones anteriores aprobadas.
- No se ha realizado despliegue ni prueba interactiva completa en un navegador conectado a producción.

## Instalación

Reemplazar los archivos del repositorio por el **ZIP completo V23.8** y realizar el despliegue GitHub → Cloudflare usado por el proyecto. Mantener los recursos existentes. Después recargar `/admin` (Ctrl+F5) y comprobar la navegación entre **Casos** y **Análisis** con la sesión administrativa.
