# Backend de ARK305

API NestJS independiente para la web Next.js y futuros clientes móviles. Esta primera entrega implementa únicamente el arranque y la comprobación de salud; no ofrece reservas ni integra proveedores.

## Iniciar localmente

Requisito: Node.js 22 o superior. Desde la raíz del repositorio:

```powershell
npm ci
npm --prefix backend ci
```

En una terminal, iniciar la web con `npm run dev` (puerto 3000). En otra, iniciar la API:

```powershell
npm run dev:api
```

Comprobar `http://127.0.0.1:3001/api/v1/health`:

```json
{ "status": "ok", "service": "ark305-api" }
```

Este resultado indica que el proceso HTTP responde; no certifica disponibilidad de base de datos, IA ni proveedores. La web todavía conserva su backend anterior y no consume automáticamente esta API.

## Comandos

| Comando desde la raíz | Resultado |
|---|---|
| `npm run dev:api` | Compila TypeScript y reinicia la API al cambiar fuentes. |
| `npm run build:api` | Compila únicamente el backend. |
| `npm run test:api` | Compila y prueba el contrato HTTP, sin servicios externos. |
| `npm --prefix backend start` | Ejecuta la compilación existente. |
| `npm run lint` / `npm run build` | Verifica la web, no el backend. |

El backend tiene su propio `package-lock.json`; sus dependencias se instalan por separado. La compilación estricta y las pruebas son sus comprobaciones actuales; todavía no tiene un comando de lint propio.

## Configuración

Por defecto escucha en `127.0.0.1:3001`, separado de Next.js. Se leen `PORT` y `HOST` del entorno del proceso; no se cargan archivos `.env` automáticamente.

Ejemplo en la terminal dedicada a la API:

```powershell
$env:PORT = '3002'
npm run dev:api
```

Para un despliegue futuro debe configurarse el host y puerto apropiados. No se ha creado ni publicado un despliegue. El endpoint de salud es público; no hay rutas de negocio, CORS habilitado ni autenticación nueva en esta entrega.

## Organización y siguiente paso

- `src/main.ts`: arranque y cierre del proceso.
- `src/app.ts`: construcción compartida de la aplicación para ejecución y pruebas.
- `src/app.module.ts`: composición de módulos.
- `src/modules/health/`: primer módulo HTTP.
- `test/app.test.cjs`: pruebas de contrato mediante `node:test` y un puerto local efímero.

La estructura propuesta para próximos módulos separará HTTP, casos de uso, reglas de negocio y adaptadores de persistencia/proveedores. No se crean interfaces vacías ni servicios ficticios hasta definir el primer caso de uso.

La migración será incremental: mover cada comportamiento con sus pruebas y adaptar la web a su contrato. No duplicar reglas entre Next.js y NestJS. La autenticación y permisos deberán diseñarse antes de exponer datos o acciones de usuarios. La integración Anthropic actual permanece sin cambios; Meta se abordará por separado.

Referencias: [NestJS](https://docs.nestjs.com/first-steps) y [pruebas](https://docs.nestjs.com/fundamentals/testing).
