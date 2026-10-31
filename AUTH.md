# Identidad de clientes en NestJS

NestJS reutiliza las cuentas de Supabase Auth de la web. No crea usuarios paralelos ni confía en identificadores enviados por el cliente.

## Configuración local

Copiar `backend/.env.example` a `backend/.env.local` y completar la URL y la clave pública del mismo proyecto Supabase. No usar `service_role`. El archivo privado no debe subirse a Git.

Desde la raíz, ejecutar:

```powershell
npm run build:api
node --env-file=backend/.env.local backend/dist/main.js
```

`npm run dev:api` sigue leyendo el entorno del proceso; no carga archivos `.env` automáticamente. Para usar el watcher, definir `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en su terminal antes de iniciarlo. La web conserva sus variables `NEXT_PUBLIC_SUPABASE_*` en el `.env.local` de la raíz.

## Contrato

`GET /api/v1/me` requiere `Authorization: Bearer <access_token>` de una sesión Supabase válida. Devuelve únicamente `{ "user": { "id": "UUID" } }`, con `Cache-Control: no-store`. No devuelve correo, gustos, diagnóstico, roles ni tokens.

| Situación | Resultado |
|---|---|
| Token ausente, mal formado o rechazado por Supabase | 401 |
| Configuración ausente o proveedor no disponible | 503 |
| Token validado | 200 con el ID canónico de Supabase |

El adaptador consulta `/auth/v1/user`, no decodifica un JWT sin verificarlo. Limita la consulta a cinco segundos, rechaza redirecciones y oculta errores privados. Solo permite HTTPS, salvo HTTP en loopback para desarrollo local.

## Protección por defecto

`IdentityGuard` se registra globalmente. Cada nuevo handler exige identidad salvo que tenga `@Public()` explícito. Solo salud y las dos consultas del catálogo son públicas. Una ruta inexistente sigue devolviendo 404.

Esto establece autenticación, no autorización sobre solicitudes todavía inexistentes. Cada futuro caso de uso deberá filtrar sus datos por `request.principal.id`; los roles no se derivan de `user_metadata`.

## Verificación

`npm run test:api` compila y prueba HTTP con un proveedor local simulado. No requiere Docker, credenciales ni acceso a Supabase real. La comprobación con una cuenta real sigue pendiente de configuración y sesión.
