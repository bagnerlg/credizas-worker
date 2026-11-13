# CrediZas V23.0 — continuidad sobre V22.9

**Base de código:** CrediZas V22.9 original aportada en `CrediZas_Migracion_Completa_V22.9.zip`. Esta entrega es un proyecto completo, no un parche aislado. No hay cambios destructivos sobre expedientes existentes.

## Qué cambia

1. **Formalización / lectura de documentos.** Se corrige el permiso de pantalla que podía permanecer desactualizado después de que el vendedor ratificaba las cuotas. El botón «Leer documentos y completar datos» se habilita cuando se han cargado selfie con DPI, documento de domicilio y, solo cuando corresponda, sustento de ingresos. Se conserva el requisito de ratificación previa. Si ya se leyeron los mismos documentos, se indica continuar con el formulario.
2. **Cliente no contesta.** Junto a «Cliente rechaza las condiciones» aparece «Cliente no contesta». Su acción registra `CLIENTE NO CONTESTA` sin cerrar el expediente. En el listado del vendedor aparece «Retomar contacto», que cambia a `PENDIENTE RATIFICACION` y permite volver a mostrar las cuotas originales para confirmar o rechazar posteriormente. Se conserva el rechazo definitivo separado.
3. **Origen geográfico.** Departamento y municipio se obtienen desde un directorio ZasHome cuando `ZASHOME_COVERAGE_URL` está configurada y el servicio responde. Aldeas, caseríos y reglas de crédito siguen obteniéndose de la configuración BDA **sin sustituir** `config:bda_coverage:070-3-37`.
4. **Fechas y responsables.** La lista del vendedor indica la fecha de actualización, quién tiene pendiente el expediente, fechas en la secuencia de etapas y una bitácora desplegable; la tabla administrativa agrega «Pendiente de» y el historial en «Configuración». También se registran eventos de carga/lectura de documentos y guardado de PDF. Los eventos previos se conservan y los timestamps existentes de expedientes históricos se reutilizan sin inventar fechas.

## Configuración pendiente para ZasHome Coberturas

**El ZIP de migración no incluye la URL exacta verificable del endpoint ZasHome Coberturas.** Por ello no se inventó una ruta en producción.

Para habilitar la fuente autoritativa de departamentos y municipios, definir la variable de Cloudflare Worker:

`ZASHOME_COVERAGE_URL=https://api.zashome.com.gt/<RUTA-REAL-DE-COBERTURAS>`

Reemplazar la parte entre los signos de comparación por la ruta exacta, obtenida de la documentación o del sistema ZasHome. No utilizar literalmente el ejemplo. Este código exige HTTPS y host `api.zashome.com.gt`. El backend reutiliza `ZASHOME_API_KEY` si ya está configurada como secret, sin exponerla al navegador. Acepta estructuras JSON comunes con pares departamento/municipio o departamentos anidados con municipios.

Si esa variable no está definida, la API falla o el JSON no aporta municipios, el frontend indica **«Directorio ZasHome no disponible; listado temporal de respaldo BDA»**, y conserva la selección manual y verificación BDA. Esta contingencia **no equivale a haber verificado la API real**.

No se modificó `wrangler.jsonc` ni `package.json`, ni se realizó ningún despliegue, ni se cambió el namespace/bucket. Para establecer la variable usar la configuración del Worker en Cloudflare antes de desplegar, conservando todos los secrets y variables actuales.

## Validación realizada

En copia local:

- `node --check src/index.js`: OK.
- GET `/` y `/admin`: HTML generado correctamente; scripts embebidos comprobados con `node --check`: OK.
- Pruebas de registro/sesión con KV simulado, «Cliente no contesta», reanudación, prohibición de ratificación antes de reanudar, ratificación posterior, exclusión entre rechazo y espera, bitácora y responsables: OK.
- Simulación de ZasHome Coberturas usando JSON ficticio y comprobación de poblados BDA original: OK.
- Simulación aislada de la lógica real del botón de documentos: habilitado con selfie + recibo + ratificación; bloqueado cuando falta alguno: OK.
- Compatibilidad de resumen de expedientes históricos incompletos: OK.
- **No probado:** servicio real de ZasHome Coberturas, OCR/OpenAI de producción, escritura a R2 real ni recorrido completo en Chromium. El navegador del entorno respondió `ERR_BLOCKED_BY_ADMINISTRATOR` a la navegación de prueba. No presentar esas pruebas como realizadas.

Ejecutar nuevamente las pruebas locales:

```bash
node --check src/index.js
node tests/regression-v23.mjs
```

## Despliegue recomendado

1. Respaldar el repositorio y la configuración vigente; no copiar ni publicar secrets.
2. Confirmar la URL **real** de ZasHome Coberturas y establecer `ZASHOME_COVERAGE_URL` en el entorno de Cloudflare, si se desea activar esta fuente.
3. Sustituir en la rama de despliegue los archivos del repositorio por este ZIP completo, manteniendo los secretos y binding existentes.
4. Comprobar las rutas `/`, `/admin`, carga de selfie/recibo, confirmación y seguimiento de un expediente de prueba, bitácora y la API ZasHome real antes de usarlo en casos reales.
5. Confirmar que KV/R2 y expedientes históricos permanecen intactos.

**No se requieren migraciones destructivas de KV/R2.** Los campos `client_followup` y nuevos eventos de `history` se incorporan de forma aditiva a expedientes que los usen.
