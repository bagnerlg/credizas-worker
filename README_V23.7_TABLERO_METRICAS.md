# CrediZas V23.7 — Tablero de métricas y cierres por departamento

## Base y alcance

Versión completa derivada de **CrediZas V23.6**. No reconstruye el proyecto ni cambia Cloudflare Worker `datosform`, `CREDIZAS_KV`, `CREDIZAS_FILES`, bucket R2, secretos, `package.json` ni `wrangler.jsonc`.

### 1. Cliente no responde (vendedor)

En la pantalla de cuotas enviadas, antes de ratificar, aparecen juntos los botones:

- **Cliente rechaza el crédito:** cierra la solicitud como `CREDITO NO ACEPTADO POR CLIENTE` (confirmación de rechazo).
- **El cliente no responde:** conserva el estado histórico `CLIENTE NO CONTESTA` (NO cierra el expediente), guarda el evento `STAGE3_CLIENTE_NO_CONTESTA` en el historial y permite continuar con **Retomar contacto** desde la lista del vendedor, con evento `STAGE3_CONTACTO_RETOMADO`.

Se preservó el backend ya existente desde V23.0: `/api/stage3/no-answer` y `/api/stage3/resume`, con validación de pertenencia al asesor. No hay duplicación de estados ni de rutas.

### 2. Administración: resumen de rendimiento

El panel está en `/admin`, encima del listado de expedientes, y ofrece los siguientes controles:

- **Vista:** Día, Mes, Año.
- **Período:** fecha concreta, mes o año.
- **Asesor:** Todos los asesores o uno específico.
- **Actualizar métricas:** consultar nuevamente KV.

Compara el período seleccionado contra el **período inmediatamente anterior** y muestra las siguientes métricas:

1. Solicitudes ingresadas.
2. Precalificación aprobada.
3. Ofertas de cuotas enviadas.
4. Cliente acepta las condiciones.
5. Cliente no responde.
6. Contacto retomado.
7. Cliente rechaza las condiciones.
8. Formalización enviada.
9. Formalización aprobada.
10. Respuesta bancaria registrada.
11. Créditos finalizados con éxito.
12. Monto bancario aprobado de créditos finalizados.

Los **eventos del período** se agrupan por su fecha real de registro. Por eso una formalización de noviembre puede corresponder a un expediente abierto en octubre. El mismo expediente solo cuenta una vez por tipo de evento dentro de un período. Se muestran también porcentajes de eficacia calculados para cohortes iniciadas en cada período, con su avance acumulado a la fecha; esas tasas no se mezclan con conteos de eventos.

### 3. Tabla de departamentos

La tabla inferior agrega expedientes finalizados por departamento de domicilio del cliente, tomando `stage1.data.informacion_complementaria.departamento` y normalizando variantes de acentuación. Si no existe el campo se muestra `SIN DEPARTAMENTO`.

- **Vista diaria:** últimos 7 días hasta la fecha seleccionada.
- **Vista mensual:** últimos 6 meses hasta el mes seleccionado.
- **Vista anual:** últimos 5 años hasta el año seleccionado.
- **Total** al pie, **variación** frente al período anterior y **monto autorizado** del período actual.

**Regla invariable:** únicamente cuenta un crédito si su estado `stage3.status` es exactamente `CREDITO FINALIZADO CON EXITO`, usando `stage3.finalized_at` y, para expedientes históricos compatibles, un evento `STAGE3_FINALIZADO` con fecha. NO cuentan aprobaciones de Precalificación, Formalización, cuotas aceptadas ni respuestas bancarias sin cierre.

Monto: `stage3.bank_approval.approved_amount`; nunca se sustituye por el monto solicitado del Paso 1. Si falta cupo aprobado, se muestra advertencia y no se inventa dinero.

### 4. Fechas, historiales y compatibilidad

- Los cortes de día utilizan **America/Guatemala (UTC-6)**, no medianoche UTC.
- Un expediente finalizado sin fecha fiable de cierre se marca como **histórico sin fecha** y no se asigna artificialmente al día/mes/año.
- La falta de datos en expedientes antiguos no detiene el tablero.
- La consulta de métricas recorre las páginas de claves `case:` de KV mediante `cursor` (sin depender del límite de 200 registros del listado operativo). Si no puede completar el recorrido o hay más de 8,000 registros, devuelve un error explícito en lugar de mostrar resultados incompletos.
- El endpoint `/api/admin/analytics` exige autenticación administrativa, igual que el listado y Excel.
- La consulta es de solo lectura y no modifica ningún expediente, colección, R2 ni credencial.

### 5. Pruebas ejecutadas

Se ejecutaron todos los tests de regresión de V23.0–V23.6 y el test nuevo `tests/regression-v23.7-analytics-dashboard.mjs`, que verifica:

- Corte local Guatemala (incluido un registro a las 04:30 UTC).
- Cierres reales vs. aprobación bancaria solamente.
- Seguimiento `no responde → retoma contacto`, rechazo separado.
- Vistas por día, mes, año; comparativos y filtros por asesor.
- Normalización de departamentos y monto real.
- 237 expedientes y paginación de KV.
- Protección administrativa del nuevo endpoint.
- Sintaxis JavaScript real de HTML de vendedor y administrador.

**No se verificaron datos de producción** ni se realizó despliegue. Se intentó la prueba visual en Chromium headless, pero el navegador fue bloqueado por el entorno. El nuevo diseño está validado a nivel de HTML, scripts, API y datos simulados, no visualmente en navegador real.

## Instalación

1. Reemplazar el contenido del repositorio `bagnerlg/credizas-worker` rama `main` con el ZIP completo, sin sobrescribir valores de secrets en Cloudflare.
2. Mantener el despliegue actual de GitHub → Cloudflare Worker `datosform` (`npm run deploy`).
3. Tras desplegar, entrar a `/admin`, abrir el resumen y comprobar las vistas Día/Mes/Año.
4. Abrir un expediente que tenga cuotas bancarias enviadas y verificar los botones **Cliente rechaza el crédito** y **El cliente no responde**. Marcar como no responde, ir a lista de vendedor y probar **Retomar contacto**.
5. Comparar los créditos del último mes contra los casos que tienen estado `CREDITO FINALIZADO CON EXITO` y fecha de cierre dentro de dicho mes.

No requiere migración KV, cambios R2 ni nuevos secrets. Es una **entrega candidata**, no se ha instalado automáticamente.
