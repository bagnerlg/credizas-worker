# CrediZas V23.3 — Integración FCB, múltiples productos, zonas BDA y pruebas de conectividad

**Base:** V23.2 completa. **Entrega:** ZIP completo listo para reemplazar los archivos versionados del repositorio. **No se realizó despliegue ni modificación en Cloudflare.**

## 1. Integraciones

**Probar departamentos/municipios:** entrar a `/admin` → **Conexiones y permisos FCB** → **Probar conexión ZasHome · Departamentos y municipios**. La acción llama a `GET /api/admin/coverage/test`, que realiza una consulta **nueva** al endpoint oficial `https://api.zashome.com.gt/api/integrations/excel/coverage`. Muestra la cantidad de registros de municipios, departamentos y diagnóstico de la fuente. Requiere sesión administrativa. Ante error se mantiene el listado BDA de respaldo sin borrar la matriz histórica. No imprime tokens ni claves.

**FCB/DUPAZA:** el Worker consulta `https://n8n.lauinc.dpdns.org/webhook/dupaza-inventario-publico` por GET con credenciales **HTTP Basic** de servidor. El navegador solo llama a CrediZas; jamás recibe el usuario, contraseña ni campo `costo` del inventario. **Se deben configurar dos secretos nuevos** de Cloudflare Worker (`datosform`) antes de utilizar FCB:

- `FCB_API_USER` — usuario asignado al webhook.
- `FCB_API_PASSWORD` — clave asignada al webhook.

Desde el panel Secrets de Cloudflare, crea ambos con sus valores reales. **No los añadas a `wrangler.jsonc`, GitHub, frontend, logs ni conversaciones.** No se alteraron secrets previos (`ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `OPENAI_API_KEY`, `ZASHOME_API_KEY`). La URL FCB es fija al host HTTPS conocido, con opción de cambio controlado mediante `FCB_INVENTORY_URL` si el endpoint cambia en el mismo host.

En **Conexiones y permisos FCB** del administrador, pulsa **Probar FCB y cargar bodegas**. Elige el asesor, marca **Habilitar acceso FCB**, selecciona una o varias bodegas y pulsa **Guardar bodegas del asesor**. El permiso queda persistido en KV bajo `config:fcb_permissions:<id_asesor>`; el Worker vuelve a comprobar permiso, bodega y existencias al grabar cada solicitud. El vendedor solo ve FCB si está habilitado y tiene bodegas asignadas. La bodega con inventario cero puede asignarse, pero sus productos sin stock no se ofrecen.

**Importante:** el JSON FCB facilitado incluye `costo`, **no precio de venta**. No se inferirá un precio comercial ni se expondrá costo. Para cada artículo FCB el asesor debe introducir manualmente el **precio comercial autorizado**. El administrador debe verificar comercialmente esos precios. Sin ese valor, la solicitud no se envía. Si el webhook utiliza otro esquema distinto a HTTP Basic, habrá que adaptar el encabezado desde el backend.

## 2. Selección de productos en Paso 1

Ahora hay tres modos exclusivos de búsqueda: **Combos**, **Individual** y **FCB**. Las categorías ZasHome se verifican de nuevo desde el Worker según `tipo_producto`, `categoria` y nombre cuando corresponde. FCB se consulta exclusivamente por el inventario autorizado y bodega. Se pueden agregar hasta **20 líneas**, repetir un artículo para aumentar cantidad, quitar líneas y mezclar fuentes.

Se conserva el cálculo: **monto solicitado = redondeo superior al siguiente Q50 de (suma de precios unitarios × cantidades × 1.10)**. El enganche estimado continúa siendo 5% del monto calculado y las cuotas mantienen las fórmulas anteriores. Por compatibilidad permanecen los campos históricos del primer producto; la lista completa se guarda adicionalmente como `solicitud.productos`. El Excel de administrador incorpora columnas de lista de artículos, cantidad de líneas y zona, y los PDF de Paso 1 muestran los artículos/bodegas junto con los datos del cliente. Los registros V22.x/V23.x con un solo producto continúan siendo legibles.

## 3. Acceso y buscadores

Pulsar **Enter** después del PIN del vendedor equivale a hacer clic en **Ingresar**; también funciona en la búsqueda de productos. Departamento, municipio y zona permiten escribir, filtrar opciones, pulsar **▾** para ver el listado o **×** para borrar y elegir otro valor. Se mantiene texto manual cuando falten opciones.

## 4. Cobertura BDA por zona

Se usó el PDF facilitado «Áreas de Atención y Zonas no Autorizadas 070-3-37.pdf» como referencia para conservar **departamento, municipio, poblado, número de zona y comentario exacto de BDA**. No se utiliza INCOMEL para valorar cobertura. Se añade un complemento **no destructivo** `src/bda-zones.js`, cruzado con las 2,039 reglas de poblado ya existentes. De las filas históricas pudieron asociarse con certeza **1,585** a una zona concreta, sin cambiar la clave de KV `config:bda_coverage:070-3-37`. Las otras **454** reglas siguen disponibles con su texto BDA original, sin atribuir una zona dudosa; serán avisos para verificación manual. Las reglas con observaciones contrapuestas en una misma zona (por ejemplo, horario AM general y casas frente a línea férrea bloqueadas) se presentan como **condiciones que requieren revisión** y se conserva el comentario íntegro.

No se rechazan créditos automáticamente por cobertura. Seleccionar departamento, municipio, colonia/barrio y zona permite consultar advertencias; cuando no se identifica una zona específica se indica la incertidumbre y se conservan las notas originales.

## 5. Comprobaciones efectuadas

Ejecutado localmente con Node.js 22:

```sh
node --check src/index.js
node --check src/bda-zones.js
node tests/regression-v23.mjs
node tests/regression-v23.1-export.mjs
node tests/regression-v23.2-zashome-coverage.mjs
node tests/regression-v23.3-products-fcb-zones.mjs
```

Las cuatro pruebas pasaron en un entorno de datos simulados. La última verifica una combinación de Combo + Individual + FCB, cálculo de monto Q2,100 y enganche Q105, bloqueo de bodegas no autorizadas, confidencialidad de costos y secretos, exportación, diagnóstico de cobertura y comentarios de zona BDA. También se validó la sintaxis de los scripts reales de `/` y `/admin` extraídos del HTML. La prueba visual en Chromium fue bloqueada por la política de navegación del entorno, por lo que queda pendiente una prueba humana en producción. Tampoco se han validado las credenciales reales ni el contenido vivo del webhook FCB.

## 6. Despliegue y reversión

1. Haz copia de seguridad del repositorio y conserva los datos reales en KV/R2. No crees nuevas instancias, namespaces ni buckets.
2. Copia **todo el contenido del ZIP** a `main` de `bagnerlg/credizas-worker` (incluyendo **ambos** `src/index.js` y `src/bda-zones.js`).
3. Configura los dos nuevos secrets `FCB_API_USER` y `FCB_API_PASSWORD` en Cloudflare para Worker `datosform`. Nunca los compartas en GitHub. Si solo deseas usar ZasHome y BDA, puedes dejar FCB sin configurar: se deshabilita y muestra diagnóstico en administrador.
4. Deja intactos `wrangler.jsonc`, `package.json`, bindings `CREDIZAS_KV` y `CREDIZAS_FILES`, bucket y nombres de Worker. El despliegue GitHub → Cloudflare sigue como estaba (`npm run deploy`).
5. Después del despliegue, entra a Administración; prueba ZasHome y FCB; asigna una bodega a un asesor de prueba; prueba búsqueda, Enter, monto y cobertura antes de usar casos reales.
6. Si detectas una regresión, restaura el código V23.2 en GitHub; no elimines ni renombres KV/R2. Los nuevos registros con `solicitud.productos` no se deben modificar con una versión antigua sin probar su compatibilidad.

**Nota de seguridad:** las alertas de cobertura son administrativas, la aprobación crediticia corresponde al banco/administrador y la IA no concede ni rechaza crédito.
