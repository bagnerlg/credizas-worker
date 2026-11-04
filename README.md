# CrediZas V22.8

Base: **V22.7.1**. Mantiene sin cambios `package.json`, `wrangler.jsonc`, KV, R2, bindings, secrets y recursos existentes.

## Correcciones y cambios

1. **Monto solicitado corregido**
   - Usa el precio de catálogo de ZasHome.
   - Fórmula: `precio + 10%`.
   - Se conserva la aproximación comercial hacia arriba al siguiente múltiplo de Q50.

2. **Cuotas estimadas como selector**
   - 6, 8, 10, 12 y 18 meses.
   - Usa las tasas ya definidas: 16.73%, 23.46%, 30.23%, 37.46% y 59.95%.
   - 18 meses mantiene la advertencia de restricciones por récord crediticio.

3. **Paso 1 después de enviar**
   - El formulario deja de mostrarse al vendedor.
   - Solo aparece `PRECALIFICACIÓN ENVIADA` y su estado.
   - Si el administrador solicita una corrección, el botón cambia a `Ratificar datos`.
   - Después de ratificar una corrección, la edición se cierra automáticamente.

4. **Corrección `setStageEditable is not defined`**
   - La función existe ahora en el bundle del navegador y controla correctamente la edición de Paso 1 y Paso 2.

5. **Paso 2 después de enviar**
   - Ya no vuelve a mostrar carga de documentos ni formulario si el expediente fue enviado.
   - Solo queda visible `Expediente terminado / Completo / Resultado` con el mensaje de envío al administrador.
   - Las correcciones solicitadas siguen habilitando nuevamente la edición.

6. **Progreso durante lectura IA**
   - `Leer documentos y completar datos` muestra explícitamente la ventana compacta de progreso y la cierra al terminar.

7. **Paso 3 · documentos para firma**
   - Ahora exige exactamente **3 PDF** en lugar de 2.
   - Backend, frontend, estados y permisos usan el mismo requisito de tres documentos.

8. **Panel administrativo simplificado**
   - La columna Estados muestra solo el paso activo.
   - `Editar estado` permite modificar únicamente el estado activo.
   - `Configuración → Editar pasos / estados` permite acceder a estados anteriores y abrir directamente Paso 1 o Paso 2 para editar sus campos.
   - Ya no se muestran simultáneamente Precalificación y Formalización cuando la primera ya terminó.

9. **Navegación**
   - Se mantiene la navegación vendedor ↔ administrador en la misma pestaña introducida en V22.7.

## Infraestructura

No requiere cambios de Cloudflare. El catálogo continúa usando:

`https://api.zashome.com.gt/api/integrations/excel/catalog`
