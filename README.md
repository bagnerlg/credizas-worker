# CrediZas Worker · V19.2

Repositorio para desplegar `datosform` directamente desde **Cloudflare Workers Builds**.

## Estructura

```text
credizas-worker/
├─ src/
│  └─ index.js
├─ package.json
├─ wrangler.jsonc
├─ .gitignore
└─ README.md
```

## Configuración de Cloudflare Builds

- Rama de producción: `main`
- Directorio raíz: `/`
- Comando de compilación: ninguno
- Comando de implementación: `npm run deploy`
- Compilaciones de vista previa: opcionales

El script de deployment ejecuta:

```bash
wrangler r2 bucket create datosform-credizas-files || true && wrangler deploy
```

Con R2 ya habilitado, la primera ejecución crea `datosform-credizas-files` si todavía no existe. Las siguientes continúan aunque el bucket ya exista.

## Bindings

- KV: `CREDIZAS_KV`
  - ID: `687ee918c3874967b00d1f1898103cfb`
- R2: `CREDIZAS_FILES`
  - Bucket: `datosform-credizas-files`

## Protección R2 al 80%

La aplicación incorpora un cortacircuito interno para CrediZas:

- almacenamiento: `8,000,000,000` bytes
- Clase A en 31 días: `800,000`
- Clase B en 31 días: `8,000,000`

Variables en `wrangler.jsonc`:

```text
R2_QUOTA_ENABLED=true
R2_MAX_STORAGE_BYTES=8000000000
R2_MAX_CLASS_A_31D=800000
R2_MAX_CLASS_B_31D=8000000
```

## Secrets necesarios en runtime

No los escribas en GitHub ni en `wrangler.jsonc`:

```text
OPENAI_API_KEY
ZASHOME_API_KEY
ADMIN_USER
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
```

Se pueden cargar una vez desde un equipo autenticado con Wrangler:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ZASHOME_API_KEY
npx wrangler secret put ADMIN_USER
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
```

## Variables no secretas

Actualmente `VENDEDORES_JSON` queda como `[]`. Sustituye ese valor cuando tengas la lista definitiva de vendedores o adminístralos desde la aplicación cuando se implemente esa pantalla.

## Validación local

```bash
npm install
npm run check
```

## Importante

Este repositorio **no incluye GitHub Actions**. El deployment se hace únicamente con la integración GitHub → Cloudflare Workers Builds para evitar deployments dobles.
