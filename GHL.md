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

## Errores

Respuestas fijas, sin reenviar cuerpos del proveedor (pueden contener datos personales): 400 entrada inválida, 401/403 identidad u operador, 429 `rate_limited`, 502 `ghl_upstream`, 503 `ghl_not_configured`. Sin reintentos automáticos; tiempo máximo de 10 s por llamada.

## Pruebas

`test/ghl.test.mjs` cubre el servicio con un cliente simulado, el cliente HTTP y las rutas contra servidores locales. No llama a GoHighLevel real. Referencia: [especificaciones OpenAPI oficiales](https://github.com/GoHighLevel/highlevel-api-docs).
