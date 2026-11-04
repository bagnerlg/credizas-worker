# CrediZas Worker V22.7

Base: V22.6 completa. Mantiene sin cambios `package.json`, `wrangler.jsonc`, KV, R2 y secrets existentes.

## Cambios principales

1. **Nuevo cálculo del monto solicitado desde ZasHome**
   - Endpoint: `https://api.zashome.com.gt/api/integrations/excel/catalog`.
   - Fórmula: `(precio + 10% del precio) + precio`.
   - El resultado se redondea siempre hacia arriba al siguiente múltiplo de Q50.

2. **Cuotas estimadas en Paso 1**
   - 6 meses: 16.73%.
   - 8 meses: 23.46%.
   - 10 meses: 30.23%.
   - 12 meses: 37.46%.
   - 18 meses: 59.95%, con aviso de restricciones según récord crediticio.
   - Las cuotas se muestran al vendedor y quedan registradas en el expediente/PDF.

3. **Nuevo orden del flujo**
   - Paso 1 / Precalificación.
   - Admin aprueba Precalificación.
   - Admin envía cuotas reales.
   - Vendedor ratifica plazo/cuota con el cliente.
   - Se habilita Paso 2 / Formalización y sus documentos.
   - Admin aprueba Formalización.
   - Paso 3: respuesta final del banco, PDFs, firma, evidencia y cierre.

4. **Ventana compacta de progreso**
   - Aparece abajo a la derecha durante cargas, envíos y guardados.
   - Llega a 100% y se cierra automáticamente al terminar.
   - Disponible para vendedor y administrador.

5. **Borradores Paso 2**
   - El vendedor puede borrar el borrador local.
   - Vendedor o administrador pueden borrar el borrador de análisis guardado en servidor sin eliminar documentos.
   - Al enviar Paso 2 correctamente se elimina el borrador de análisis para evitar que datos viejos reaparezcan.

6. **Cobertura geográfica**
   - Departamento, municipio y poblado usan listas sugeridas con `datalist`.
   - Permiten escritura libre si el valor no existe en la lista.
   - Se mantiene la validación BDA no bloqueante.

7. **Estados administrativos protegidos**
   - Los estados se muestran como etiquetas de solo lectura.
   - Solo se habilitan los selectores al pulsar `Editar estados`.
   - El proceso cambia automáticamente según el flujo; no existe selector manual de proceso.

8. **Acciones administrativas más claras**
   - Columna `Qué hacer ahora` con acción destacada para cuotas o Paso 3.
   - Edición y eliminación quedan dentro de `Configuración`.

## Infraestructura

No requiere crear ni modificar bindings, variables o secrets. Conserva los mismos recursos de V22.6.

## Navegación simplificada

Vendedor y administrador cambian de modo en la misma pestaña. El panel del vendedor usa **Ir a administrador** y el panel administrativo usa **Ir a vendedores**, evitando acumular ventanas durante pruebas u operación. Los documentos de consulta (por ejemplo PDF) pueden seguir abriéndose aparte.
