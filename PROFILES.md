# Módulo de perfiles

El módulo Nest centraliza las escrituras y lecturas de perfiles, servicios, preferencias y diagnóstico. Next.js conserva únicamente la sesión web, las cookies, la navegación y la revalidación de páginas.

## Contratos HTTP

| Ruta | Acceso | Propósito |
|---|---|---|
| `GET /api/v1/profiles/me` | Bearer de usuario | Perfil privado propio y servicios propios |
| `POST/PATCH /api/v1/profiles/me` | Bearer de usuario | Crear o actualizar el perfil autenticado |
| `GET /api/v1/profiles/check-handle?handle=` | Bearer de usuario | Validar disponibilidad excluyendo al usuario actual |
| `POST /api/v1/profiles/me/services` | Bearer de usuario | Crear un servicio con propietario verificado |
| `PATCH/DELETE /api/v1/profiles/me/services/:id` | Bearer de usuario | Modificar o borrar solo servicios propios |
| `PATCH /api/v1/profiles/me/steps/:step` | Bearer de usuario | Marcar `bio_link` o `shared` |
| `PATCH /api/v1/profiles/me/taste` | Bearer de usuario | Guardar gustos normalizados |
| `PATCH /api/v1/profiles/me/side` | Bearer de usuario | Guardar la experiencia Personal/Business |
| `PUT/DELETE /api/v1/profiles/me/diagnosis` | Bearer de usuario | Guardar diagnóstico ligado al usuario o borrarlo |
| `GET /api/v1/profiles/handle/:handle` | Público | Perfil público y servicios, sin gustos ni diagnóstico |
| `GET /api/v1/profiles/recent?limit=24` | Público | Perfiles públicos recientes, sin campos privados |

## Seguridad

Las rutas privadas usan `IdentityGuard` y reenvían a Supabase el JWT del usuario junto con la clave publicable; nunca usan `service_role`. Las escrituras filtran por el ID verificado y las consultas de servicios por `owner`. Las respuestas públicas usan una lista positiva de campos. Auth y Storage continúan en los adaptadores web.

## Integración web

`src/lib/backend-api.ts` resuelve `ARK_API_URL` (por defecto `http://127.0.0.1:3001`) y solo permite HTTP para loopback. Cada llamada aplica timeout, `redirect: error`, `no-store` y errores genéricos sin detalles del proveedor.

Para componer la aplicación Nest de producción, importar `ProfilesModule` junto con `IdentityModule` en el módulo raíz.
