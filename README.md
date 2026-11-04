# API de ARK305.

Backend NestJS independiente para la web y futuros clientes móviles. Este paquete no requiere archivos ni dependencias del repositorio web `ark305`.

## Inicio local

Requisito: Node.js 22.9 o superior.

```sh
npm ci
# Crear .env.local a partir de .env.example y configurar los valores privados.
npm run start:dev
```

El API escucha por defecto en `http://127.0.0.1:3001`. `PORT` y `HOST` permiten configurarlo. Los scripts cargan `.env.local` opcionalmente; las variables del proceso tienen prioridad. Nunca se versionan credenciales.

En el repositorio web, configurar `.env.local` con `ARK_API_URL=http://127.0.0.1:3001`, sin `/api/v1`. La web se inicia por separado en el puerto 3100. No colocar claves de Meta en Next.

## Responsabilidades

- Identidad: JWT de Supabase verificado y políticas RLS por usuario.
- IA: conversación, diagnóstico y Mi día mediante Meta, con cuota y procedencia.
- Perfiles: datos, servicios, preferencias y diagnóstico guardado.
- Solicitudes: creación, historial y gestión administrativa autorizada; cerrar no confirma una reserva ni un pago.
- Catálogo: demostración, sin disponibilidad de proveedores confirmada.

Contratos: [IA](AI.md), [autenticación](AUTH.md), [perfiles](PROFILES.md) y [solicitudes](REQUESTS.md).

## Snapshot

`POST /api/v1/profiles/snapshot` recibe `{ "answers": { "who": "individual" } }` y devuelve `{ "snapshot": ... }` con `Cache-Control: no-store`. Es un cálculo público sin estado: no consulta cuentas, guarda datos ni llama a Meta. Acepta solo `answers`, hasta 80 claves y un cuerpo de hasta 16 KiB; las entradas malformadas responden 400.

## Verificación

```sh
npm test
npm run build
npm start
```

`npm test` compila y ejecuta pruebas HTTP con dependencias controladas, sin llamadas a Meta ni bases remotas. `GET /api/v1/health` confirma el proceso, no la disponibilidad de proveedores.

## Formato de ejecución y Vercel

El backend utiliza ESM nativo (`type: module` y TypeScript `NodeNext`), compatible con los paquetes ESM de NestJS 12. Los imports relativos del código TypeScript deben terminar en `.js`: TypeScript resuelve el archivo fuente y conserva la extensión del JavaScript emitido. No convertirlos a `require()`.

Las pruebas de aplicación están en `test/*.test.mjs`. `npm test` desactiva la compatibilidad `require(esm)` para detectar el error de arranque `ERR_REQUIRE_ESM` observado en Vercel. Los scripts independientes de RLS conservan su extensión `.cjs`.

Para desplegar, utilizar la raíz de este repositorio y la entrada `src/main.ts`. Configurar las variables privadas del backend en Vercel; `.env.vercel` es un archivo local de preparación, no una configuración que se publique automáticamente. Después de desplegar, comprobar `GET /api/v1/health`: debe responder `200` con `{"status":"ok","service":"ark305-api"}`. `/health` no es la ruta del API.

La fábrica reutilizable está en `src/application.ts`, no en `src/app.ts`. El detector específico de NestJS busca nombres de entrada e imports directos de `@nestjs/core`; `src/main.ts` conserva ese import para que Vercel seleccione el archivo que ejecuta `listen()`, no una fábrica sin servidor. La prueba `test/entrypoint.test.mjs` reproduce esa selección y arranca `dist/main.js` para comprobar salud y protección de rutas. La selección se basa en el [detector oficial de NestJS](https://github.com/vercel/vercel/blob/main/packages/nestjs/src/build.ts); no sustituye una prueba del despliegue remoto.

La prueba local de ESM no sustituye la comprobación del despliegue real. Referencias: [NestJS en Vercel](https://vercel.com/docs/frameworks/backend/nestjs) y [migración de NestJS](https://docs.nestjs.com/migration-guide).

La prueba opcional `npm run test:rls` requiere Docker local y la imagen `postgres:17` ya instalada. Crea y elimina únicamente su contenedor aislado, sin red ni puertos publicados. No descarga imágenes ni modifica Supabase remoto.

## Esquemas y procedencia

`supabase/` conserva los SQL originales y las migraciones de solicitudes. Trasladarlos no los aplica ni garantiza que reconstruyan el esquema completo de producción. Antes de ejecutar SQL, reconciliarlo con el entorno de destino; no aplicar `002_experiences.sql` a ciegas.

`docs/origen-monorepo/` conserva documentos históricos para trazabilidad. Sus rutas y comandos reflejan el monorepo anterior; esta guía define el funcionamiento independiente actual.

El historial de `backend/` fue extraído del repositorio web, sin reescribirlo. Existe un despliegue previo del API, pero los cambios de esta rama no están publicados ni se verificaron allí. Al desplegar, el proyecto debe utilizar la raíz de este repositorio, configurar sus variables privadas y exponer una URL HTTPS para `ARK_API_URL`.

## MVP de hackathon

Proceso, pruebas y limites: [Guia de los tres flujos](docs/HACKATHON_MVP.md).

Antes de entregar: [auditoría y puertas de publicación](docs/HACKATHON_RELEASE_AUDIT.md) y [guion de video](docs/HACKATHON_VIDEO.md). Este repositorio utiliza la [licencia MIT](LICENSE), con ARK305 como titular. La publicación sigue pendiente de autorización.
