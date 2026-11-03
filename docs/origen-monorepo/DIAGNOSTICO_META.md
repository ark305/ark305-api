# Diagnóstico conversacional con Meta

## Recorrido

El diagnóstico es el primer paso después del inicio de sesión. La ruta `/diagnostico` comprueba que exista una sesión y un perfil; redirige a `/entrar` o al alta mínima cuando corresponda. Después, la persona conversa con Meta Muse Spark, puede ajustar la propuesta y decide explícitamente cuándo guardarla y abrir su Snapshot.

La conversación requiere una sesión válida. La interfaz envía el token actual a `/api/ai` y descarta resultados pendientes al cerrar sesión o cambiar de cuenta. No se habilita acceso anónimo.

## Contrato y datos

La tarea `diagnosis` recibe un mensaje, las respuestas estructuradas conocidas y un historial acotado. El servidor valida los campos contra las preguntas y opciones existentes, limita tamaño y cantidad, verifica la sesión y consume la cuota existente `bump_ai`. Los fallos de cuota o de Meta no generan respuestas simuladas.

El servidor calcula `complete` a partir de las respuestas validadas; no confía en un indicador del modelo. La interfaz muestra el proveedor, modelo e ID de respuesta que devolvió Meta. El texto conversacional sirve como propuesta, no como dato operativo ni autorización. No afirma proveedores, precios, disponibilidad, métricas o permisos.

Solo al confirmar la propuesta se guardan las respuestas saneadas en el formato de perfil existente `{ answers, at }`. No se persisten el historial de conversación ni el texto generado. El Snapshot conserva sus cálculos deterministas y el esquema actual.

## Configuración y límites

En el entorno de servidor de Vercel deben configurarse las variables privadas ya usadas por la aplicación para Supabase y Meta, en particular `META_API_KEY`; no se debe exponer una clave de proveedor al navegador. La configuración de la base conserva la cuota `bump_ai`. La llamada de diagnóstico usa el endpoint Meta configurado, límite de tiempo y validación estricta de la respuesta estructurada. Una respuesta malformada produce error, no una propuesta alternativa.

La documentación de configuración de producción debe seguir las variables y políticas del despliegue vigente. Esta guía no prueba credenciales, conexión a Meta, Supabase remoto ni configuración de Vercel.

## Comprobaciones locales

```sh
node --test test/diagnosis-ai.test.mjs test/diagnosis-ui.test.mjs
```

Las pruebas usan respuestas simuladas y verifican el contrato, sesión, cuota, procedencia, confirmación explícita, cambio de cuenta y manejo de errores. No constituyen una prueba de integración con los servicios remotos.

## Identificar una respuesta rechazada

### Última pasada real: 2026-11-01

El esquema actualizado fue aceptado en una llamada real: diagnóstico y plan HTTP200, guardado del Snapshot comprobado tras recarga y dos solicitudes HTTP201 conservadas en el historial. Se consumió una llamada de diagnóstico y una de plan, sin reintentos. Esto verifica el recorrido, no garantiza ausencia de fallos intermitentes.

La pasada mostró dos observaciones que se investigaron sin nuevas llamadas a Meta ni escrituras. La discrepancia de fecha se reprodujo como un problema de la herramienta `fill`: cambia el DOM sin actualizar la prop controlada por React. El teclado nativo sí actualiza ambos valores. No se demostró un defecto de selección de fecha mediante interacción nativa ni se reenviaron o alteraron solicitudes.

Se rectifica la afirmación de caracteres NUL: se observó una representación de texto en la herramienta, pero no se verificaron los puntos de código del JSON original. Esa respuesta ya no estaba disponible al investigar. La corrupción de texto queda **no confirmada**, sin atribuirla a Meta o a la aplicación ni modificar el código para repararla a ciegas.

### Procedimiento de pruebas en Chrome

Para controles de fecha, utilizar el selector nativo o el teclado; no considerar suficiente una lectura del DOM después de `fill`. Antes de enviar, confirmar que la interfaz reaccionó al cambio y que el estado controlado coincide con la fecha visible. En esta comprobación, las teclas cambiaron ambos valores de 2026-11-01 a 2026-11-08; `fill` solo cambió el DOM. La fecha original se restauró con el teclado. No enviar solicitudes adicionales para comprobar únicamente la interacción del campo.

Ante una posible anomalía de caracteres, verificar los puntos de código del texto decodificado antes de recargar o descartar la respuesta; no deducir corrupción a partir de escapes mostrados por una herramienta. No registrar conversaciones completas, credenciales ni contenido personal como diagnóstico.

### Corrección local del contrato (2026-11-01)

El esquema de `answers` ahora contiene una rama por perfil. Los campos de un perfil no pueden mezclarse con otro. En el primer turno, cualquier parche con respuestas requiere `who`; en los siguientes se puede omitir si mantiene el perfil validado. Un cambio de perfil debe incluir `who`. Se permite un parche vacío para pedir aclaraciones y el servidor sigue calculando la completitud.

El texto `reply` exige contenido distinto de espacios. Las listas indican que no deben repetirse opciones; el servidor conserva el rechazo de duplicados porque Meta no admite `uniqueItems`. No se eliminan datos inválidos silenciosamente ni se relaja el validador.

Ante un rechazo, el servidor registra `diagnosis_validation` con solo `field` y `code` de valores controlados. Por ejemplo: `{ "field": "answers.interests", "code": "wrong_flow" }`. Los códigos distinguen `missing_who`, `wrong_flow`, `duplicate_items`, `unknown_field`, `invalid_type` e `invalid_value`. Los nombres desconocidos se reemplazan por `answers` o `$`; no se registran mensajes, valores, credenciales ni respuestas crudas. El error público sigue siendo `invalid_diagnosis` con `reason: invalid_answers`.

La corrección se verifica localmente sin inferencia remota. No identifica retrospectivamente el campo del incidente anterior ni acredita todavía el recorrido real completo. La estructura usa `anyOf` bajo la raíz, conforme a la [documentación de salida estructurada de Meta](https://dev.meta.ai/docs/structured-output#enforce-strict-mode); su aceptación en una nueva llamada real queda pendiente.

Actualización (2026-11-01): una nueva pasada mediante agente en Chrome reprodujo `invalid_answers` con la interfaz actual y el botón correctamente accesible. Se detuvo después de una sola llamada, sin reintentos ni solicitudes de servicios. El problema de validación sigue abierto; es necesario identificar el campo rechazado antes de volver a probar el recorrido completo.

Estado de la pasada real (2026-10-31): el historial ya responde tras aplicar la migración de solicitudes autorizada. Una llamada adicional autorizada obtuvo un diagnóstico completo de Meta con HTTP 200. El rechazo anterior `invalid_answers` no se reprodujo y su causa no está identificada. Todavía no está demostrado el recorrido completo hasta una solicitud persistida: una interfaz desactualizada provocó navegación accidental antes del guardado. Una recarga sin caché confirmó que se cargó la corrección de posición del compositor; no se repitieron llamadas para reemplazar el borrador perdido.

Un error `invalid_diagnosis` incluye un campo `reason` sin contenido del usuario ni del modelo: `truncated` indica límite de salida, `invalid_json` contenido no procesable, `invalid_answers` respuestas fuera del contrato y `invalid_metadata` metadatos ausentes o finalización inesperada. Para investigar, compartir solo este JSON; nunca encabezados Authorization ni cookies.

El esquema solicita respuestas no vacías; los campos desconocidos deben omitirse. El validador del servidor sigue siendo obligatorio. Una prueba real exitosa aislada no demuestra que un fallo intermitente esté resuelto.

Compatibilidad comprobada con Meta: no enviar `uniqueItems` en el esquema de salida; el proveedor rechaza esa palabra clave con HTTP 400. Los duplicados se siguen rechazando en el validador del servidor.

El diagnóstico dispone de hasta 4096 tokens de salida por llamada para incluir razonamiento y JSON completo; el presupuesto anterior de 1500 produjo respuestas truncadas. Las demás tareas mantienen 1500. Es un máximo, no un consumo fijo: puede aumentar el costo por turno. Se conserva la cuota diaria, el tiempo máximo y el rechazo de respuestas incompletas; no hay reintentos automáticos.

La pasada real también encontró truncamiento con 4096 tokens. El diagnóstico solicita ahora `output_config.effort: "low"` para reducir el razonamiento sin aumentar ese máximo. No desactiva el razonamiento ni garantiza que toda respuesta quepa: se mantiene el rechazo de salidas truncadas. Las demás tareas no cambian. [Referencia oficial de Messages API](https://dev.meta.ai/docs/protocols/messages#reasoning).
