# CrediZas Worker

Worker de CrediZas administrado con GitHub + Wrangler.

## Arquitectura

- Cloudflare Worker: `datosform`
- KV binding: `CREDIZAS_KV`
- R2 binding: `CREDIZAS_FILES`
- OpenAI: extracción documental
- ZasHome: catálogo público/solo lectura
- GitHub Actions: despliegue automático a producción

## Primer despliegue sin usar la UI de Cloudflare

Necesitas GitHub CLI (`gh`) y una sesión válida de GitHub.

```powershell
gh auth login
gh repo create jaime7au/credizas-worker --private --source . --remote origin --push
```

Agrega los secretos del repositorio desde terminal:

```powershell
gh secret set CLOUDFLARE_ACCOUNT_ID -R jaime7au/credizas-worker
gh secret set CLOUDFLARE_API_TOKEN -R jaime7au/credizas-worker
gh secret set OPENAI_API_KEY -R jaime7au/credizas-worker
gh secret set ZASHOME_API_KEY -R jaime7au/credizas-worker
gh secret set ADMIN_USER -R jaime7au/credizas-worker
gh secret set ADMIN_PASSWORD -R jaime7au/credizas-worker
gh secret set ADMIN_SESSION_SECRET -R jaime7au/credizas-worker
```

Al hacer push a `main`, GitHub Actions ejecutará `wrangler deploy`.

La primera ejecución deja que Wrangler aprovisione automáticamente KV y R2. Si Wrangler escribe los IDs/nombres de los recursos en `wrangler.jsonc`, el workflow los commitea de vuelta al repo para que despliegues futuros sean deterministas.

## Desarrollo local

```bash
npm install
npx wrangler login
npm run dev
```

Los secretos locales deben vivir en `.dev.vars` y nunca subirse a GitHub.
#
