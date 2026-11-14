# Integración con GoHighLevel

El módulo `src/modules/ghl` conecta el API con GoHighLevel (API v2, `https://services.leadconnectorhq.com`) para clientes (contactos), órdenes de servicio (oportunidades), mensajería (SMS/WhatsApp) y disponibilidad (calendarios). Las credenciales viven solo en el backend; Next y el navegador nunca las reciben.

## Configuración

| Variable | Obligatoria | Uso |
|---|---|---|
| `GHL_API_KEY` | Sí | Private Integration Token (o access token) de la subcuenta. |
| `GHL_LOCATION_ID` | Sí | ID de la subcuenta (location); todas las altas y consultas se limitan a ella. |
| `GHL_PIPELINE_ID` | Para oportunidades | Pipeline donde se crean las órdenes de servicio. Sin ella, `POST /ghl/opportunities` responde 503 `ghl_pipeline_not_configured`. |
| `GHL_PIPELINE_STAGE_ID` | No | Etapa inicial; si falta, GoHighLevel aplica la primera del pipeline. |
| `GHL_BASE_URL` | No | Origen alternativo (solo HTTPS, o HTTP en localhost para pruebas). |
| `GHL_CREDENTIALS_KEY` | Para cuentas de proveedores | Secreto aleatorio (mín. 32 caracteres) que cifra los tokens de los proveedores. Sin él, conectar responde 503 `ghl_credentials_unavailable`. Si se rota, los proveedores deben reconectar. |

Alcances del token: `contacts.write`, `opportunities.write`, `conversations/message.write`, `calendars.readonly`.

## Rutas (`/api/v1/ghl`)

Todas requieren el JWT de Supabase. Las escrituras requieren además que el usuario figure en `request_administrators` (operador); el cliente final solo consulta disponibilidad.

| Método y ruta | Acceso | Cuerpo / consulta | GoHighLevel |
|---|---|---|---|
| `POST /contacts` | Operador | `{ firstName?, lastName?, email?, phone?, companyName?, timezone?, tags?, source? }` (email o teléfono E.164) | `POST /contacts/upsert` |
| `PUT /contacts/:id` | Operador | Mismos campos, al menos uno | `PUT /contacts/{id}` |
| `POST /opportunities` | Operador | `{ contactId, name, monetaryValue?, serviceId?, requestId? }` | `POST /opportunities/` (estado `open`) |
| `POST /messages` | Operador | `{ contactId, channel: "sms" \| "whatsapp", message }` (máx. 1.600 caracteres) | `POST /conversations/messages` |
| `GET /calendars` | Autenticado | — | `GET /calendars/?locationId=` |
| `GET /calendars/:id/free-slots` | Autenticado | `startDate`, `endDate` (`YYYY-MM-DD`, máx. 31 días), `timezone?` (IANA) | `GET /calendars/{id}/free-slots` |

`tags` sustituye las etiquetas actuales del contacto (comportamiento de GoHighLevel). `GhlService` se exporta para que otros módulos lo usen del lado del servidor.

## Cuentas propias de los proveedores

Cada proveedor aprobado (`profiles.kind = 'provider'`) puede conectar su propia subcuenta de GoHighLevel. Requiere la migración `supabase/migrations/20261114030000_ghl_provider_accounts.sql`.

| Método y ruta | Acceso | Cuerpo | Respuesta |
|---|---|---|---|
| `PUT /account` | Proveedor | `{ locationId, token, pipelineId?, pipelineStageId? }` | Estado de la conexión |
| `DELETE /account` | El propio usuario | — | `{ connected: false, ... }` |
| `GET /account` | El propio usuario | — | Estado de su conexión |
| `GET /accounts` | Operador | — | `{ items: [estado] }` |
| `GET /accounts/:providerId` | Operador | — | Estado de ese proveedor |

El estado es `{ providerId, connected, locationId, pipelineId, pipelineStageId, connectedAt, updatedAt }`; nunca incluye el token. Antes de guardar, el token se prueba con una lectura barata (`GET /calendars/?locationId=`); si GoHighLevel lo rechaza (400/401/403/404/422) la respuesta es 400 `ghl_invalid_credentials` y no se guarda nada.

**Almacenamiento.** El repo no usa Supabase Vault ni `service_role` (solo la clave publishable con el JWT del usuario), así que el token se cifra en el API con AES-256-GCM usando `GHL_CREDENTIALS_KEY` y en `ghl_provider_accounts` solo queda el texto cifrado, ligado al proveedor y a la location. Ningún rol puede leer esa columna de la tabla; el API la obtiene con la función `ghl_provider_credentials(provider)`, que solo responde para proveedores vigentes, y la descifra en memoria para cada llamada.

**Actuar por un proveedor.** Todas las rutas de contactos, oportunidades, mensajes y calendarios aceptan `?providerId=<uuid>`:

- Sin `providerId` el comportamiento es el de siempre: cuenta de ARK desde el entorno, escrituras solo para operadores.
- Con `providerId` y cuenta conectada se usan el token y la location del proveedor. Las escrituras las puede hacer el propio proveedor o un operador; las lecturas de calendario, cualquier usuario autenticado.
- Las oportunidades van al `pipelineId`/`pipelineStageId` del proveedor. Si no configuró pipeline, se usa `GHL_PIPELINE_ID` solo cuando su location es la de ARK (los pipelines pertenecen a una location); si no, 503 `ghl_pipeline_not_configured`.
- Si el proveedor no conectó cuenta, las lecturas y las escrituras de operadores usan la cuenta de ARK; el proveedor que escribe por sí mismo recibe 409 `ghl_account_not_connected`.

## Errores

Respuestas fijas, sin reenviar cuerpos del proveedor (pueden contener datos personales): 400 entrada inválida, 401/403 identidad u operador, 429 `rate_limited`, 502 `ghl_upstream`, 503 `ghl_not_configured`. Sin reintentos automáticos; tiempo máximo de 10 s por llamada.

## Pruebas

`test/ghl.test.mjs` y `test/ghl-accounts.test.mjs` cubren el servicio con un cliente simulado, el cliente HTTP y las rutas contra servidores locales. No llaman a GoHighLevel real. `node test/ghl-accounts-rls.cjs` aplica la migración en un Postgres 17 aislado y comprueba los permisos. Referencia: [especificaciones OpenAPI oficiales](https://github.com/GoHighLevel/highlevel-api-docs).
