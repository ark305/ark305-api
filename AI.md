# Servicio de IA

Nest concentra la autenticación, la cuota, el contexto del perfil y las llamadas a Meta para conversación, planificación diaria y diagnóstico. Next conserva únicamente el BFF autenticado de `/api/ai`.

## Configuración

| Variable | Servicio | Uso |
|---|---|---|
| `SUPABASE_URL` | Nest | Verificar identidad y consultar cuota/contexto con el JWT del usuario. |
| `SUPABASE_PUBLISHABLE_KEY` | Nest | Clave pública para las solicitudes delegadas a Supabase. |
| `META_API_KEY` | Nest | Credencial privada de Meta; no debe configurarse en Next ni exponerse al navegador. |
| `META_BASE_URL` | Nest | Origen de Meta; los modos estructurados aceptan el origen oficial `https://api.meta.ai`. |
| `AI_DAILY_LIMIT` | Nest | Límite enviado a la RPC `bump_ai` (por defecto: 60). |
| `META_MODEL`, `META_MODEL_QUICK` | Nest | Modelos predeterminado y rápido. |
| `ARK_API_URL` | Next, solo servidor | Origen de Nest; por defecto `http://127.0.0.1:3001`, sin `/api/v1`. |

Las tareas estructuradas fallan de forma cerrada si la RPC de cuota no confirma `true`. Las respuestas de planificación y diagnóstico se validan contra el catálogo y el flujo conocidos antes de devolver la procedencia de Meta. Los tests usan servidores locales simulados, sin llamadas a proveedores externos.

## Presupuesto de tiempo del proxy

El BFF de Next espera hasta 80 segundos: hasta 15 segundos de autenticaci?n, cuota y perfil en Nest, m?s los 60 segundos del proveedor y 5 segundos de margen. No reintenta solicitudes. Al desplegar, el l?mite de ejecuci?n de ambas funciones debe permitir estos presupuestos; un l?mite de plataforma menor puede interrumpirlas antes. La regresi?n se verifica con tiempo virtual, sin consumir Meta.
