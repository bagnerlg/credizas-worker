# CrediZas V23.11 — No envía datos y solicitudes por departamento

Base acumulativa: V23.10 completa. No cambia las reglas financieras ni la infraestructura.

## Seguimiento documental

- «No envía datos» aparece junto a «El cliente no responde» en la pantalla de condiciones, y junto a la lectura de documentos en el Paso 2 mientras falta selfie o documento de domicilio. Puede registrarse antes de ratificar las cuotas (si el asesor ya pidió los documentos) o después de ratificarlas, siempre antes de enviar Formalización.
- Estado `CLIENTE NO ENVIA DATOS`: abierto, pendiente del vendedor, no es un rechazo. Se mantienen cuotas, ratificación si ya existe, archivos guardados y borrador servidor. No se cierran ni eliminan expedientes.
- En Mis solicitudes, «Retomar documentos» devuelve al flujo anterior sin volver a ratificar si las cuotas ya estaban confirmadas. Solo el vendedor propietario puede registrar y retomar; no puede avanzar mientras permanece en espera. Si ambos documentos ya están guardados o la Formalización ya fue enviada, no se permite registrar el nuevo estado.
- El historial guarda `STAGE2_CLIENTE_NO_ENVIA_DATOS` y `STAGE2_DOCUMENTOS_RETOMADOS`, con fecha y actor. Se guardan las fechas primera, última y de reanudación en `stage3.documents_followup`. Se conserva el límite histórico existente de 80 eventos. No se modifica la estructura de expedientes antiguos.
- El administrador puede ver el pendiente en Casos. En Análisis se añaden la tarjeta «Clientes que no envían datos» y las filas «Cliente no envía datos» y «Documentos retomados». Se mide cada expediente una vez por indicador/rango según fecha de evento, sin sumarlo a rechazos ni a finalizados. El número actualmente en espera aparece en la nota informativa.

## Análisis por departamento

Se conserva el informe «Créditos finalizados por departamento» sin cambiar sus cálculos. Justo debajo se añade «Solicitudes ingresadas por departamento», con dos pestañas internas:

1. **Ingresadas:** cuenta el primer envío del Paso 1 por departamento y por día/mes/año del rango A; totales A y B, variación y monto solicitado A/B.
2. **Rechazadas de las ingresadas:** subconjunto de la misma cohorte de ingreso que actualmente se encuentra rechazado por administrador (Paso 1 o 2) o por cliente. No incluye solicitudes reabiertas que ya no están rechazadas, ni finalizadas, ni pendientes de datos/respuesta. Presenta cantidades, variación, ingresadas A/B, tasa de rechazo A/B y monto solicitado de las rechazadas en A/B. Los rechazos por fecha del evento siguen en el embudo original, independientemente de la fecha de ingreso.

Los filtros A/B, granularidad, asesor y zona horaria de Guatemala son los mismos del panel superior. El monto corresponde al total solicitado que está guardado actualmente en el Paso 1, no al cupo aprobado, costo FCB ni desembolso. Si falta monto válido se cuenta el expediente, no se inventa su monto, y se advierte. Las fechas legadas estimadas de ingreso y casos sin fecha se señalan en el resumen original. Departamento ausente se agrupa como SIN DEPARTAMENTO.

## Validación e instalación

- `node --check src/index.js` y `node --check src/credit-analytics.js`.
- 13 suites de regresión locales, incluida `tests/regression-v23.11-documents-and-departments.mjs`: sesiones y propietario, pausa/reanudación antes y después de ratificar, bloqueo de OCR/envío, no duplicación de eventos, conservación de ratificación, cohortes A/B, filtro por asesor, montos y alineación de las pestañas mediante la lógica real de renderizado en VM.
- Pruebas con KV y expedientes simulados, no en producción. No certifican una prueba visual integral en navegador ni verifican cifras reales de Cloudflare.
- Reemplaza los archivos del repositorio por los del ZIP completo y deja que se ejecute el despliegue habitual. Recarga `/admin` y la pantalla de vendedor. No requiere migraciones ni nuevos secretos; `package.json`, `wrangler.jsonc`, bindings KV/R2, catálogo y datos BDA quedan iguales.
