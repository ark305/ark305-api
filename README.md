# API de ARK305

Backend NestJS independiente para la web y futuros clientes móviles. Este paquete no requiere archivos ni dependencias del repositorio web `ark305`.

## Inicio local

Requisito: Node.js 22.9 o superior.

```sh
npm ci
# Crear .env.local a partir de .env.example y configurar los valores privados.
npm run start:dev
```

El API escucha por defecto en `http://127.0.0.1:3001`. `PORT` y `HOST` permiten configurarlo. Los scripts cargan `.env.local` opcionalmente; las variables del proceso tienen prioridad. Nunca se versionan credenciales.

En el repositorio web, configurar `frontend/.env.local` con `ARK_API_URL=http://127.0.0.1:3001`, sin `/api/v1`. La web se inicia por separado en el puerto 3100. No colocar claves de Meta en Next.

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

La prueba opcional `npm run test:rls` requiere Docker local y la imagen `postgres:17` ya instalada. Crea y elimina únicamente su contenedor aislado, sin red ni puertos publicados. No descarga imágenes ni modifica Supabase remoto.

## Esquemas y procedencia

`supabase/` conserva los SQL originales y las migraciones de solicitudes. Trasladarlos no los aplica ni garantiza que reconstruyan el esquema completo de producción. Antes de ejecutar SQL, reconciliarlo con el entorno de destino; no aplicar `002_experiences.sql` a ciegas.

`docs/origen-monorepo/` conserva documentos históricos para trazabilidad. Sus rutas y comandos reflejan el monorepo anterior; esta guía define el funcionamiento independiente actual.

El historial de `backend/` fue extraído del repositorio web, sin reescribirlo. El despliegue sigue pendiente: el proyecto del API debe utilizar la raíz de este repositorio, configurar sus variables privadas y exponer una URL HTTPS para `ARK_API_URL`.
