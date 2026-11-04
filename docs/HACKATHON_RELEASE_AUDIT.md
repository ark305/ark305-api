# Auditoría previa a la entrega de la hackathon

**Estado:** preparación local. Esta auditoría no autoriza publicar repositorios, cambiar su visibilidad, desplegar ni enviar el formulario.

## Resultado ejecutivo

| Control | Resultado observado | Falta antes de publicar |
| --- | --- | --- |
| Tres flujos del MVP | Recorridos ES y EN en navegador, con solicitudes y complementos persistidos | Probar el despliegue final en incógnito |
| Revisión de código | Cuatro commits funcionales/documentales aprobados y reconocidos; sin bloqueadores | Dos advertencias no bloqueantes de API detalladas abajo; evaluar nuevos cambios ejecutables antes de entregar |
| Secretos | Sin candidatos confirmados en archivos versionados ni en los parches históricos revisados | Revisión final del diff y herramientas de secret scanning del anfitrión |
| Marca restringida | Sin coincidencias textuales con los nombres y variantes de la marca de terceros en los dos repositorios ni en sus parches históricos | Inspección visual de imágenes, video y metadatos antes de hacerlos públicos |
| Licencia | ARK305 autorizó MIT para ambos repositorios; los archivos `LICENSE` y los avisos README están preparados localmente | Confirmar que los archivos figuran en los commits definitivos |
| Producción | Archivos privados `.env.vercel` presentes, completos y excluidos de Git | Confirmar variables efectivas en Vercel, desplegar y probar URL pública |
| Publicación | Cadena de rama funcional elegida para commits locales; sin push ni PR | Verificar cada unidad y autorizar por separado cualquier push/cambio de visibilidad/despliegue |

## Alcance y método

- Se revisaron los archivos versionados y los parches de todas las referencias Git locales: **63 commits web** y **33 commits API** al momento de esta auditoría. No se inspeccionó un historial remoto no presente en los clones.
- Se buscaron prefijos de credenciales conocidos y asignaciones de claves privadas, además de las marcas indicadas en el plan. Las coincidencias de secretos detectadas pertenecen a archivos de prueba y requieren contraste final; ningún valor se reproduce aquí.
- El barrido textual **no detecta secretos de formato desconocido** ni texto contenido en imágenes binarias. Tampoco demuestra que un secreto jamás haya aparecido en un commit remoto reescrito o no descargado.
- `.env.local` y `.env.vercel` están ignorados por Git. Se comprobó solo presencia, no vaciedad y origen de las URL; no se imprimieron valores privados.
- Web: `ARK_API_URL` apunta a `ark305-api.vercel.app` y la URL pública de Supabase al proyecto `bxvljzrodkvpxsebfvvy`. API: `MODEL_API_KEY` está presente, `META_BASE_URL` apunta a `api.meta.ai` y Supabase al mismo proyecto. Esto **no confirma** las variables efectivas del panel de Vercel.
- Se aplicó con autorización la migración de complementos al Supabase de pruebas. Su versión remota (`20261104171447`) difiere de la versión del archivo local (`20261104162321`); no ejecutar `db push` por lotes sin reconciliar el historial.

## Unidades de commit preparadas

Los cambios siguen sin push. La estrategia elegida es una cadena de rama funcional: una referencia local de seguimiento nace en el commit base y cada unidad posterior depende de la anterior. No se crearán PR sin autorización. Se preparan unidades revisables, con pruebas y documentación del mismo comportamiento juntas.

| Repositorio | Unidad local | Contenido principal |
| --- | --- | --- |
| API | `82bc223` · `feat(ai): consult Meta catalog tools` | Adaptador de herramientas, validación de resultados, `MODEL_API_KEY`, pruebas y documentación del contrato |
| API | `94564f6` · `feat(requests): persist accepted add-ons` | Servicio y controlador de complementos, migración SQL, pruebas de permisos y concurrencia |
| API | `3f984e2` · `docs: prepare hackathon release` | Proceso, auditoría, guion y registro de tareas |
| Web | `546591e` · `feat(concierge): show catalog evidence and accepted add-ons` | Evidencia de herramientas, aceptación desde solicitudes, textos ES/EN, pruebas de interfaz y licencia MIT |

Los cuatro commits existen solo en los repositorios locales; se añadirá una unidad documental de cierre para registrar sus identidades. No se debe publicar el historial hasta obtener autorización específica.

## Advertencias no bloqueantes de revisión

- **Configuración del modelo:** si la variable efectiva del API desplegada sigue siendo `META_API_KEY`, la nueva versión responderá `ai_not_configured` (503). Confirmar `MODEL_API_KEY` en Vercel antes de desplegar; el archivo local `.env.vercel` no demuestra el valor efectivo.
- **Carrera de cancelación:** la base de datos rechaza sin escritura una aceptación posterior a la cancelación, incluso si la solicitud estaba activa en la lectura inicial. En ese caso el servicio puede responder 503 en lugar de 409. La persistencia queda protegida, pero la semántica HTTP merece una corrección posterior. No se presenta como reserva confirmada.

## Antes de grabar

1. Elegir cuenta de demostración y ocultar correo, credenciales, tokens y datos personales de terceros.
2. Confirmar visualmente cada imagen, logo, título, URL, miniatura y metadato del material público; excluir la marca restringida sin autorización de su titular.
3. Mostrar `Meta`, el nombre del modelo y la herramienta ejecutada sin exponer claves ni pestañas de configuración.
4. Decir **solicitud recibida**, nunca reserva, compra o disponibilidad confirmada. Los precios son estimaciones DEMO.
5. Grabar y comprobar el video final desde una ventana sin sesión antes de compartir el enlace.

## Puertas de entrega

- [ ] Confirmar que la licencia MIT, los archivos `LICENSE` y los avisos README figuran en los commits definitivos de ambos repositorios.
- [ ] Revisión manual de imágenes y video para marca restringida y datos sensibles.
- [ ] Auditoría final de secretos sobre los commits definitivos y comprobación del historial remoto.
- [ ] Variables reales de Vercel confirmadas sin mostrar secretos; despliegue y prueba ES/EN en incógnito.
- [ ] Repositorios y video accesibles con la visibilidad autorizada.
- [ ] Formulario de Cerebral Valley enviado por la persona responsable; confirmación conservada.

El plan visual `hackathon-plan.html` está en la carpeta padre de ambos repositorios y mantiene un checklist manual. Ninguna casilla se marca automáticamente por este documento.
