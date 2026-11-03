# Gestión de solicitudes

Las solicitudes representan interés del cliente. No confirman reservas, disponibilidad, cobros ni compromisos de proveedores.

## Estados

El flujo permitido es **Recibida → En gestión → Cerrada**. Se puede cancelar desde Recibida o En gestión. Cerrada y Cancelada son terminales; no se permite reabrir ni repetir una transición.

## API administrativa de Nest

Todas las rutas requieren `Authorization: Bearer <sesión del usuario>`. El backend verifica la identidad y consulta el registro protegido de administradores. El campo profesional del perfil y los metadatos editables del usuario no conceden permisos.

| Método y ruta | Resultado |
| --- | --- |
| `GET /api/v1/admin/service-requests` | Últimas 50 solicitudes, ordenadas por creación e identificador descendentes; incluye `requesterId`. |
| `PATCH /api/v1/admin/service-requests/:id` | Cambia únicamente el estado y devuelve la solicitud actualizada. |
| `GET /api/v1/admin/service-requests/:id/history` | Consulta los eventos de una solicitud con permiso administrativo. |
| `GET /api/v1/service-requests/:id/history` | Consulta los eventos únicamente de una solicitud propia. |

Ejemplo de cuerpo de transición:

Los identificadores UUID aceptan letras mayúsculas o minúsculas y se normalizan antes de comparar la respuesta del almacenamiento.

```json
{ "expectedStatus": "received", "status": "in_progress" }
```

- `400`: cuerpo, identificador o transición inválidos; no se realiza la escritura.
- `401`: falta una sesión válida.
- `403`: el usuario no es administrador.
- `409`: la solicitud ya cambió o no está disponible; actualizar la lista antes de decidir otra acción.
- `503`: no se pudo validar el almacenamiento o su respuesta. En una escritura, el resultado puede ser incierto: consultar de nuevo, no repetir automáticamente.

El estado esperado se compara en la misma actualización SQL. El trigger guarda el cambio y su evento en una sola transacción: ambos se confirman o ambos se revierten. Los clientes no pueden escribir estados ni eventos directamente.

## Alcance actual

El esquema y el administrador autorizado están configurados en Supabase. Los lectores propios de Nest y Next admiten los cuatro estados; crear una solicitud sigue produciendo únicamente `received`.

La bandeja web está en `/solicitudes`, accesible desde el menú del perfil y el historial de Mi día. El cliente consulta sus últimas 50 solicitudes y sus eventos; Oscar, como único administrador autorizado, consulta todas y puede iniciar la gestión, cerrar o cancelar según el estado actual.

El botón **Ver historial** muestra la fecha de creación y las transiciones realmente guardadas. No genera eventos ficticios. Los eventos se ordenan por fecha e identificador, sin exponer el identificador del actor.

Next actúa como proxy de rutas permitidas hacia Nest. Solo transmite el bearer de la sesión, nunca cookies ni claves de servicio. Un `403` de la lista administrativa selecciona la vista del cliente; un error de autenticación o disponibilidad no se convierte en una lista vacía.

Los cambios no son optimistas ni se reintentan automáticamente. Ante conflicto o resultado incierto, se bloquean nuevas mutaciones hasta una actualización manual satisfactoria. Cambiar de cuenta, renovar la sesión o cerrarla invalida las respuestas anteriores; abortar la petición no implica cancelar una escritura ya recibida por el servidor.

### Recorrido de comprobación

1. Abrir `http://localhost:3100/solicitudes` con una sesión válida.
2. Comprobar el modo personal o administrativo y abrir **Ver historial**.
3. Con una solicitud de prueba autorizada, iniciar gestión y actualizar la página: el estado y el evento deben persistir.
4. Cerrar o cancelar esa solicitud: no deben aparecer acciones para reabrirla.

La comprobación de escritura remota se realiza solo con datos de prueba autorizados; no se deben alterar solicitudes existentes para demostrar el flujo.

## Verificación local

```sh
npm --prefix backend test
npm --prefix backend run test:rls
node --test frontend/test/service-requests.test.mjs frontend/test/day-requests.test.mjs frontend/test/requests-inbox.test.mjs frontend/test/requests-inbox-ui.test.mjs
```

La prueba RLS usa PostgreSQL 17 aislado en Docker, sin red y con identidades de prueba. No modifica Supabase remoto ni llama a Meta.
