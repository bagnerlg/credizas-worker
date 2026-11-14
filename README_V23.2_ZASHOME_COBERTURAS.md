# CrediZas V23.2 — Integración oficial ZasHome Coberturas

**Base:** V23.1 completa sobre V23.0 y V22.9. No elimina funcionalidades previas ni cambia infraestructura, KV, R2, secrets, `package.json` o `wrangler.jsonc`.

## Qué se habilita

La URL del directorio de departamentos y municipios ahora está definida **por defecto** en el backend (Cloudflare Worker):

`https://api.zashome.com.gt/api/integrations/excel/coverage`

**No es necesario crear la variable `ZASHOME_COVERAGE_URL` para usar el endpoint oficial**. Si ya existía esa variable en Cloudflare, prevalece sobre el valor predeterminado: comprueba que sea exactamente la ruta oficial de arriba, o elimínala si estaba configurada con un valor antiguo/incorrecto.

Esta integración toma `departamento` y `municipio` de cada elemento de la propiedad `data` de la respuesta ZasHome. Omite los demás campos de logística al formar el selector. Filtra municipios por departamento y evita duplicados. Las respuestas se mantienen en caché en memoria por 10 minutos para reducir peticiones. Se conserva la entrada manual cuando una ubicación no aparezca.

**No se usa ZasHome para aprobar o bloquear créditos.** Las aldeas, caseríos y restricciones de crédito siguen consultándose exclusivamente desde el documento/matriz BDA existente (`config:bda_coverage:070-3-37`). Este cambio no sobrescribe esa configuración ni registra coordenadas o información de fletes en expedientes.

## Seguridad y contingencia

- El navegador llama únicamente a `/api/coverage/departments` y `/api/coverage/municipalities` del Worker, bajo la sesión actual de vendedor/administrador.
- El Worker hace GET al host oficial con HTTPS; no sigue redirecciones. Primero prueba sin clave, como indica la documentación de lectura pública.
- Si la API responde HTTP 401/403 y existe el secret **`ZASHOME_API_KEY`**, el Worker reintenta desde el servidor con `Authorization: Bearer ...`. La clave no se incluye en HTML ni JavaScript del navegador. El secret no es obligatorio para una ruta pública.
- Si la API no está disponible, la captura del expediente no se bloquea: se muestra un aviso y se ofrece temporalmente el directorio BDA de respaldo. Esta contingencia no sustituye el origen oficial cuando responde correctamente.
- No se necesita cambiar despliegue GitHub → Cloudflare, ni crear KV/R2, ni actualizar Wrangler.

## Pruebas locales completadas

```bash
node --check src/index.js
node tests/regression-v23.mjs
node tests/regression-v23.1-export.mjs
node tests/regression-v23.2-zashome-coverage.mjs
```

Se probaron el contrato JSON **simulado** `data: [{municipio_id,departamento,municipio,...}]`, deduplicación y filtros, URL oficial automática, caché, acceso autenticado al Worker, comportamiento público y retry Bearer opcional, fallback, preservación BDA, secretos no expuestos en HTML, código frontend y exportación administrativa de 87 columnas. Ninguna prueba escribió en KV o R2 reales.

**Pendiente antes de declarar la integración verificada en producción:** entrar con un vendedor de prueba, comprobar que la API devuelve municipios reales (por ejemplo, uno de los municipios permitidos de un departamento), confirmar el indicador `Departamentos y municipios: ZasHome Coberturas`, comprobar la lista de poblados BDA y validar una exportación Excel de un expediente real conocido. La herramienta externa no permitió obtener el JSON real del endpoint en esta sesión.

## Despliegue

1. Respaldar la versión productiva y la configuración/variables del Worker.
2. Si existe `ZASHOME_COVERAGE_URL`, actualizarla con la URL oficial de arriba o retirarla para usar el valor predeterminado. No es necesario exponer ni rotar las credenciales existentes.
3. Sustituir en la rama `main` el proyecto por el contenido completo del ZIP y mantener el flujo de despliegue de GitHub/Cloudflare actual.
4. Confirmar `/`, `/admin`, el directorio de departamento/municipio, poblados BDA y la exportación Excel.

**No se ha realizado despliegue a producción desde esta entrega.**
