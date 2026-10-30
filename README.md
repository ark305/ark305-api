# Backend de ARK305

API NestJS independiente para la web Next.js y futuros clientes móviles. Expone salud y un catálogo demo de solo lectura; no ofrece reservas ni integra proveedores.

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

Este resultado indica que el proceso HTTP responde; no certifica disponibilidad de base de datos, IA ni proveedores. La página `/catalogo` consume esta API; las demás funciones web conservan su implementación anterior.

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

Para un despliegue futuro debe configurarse el host y puerto apropiados. No se ha creado ni publicado un despliegue. Salud y catálogo son públicos y no contienen datos de usuarios. No se habilita CORS ni autenticación nueva.

## Probar el catálogo

Con ambos procesos iniciados, abrir `http://localhost:3000/catalogo`.
Next.js consulta NestJS desde el servidor; no requiere CORS. Si la API está apagada, responde con un mensaje de indisponibilidad, sin sustituir datos silenciosamente. El tiempo máximo de consulta es de cinco segundos.

Para cambiar el destino, definir `ARK_API_URL` en el entorno de Next.js o en su `.env.local`, por ejemplo `http://127.0.0.1:3002` (sin `/api/v1`). No es una variable pública ni una credencial.

| Ruta GET | Respuesta |
|---|---|
| `/api/v1/catalog` | `{ items: [...] }`, 18 servicios demo. |
| `/api/v1/catalog/suv` | Servicio individual con identificador, categoría y textos `es`/`en`. |

Cada servicio incluye `source: "demo"`, `bookable: false` y `pricing: { type: "quote" }`. No se publican proveedores ficticios ni las tarifas antiguas no verificadas. Un ID desconocido devuelve 404; un ID fuera de `[a-zA-Z0-9-]` o de 1–64 caracteres devuelve 400. Los identificadores distinguen mayúsculas. No existen operaciones de escritura.

`CatalogPort` es el contrato asíncrono de lectura. `DemoCatalogAdapter` entrega copias de una instantánea de los textos del prototipo; puede reemplazarse en `CatalogModule` sin cambiar el controlador. No representa una integración con proveedores. El planificador anterior mantiene temporalmente su catálogo local: no se sincronizan ambos conjuntos ni se migran reservas en esta entrega.

No se necesita Docker ni base de datos para esta demostración. La persistencia y los adaptadores de proveedores se incorporarán con casos de uso confirmados.

## Organización y siguiente paso

- `src/main.ts`: arranque y cierre del proceso.
- `src/app.ts`: construcción compartida de la aplicación para ejecución y pruebas.
- `src/app.module.ts`: composición de módulos.
- `src/modules/health/`: primer módulo HTTP.
- `test/app.test.cjs`: pruebas de contrato mediante `node:test` y un puerto local efímero.

La estructura propuesta para próximos módulos separará HTTP, casos de uso, reglas de negocio y adaptadores de persistencia/proveedores. No se crean interfaces vacías ni servicios ficticios hasta definir el primer caso de uso.

La migración será incremental: mover cada comportamiento con sus pruebas y adaptar la web a su contrato. No duplicar reglas entre Next.js y NestJS. La autenticación y permisos deberán diseñarse antes de exponer datos o acciones de usuarios. La integración Anthropic actual permanece sin cambios; Meta se abordará por separado.

Referencias: [NestJS](https://docs.nestjs.com/first-steps) y [pruebas](https://docs.nestjs.com/fundamentals/testing).
