# CrediZas V22.3.1

Base: ZIP V22.2 proporcionado por el usuario (`credizas-worker-completo-v22.2(1).zip`).

Corrección crítica respecto a V22.3:
- Se restauró/definió `searchCases()` antes de registrar los listeners del buscador del vendedor.
- Esto evita que el JavaScript se detenga antes de ejecutar `loadSellerOptions()` y corrige la pantalla que quedaba en “Cargando vendedores…”.

Se conservan los cambios funcionales de V22.3:
- OCR de aprobación final del banco.
- Imágenes de cuotas temporales: se leen con Tesseract y no se guardan en R2.
- Administración/eliminación de archivos por el administrador.
- Reemplazo controlado de aprobación bancaria y reinicio de etapas dependientes cuando corresponde.

Infraestructura:
- `package.json` idéntico a V22.2 proporcionada.
- `wrangler.jsonc` idéntico a V22.2 proporcionada.
- No requiere variables, bindings ni secrets nuevos.
