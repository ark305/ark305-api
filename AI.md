# Migración incremental de IA a Nest

Nest incorpora `POST /api/v1/ai` para conversación general autenticada. Es una primera unidad de migración: **Next todavía atiende el recorrido web y sus modos estructurados**. No cambiar la URL del cliente hasta completar diagnóstico y planificación en Nest.

## Contrato de esta unidad

- Bearer de Supabase verificado por `IdentityGuard`; nunca se acepta identidad enviada en el cuerpo.
- Entrada existente: `prompt`, `locale`, `tier` y `json`. Salida: `{ text, user }`, sin contenido de razonamiento del proveedor y con `Cache-Control: no-store`.
- `day-plan` y `diagnosis` devuelven temporalmente `400 task_not_available` antes de consumir cuota. Se implementarán en la siguiente unidad, sin simulaciones.
- La cuota genérica conserva el comportamiento anterior: una respuesta explícita `false` bloquea con `429 rate_limited`; un error HTTP de cuota no bloquea este modo legado. Los fallos de transporte o JSON devuelven `503 quota_unavailable`. Esta compatibilidad no se debe extender a los modos estructurados, que requieren autorización explícita de cuota.
- La lectura opcional del modo usa el JWT del usuario. La clave de Meta solo se envía al proveedor; errores de transporte, JSON o proveedor se reducen a `502 upstream` sin revelar sus cuerpos.

## Configuración y verificación

Definir `META_API_KEY`, `META_MODEL`, `META_MODEL_QUICK` opcional, `META_BASE_URL` y `AI_DAILY_LIMIT` en el entorno **de Nest**, junto con su configuración Supabase existente. Los ejemplos no contienen secretos; esta entrega no copia ni activa las credenciales privadas.

`npm --prefix backend test` incluye pruebas HTTP con un proveedor local sintético, sin llamadas a Meta ni Supabase remotos. El adaptador restringe las URLs a HTTPS o loopback HTTP, bloquea redirecciones y aplica plazos de espera.

La implementación mantiene el contexto por solicitud, no en propiedades compartidas del servicio. No incorpora `service_role`. Referencias: [controladores Nest](https://docs.nestjs.com/controllers) y [claves de API Supabase](https://supabase.com/docs/guides/getting-started/api-keys).
