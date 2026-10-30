# CrediZas Worker V21.7

Versión estable basada en V21.6 con validación informativa de cobertura BDA desde el documento `Áreas de Atención y Zonas no Autorizadas 070-3-37.pdf`.

## Cobertura

- Usa Departamento y Municipio como ubicación obligatoria.
- `Nombre de poblado` es opcional.
- La información de agencias se ignora.
- La referencia de restricciones usa únicamente la columna BDA; INCOMEL no se utiliza.
- Si solo se indica departamento/municipio, muestra si el municipio figura en el área de atención.
- Si se indica poblado, busca su regla BDA exacta y muestra:
  - verde: habilitado;
  - naranja: cobertura con condición / horario / bloqueo parcial;
  - rojo: sin cobertura por ubicación.
- La alerta de cobertura NO bloquea guardar ni enviar la solicitud.
- El resultado BDA se guarda dentro del Paso 1 y se imprime en los PDFs.

## KV

La base de cobertura se guarda en el mismo binding `CREDIZAS_KV` con la llave:

`config:bda_coverage:070-3-37`

La semilla es no destructiva: solo se crea si la llave todavía no existe. No borra ni sobrescribe expedientes existentes.

## Configuración existente

No requiere variables nuevas ni cambios en R2, KV, secrets, `package.json` o `wrangler.jsonc`.
