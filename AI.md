# Servicio de IA

Nest concentra la autenticación, la cuota, el contexto del perfil y las llamadas a Meta para conversación, planificación diaria y diagnóstico. Next conserva únicamente el BFF autenticado de `/api/ai`.

## Configuración

| Variable | Servicio | Uso |
|---|---|---|
| `SUPABASE_URL` | Nest | Verificar identidad y consultar cuota/contexto con el JWT del usuario. |
| `SUPABASE_PUBLISHABLE_KEY` | Nest | Clave pública para las solicitudes delegadas a Supabase. |
| `MODEL_API_KEY` | Nest | Credencial privada de Meta; no debe configurarse en Next ni exponerse al navegador. |
| `META_BASE_URL` | Nest | Origen de Meta; los modos estructurados aceptan el origen oficial `https://api.meta.ai`. |
| `AI_DAILY_LIMIT` | Nest | Límite enviado a la RPC `bump_ai` (por defecto: 60). |
| `META_MODEL`, `META_MODEL_QUICK` | Nest | Modelos predeterminado y rápido. |
| `ARK_API_URL` | Next, solo servidor | Origen de Nest; por defecto `http://127.0.0.1:3001`, sin `/api/v1`. |

Las tareas estructuradas fallan de forma cerrada si la RPC de cuota no confirma `true`. Las respuestas de planificación y diagnóstico se validan contra el catálogo y el flujo conocidos antes de devolver la procedencia de Meta. Los tests usan servidores locales simulados, sin llamadas a proveedores externos.

## Presupuesto de tiempo del proxy

El BFF de Next espera hasta 80 segundos: hasta 15 segundos de autenticaci?n, cuota y perfil en Nest, m?s los 60 segundos del proveedor y 5 segundos de margen. No reintenta solicitudes. Al desplegar, el l?mite de ejecuci?n de ambas funciones debe permitir estos presupuestos; un l?mite de plataforma menor puede interrumpirlas antes. La regresi?n se verifica con tiempo virtual, sin consumir Meta.

## Validaci?n de Mi d?a

El esquema enviado a Meta separa servicios por hora (`qty` entre 1 y 12) y los dem?s servicios (`qty: 1`). El n?mero de personas se indica en `guests`, no en `qty`. Se mantiene la validaci?n local del cat?logo, horarios, duplicados y coherencia del plan; no se corrigen ni sustituyen respuestas del proveedor.

Un rechazo devuelve HTTP 502 con `error: "invalid_plan"` y un motivo fijo:

- `truncated`: Meta alcanz? el l?mite de tokens.
- `invalid_metadata`: faltan metadatos requeridos o la respuesta no termin? normalmente.
- `invalid_json`: el contenido no es JSON v?lido.
- `invalid_items`: el JSON incumple las reglas del plan.

Los errores no incluyen texto generado, solicitudes del usuario ni credenciales. No hay reintentos autom?ticos y Mi d?a dispone de un m?ximo de 4.096 tokens por respuesta. Este l?mite puede aumentar el consumo y la latencia; no garantiza evitar toda truncaci?n. El BFF conserva ?nicamente los motivos permitidos.

Referencia: [salidas estructuradas de Meta](https://dev.meta.ai/docs/structured-output), que admite `anyOf` bajo la ra?z. La compatibilidad con el endpoint utilizado requiere tambi?n una prueba real controlada; las pruebas automatizadas locales no consumen Meta.

## Caracteres del diagn?stico

El esquema de `reply` y el validador rechazan caracteres de control (excepto tabulaci?n, retorno y salto de l?nea) y el car?cter de sustituci?n Unicode. Las tildes, la ?, los signos y los emojis v?lidos se conservan. Un texto corrupto devuelve `invalid_diagnosis` con motivo `invalid_answers`; no se muestra como respuesta v?lida ni se reconstruyen letras a partir de n?meros. No se agregan reintentos ni se modifican conversaciones anteriores. La prueba local valida el contrato, no garantiza la calidad de futuras respuestas de Meta.
