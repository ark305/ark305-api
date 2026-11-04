# MVP de hackathon: tres flujos, sin reservas ficticias

Implementación local del 4 de noviembre de 2026. Código no publicado; migración de complementos aplicada al Supabase de pruebas con autorización explícita. El recorrido reutiliza Mi día, solicitudes e historial; no sustituye autenticación ni integra proveedores reales.

## Recorrido

1. **Consultar:** en Mi día, escribir una intención en ES o EN. Nest solicita a Meta una llamada `search_catalog`; ejecuta la consulta sobre `CatalogPort` y devuelve el resultado mediante `tool_result`. Una segunda respuesta genera el plan. Solo se aceptan identificadores devueltos por la herramienta. La interfaz permite inspeccionar las herramientas ejecutadas.
2. **Solicitar:** aceptar el plan, elegir fecha y enviar una solicitud con los controles existentes. Se conserva el identificador de la solicitud y su historial de estados. Una solicitud recibida **no es una reserva confirmada**.
3. **Complementar:** desde la solicitud, pedir una propuesta opcional. Meta invoca `get_complements`. Se muestra el precio incremental orientativo; solo el botón de aceptación escribe el complemento. Descartar no escribe. Recargar consulta almacenamiento, no vuelve a llamar a Meta.

## Qué existía y qué cambia

| Antes de esta implementación | Implementado ahora |
| --- | --- |
| Next como web, Nest como API, autenticación y catálogo demo | Intercambio real de herramientas Meta y evidencia de consulta |
| Generación de Mi día, solicitudes e historial | Restricción de recomendaciones a resultados del catálogo |
| Estados administrativos y protección por usuario | Complementos aceptados vinculados a la misma solicitud |
| Pruebas de diagnóstico, equipo y vendedor | Regresiones conservadas y pruebas nuevas ES/EN |

La atribución temporal al evento debe contrastarse con las reglas del organizador; este documento no certifica elegibilidad.

## Contratos y límites

- Catálogo: `source: demo`, `availability: unverified`, `bookable: false`. Los precios son ejemplos, no cotizaciones ni disponibilidad del proveedor.
- Herramientas solo de lectura. Meta no crea solicitudes, no acepta complementos ni modifica estados.
- `POST /api/ai` admite `day-plan` y `day-upsell`; devuelve plan, procedencia y evidencia de herramientas. Un servicio inexistente o un identificador ajeno al resultado nunca se convierte en una opción válida.
- `GET/POST /service-requests/:id/addons` reutiliza autenticación y propiedad de la solicitud. POST requiere `{serviceId, accepted: true}`. Se limita a complementos compatibles y solicitudes activas.
- La tabla `service_request_addons` conserva la solicitud original. RLS, permisos de columnas, unicidad y bloqueo de la fila padre protegen aceptación y concurrencia. La lectura HTTP es del propietario; no se añadió una nueva bandeja administrativa.
- Un resultado incierto se reconcilia leyendo almacenamiento. No se afirma que una aceptación fallida se guardó.
- Errores, límite de uso, truncamiento o falta de herramientas no se reemplazan por una respuesta simulada.

## Configuración y migración

Backend: `MODEL_API_KEY`, `META_MODEL=muse-spark-1.3`, `META_BASE_URL=https://api.meta.ai`. La clave anterior `META_API_KEY` ya no es leída. El frontend solo conoce la URL del backend; nunca la clave del modelo. Los archivos privados de entorno no se versionan.

Antes de probar aceptación contra una base nueva, aplicar **con autorización y en el entorno elegido** las migraciones previas y `supabase/migrations/20261104162321_request_addons.sql`. La migración se aplicó al proyecto remoto de pruebas `bxvljzrodkvpxsebfvvy` como `request_addons` (versión remota `20261104171447`). Antes de aplicarla, la consulta de complementos devolvía 503 y la interfaz no fingía persistencia. El nombre local de archivo conserva su versión original; no ejecutar un lote de migraciones remotas sin reconciliar los historiales.

## Evidencia observada

| Comprobación | Resultado |
| --- | --- |
| Backend completo tras el ajuste de protocolo | 73 pruebas aprobadas |
| Frontend completo | 107 pruebas aprobadas |
| Ajuste de protocolo y regresiones estructuradas | 17 pruebas aprobadas |
| TypeScript frontend y compilación backend | Aprobados |
| Meta real, catálogo ES | `muse-spark-1.3`, `search_catalog`, plan válido con yacht |
| Meta real, complemento EN | `muse-spark-1.3`, `get_complements`, plan válido con photographer |
| Aceptación, recarga sin Meta, doble clic, cambio de sesión, escritura incierta | Pruebas deterministas con componentes reales y transporte simulado |
| PostgreSQL real aislado | Aprobados permisos/RLS, unicidad, compatibilidad y bloqueo concurrente de cancelación; bootstrap mínimo de auth |
| Supabase remoto de pruebas | Tabla con RLS creada; solicitud y complemento aceptado visibles después de recargar |
| Navegador ES | Meta consultó catálogo, plan de yate, solicitud persistida, propuesta de chef aceptada y recuperada tras recargar |
| Navegador EN | Recorrido independiente: Meta consultó catálogo y propuso mesa de restaurante; solicitud recibida, SUV compatible aceptado y ambos persistieron al recargar sin llamadas adicionales a Meta |
| Casos negativos y Meta EN | Servicios inexistentes, IDs ajenos y errores de Meta: pruebas deterministas; no se provocaron errores del proveedor en el entorno real |

La prueba real detectó que este endpoint rechaza `tool_choice: any`: solo admite `auto`. Se corrigió la primera llamada a `auto`, manteniendo la exigencia de recibir `tool_use`; la segunda omite herramientas. El presupuesto conjunto es de 50 segundos. No hay bucle ilimitado ni reintentos automáticos al proveedor.

## Repetición manual ES/EN

1. Iniciar sesión, elegir idioma y pedir una experiencia de yate para cuatro. Inspeccionar herramientas, identificadores y aviso demo.
2. Agregar al día, elegir fecha y enviar la solicitud. Recargar y comprobar la misma identidad, datos y estado en historial.
3. Pedir un complemento, revisar precio y aceptar una vez. Recargar: debe persistir sin otra llamada a Meta ni una nueva solicitud.
4. Repetir descartando: no debe existir aceptación almacenada.
5. Pedir un servicio inexistente y comprobar que no se inventa una opción. Simular errores del proveedor mediante las pruebas, no cambiando claves de producción.
6. Repetir el recorrido en el otro idioma y comprobar que una segunda cuenta no puede leer ni aceptar complementos ajenos.

## Referencias

- [Meta Messages](https://dev.meta.ai/docs/protocols/messages)
- [Meta tool calling](https://dev.meta.ai/docs/tool-calling)
- [Especificaciones y avance local](../odd/tasks/hackathon-concierge.md)
- Plan visual local: `../hackathon-plan.html`, desde la carpeta padre de ambos repositorios; no está versionado en estos repositorios.

El recorrido independiente en inglés quedó completado con mesa de restaurante y SUV, sin duplicar la solicitud española de yate. Publicar, modificar Vercel o aplicar una migración remota requiere autorización independiente.

## Prueba SQL reproducible

Con Docker activo y Python: `python test/request-addons-runtime.py`. Crea PostgreSQL 16 aislado, sin red, puertos ni volúmenes de host, aplica migraciones y verifica RLS y concurrencia. El contenedor se elimina al finalizar. Requiere la imagen oficial `postgres:16-alpine` (Docker puede descargarla si no está disponible). No usa credenciales ni datos del proyecto.
