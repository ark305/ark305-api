# Backend de ARK305

NestJS concentra la API de negocio para la web Next.js y futuros clientes m?viles. Next conserva la presentaci?n y los adaptadores de sesi?n, cookies, redirecci?n, revalidaci?n y carga de im?genes. El cat?logo sigue siendo de demostraci?n: no confirma proveedores, precios finales ni reservas.

## Inicio local

Requisito: Node.js 22.9 o superior. Instalar las dependencias de cada aplicaci?n por separado:

```powershell
npm ci
npm --prefix backend ci
```

Configurar `backend/.env.local` a partir de [.env.example](.env.example). Los comandos de inicio cargan ese archivo opcional; las variables del proceso tienen prioridad. No se cargan variables desde la carpeta de Next.

```powershell
# Terminal del backend (puerto 3001)
npm run dev:api
# Otra terminal, web (puerto 3100)
npm run dev -- --port 3100
```

En `.env.local` de la ra?z, configurar `ARK_API_URL=http://127.0.0.1:3001`, sin `/api/v1`. Esta variable solo se utiliza en el servidor web. Las variables `META_*` y `AI_DAILY_LIMIT` corresponden al backend, no al navegador ni al servidor Next.

## Responsabilidades

| Componente | Responsabilidad |
|---|---|
| `src/modules/identity` | Verificar el Bearer del usuario mediante Supabase. |
| `src/modules/ai` | Conversaci?n, diagn?stico y Mi d?a con Meta; cuota, validaci?n y procedencia. |
| `src/modules/profiles` | Perfiles, servicios publicados, preferencias y persistencia del diagn?stico. |
| `src/modules/requests` | Crear y consultar solicitudes propias; no confirmar reservas. |
| `src/modules/catalog` | Cat?logo p?blico de demostraci?n. |
| `src/domain` | Reglas puras del diagn?stico utilizadas por los servicios. |
| Next | BFF del mismo origen y presentaci?n; nunca respaldo local de IA o escritura directa de negocio. |

Consultar [AI.md](AI.md) y [PROFILES.md](PROFILES.md) para contratos espec?ficos. Los tipos y reglas puras necesarios para mostrar formularios pueden existir en la web; Nest es quien autoriza y valida las operaciones persistentes.

## Seguridad y configuraci?n

- `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`: mismo proyecto que la web. No usar `service_role`.
- Cada operaci?n privada reenv?a el JWT del usuario y conserva las pol?ticas RLS existentes.
- Los perfiles p?blicos no incluyen el diagn?stico ni las preferencias privadas.
- `META_API_KEY`: secreto exclusivo del backend. `META_MODEL` predeterminado: `muse-spark-1.3`.
- Los modos estructurados solo aceptan el origen oficial de Meta. Las pruebas interceptan HTTP; no consumen cuota real.
- `PORT` predeterminado: `3001`; `HOST`: `127.0.0.1`. El despliegue deber? definirlos seg?n el entorno.
- Next consulta Nest desde el servidor: no necesita CORS para estas rutas.

## Verificaci?n

```powershell
npm run test:api
node --test test/*.test.mjs
npm run lint
npx tsc --noEmit
npm run build
```

La suite backend compila y ejecuta las pruebas `*.test.cjs`; no ejecuta la prueba remota RLS (`test:rls`). Las suites locales usan servicios HTTP controlados y no demuestran disponibilidad de Meta o Supabase en producci?n.

`GET /api/v1/health` responde `{ "status": "ok", "service": "ark305-api" }`; confirma el proceso, no la disponibilidad de sus dependencias.

## Despliegue pendiente

No se ha publicado este backend. Primero se cierra y verifica la migraci?n; despu?s se configura un proyecto Vercel separado con ra?z `backend/`, variables privadas y la URL HTTPS en `ARK_API_URL` de Next. La creaci?n de otro repositorio es una fase posterior. No se incluyen credenciales en Git.
