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

La migración será incremental: mover cada comportamiento con sus pruebas y adaptar la web a su contrato. No duplicar reglas entre Next.js y NestJS. La autenticación y permisos deberán diseñarse antes de exponer datos o acciones de usuarios. La IA usa Meta, pero todavía vive en Next.js; no se ha migrado a NestJS.

## Ubicación y configuración de IA

`src/app/api/ai/route.ts` (desde la raíz del repositorio) expone `POST /api/ai` en la web. Usa `META_API_KEY`, `META_MODEL` (por defecto `muse-spark-1.3`) y `META_BASE_URL` (por defecto `https://api.meta.ai`, sin `/v1`). Configurarlas en el `.env.local` de la raíz; reiniciar Next.js después de cambiarlas. `META_MODEL_QUICK` es opcional y utiliza `META_MODEL` si se omite.

La llamada a Meta utiliza `/v1/messages` y autenticación Bearer. Se conserva el contrato `{ text, user }`, la verificación de sesión Supabase y el límite diario existente. Para probar el recorrido completo también se necesita Supabase configurado y una sesión válida; la clave de Meta por sí sola no inicia sesión. No se registran cuerpos de error del proveedor ni se exponen credenciales en el navegador.

Pruebas locales sin credenciales ni llamadas externas: `node --test test/ai-route.test.mjs`, desde la raíz. Las pruebas invocan el manejador POST con dependencias HTTP simuladas.

Referencia: [Messages API de Meta](https://dev.meta.ai/docs/protocols/messages).

### Mi día y respuestas verificables

La pantalla web `/mi-dia` envía una solicitud autenticada a `/api/ai` con `task: "day-plan"`. Sin configuración de Supabase muestra un aviso; sin sesión solicita iniciar sesión. No ejecuta el planificador local como respaldo.

El servidor pide JSON estructurado y valida servicios contra el catálogo del prototipo, horarios, cantidades e invitados. Si Meta no propone servicios adecuados, devuelve un plan vacío; una respuesta inválida o incompleta produce un error, nunca un paquete predeterminado. La comprobación de cuota debe devolver `true` para permitir esta tarea; si falta la función `bump_ai` o falla, no se llama a Meta.

Un plan válido incluye `provenance` con `provider`, `model` e identificador `responseId` devueltos por el proveedor. La pantalla muestra esos datos junto al plan. Esto permite correlacionar la respuesta, no constituye una firma criptográfica. El resumen visual se construye a partir del plan; precios y servicios siguen siendo de demostración, sin confirmar reservas.

Para comprobarlo al configurar Supabase: iniciar sesión, abrir `/mi-dia` en el puerto 3100, solicitar un plan y revisar en Network el POST `/api/ai` y su `provenance`. No compartir ni registrar el encabezado Authorization. Las pruebas automatizadas usan respuestas simuladas; una prueba autenticada real queda pendiente hasta disponer de configuración y sesión. No hay modo de acceso sin autenticación para desarrollo.

Referencias: [NestJS](https://docs.nestjs.com/first-steps) y [pruebas](https://docs.nestjs.com/fundamentals/testing).
## Migración de IA en curso

Consulte [AI.md](AI.md) para el nuevo endpoint Nest de conversación general y sus límites. El diagnóstico y la planificación web siguen en Next hasta completar la migración; no se debe cambiar todavía el cliente a Nest.
