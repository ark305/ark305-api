# Solicitudes de servicios

La API guarda solicitudes de interés del usuario autenticado. El estado inicial `received` confirma únicamente que la solicitud fue recibida; no confirma disponibilidad, proveedor, precio ni reserva.

## Rutas

| Método | Ruta | Resultado |
|---|---|---|
| `POST` | `/api/v1/service-requests` | Crea una solicitud propia. Devuelve `201` y el DTO sin el identificador del propietario. |
| `GET` | `/api/v1/service-requests` | Devuelve las últimas 50 solicitudes propias, de más reciente a más antigua. |
| `GET` | `/api/v1/service-requests/:id` | Devuelve una solicitud propia; una fila ajena o inexistente responde `404`. |

Todas requieren `Authorization: Bearer <access-token>` de Supabase. El cuerpo de creación acepta únicamente:

```json
{
  "serviceId": "yacht",
  "requestedDate": "2027-01-15",
  "guests": 4,
  "preferences": "Atardecer"
}
```

`serviceId` debe existir en el catálogo demo; `requestedDate` debe ser una fecha calendario `YYYY-MM-DD`; `guests` debe estar entre 1 y 20; `preferences` es opcional y admite hasta 2000 caracteres. No se aceptan campos de propietario, estado, reserva o precio.

## Persistencia y privacidad

La migración `supabase/migrations/20261031031940_service_requests.sql` crea `public.service_requests`. La identidad se deriva en PostgreSQL de `auth.uid()`, con RLS para lectura e inserción propias. El API filtra además por propietario; el mismo JWT y la clave publishable se usan en PostgREST. No usa `service_role` y no expone el propietario en su respuesta.

Solo se conceden `SELECT` sobre las columnas de lectura y `INSERT` sobre los campos que el usuario puede enviar. No se conceden permisos de actualización ni eliminación; tampoco existe transición de estado en esta entrega. La migración se entrega como archivo y **no se aplica a ninguna base remota**.

## Comprobación

Desde la raíz del repositorio, `npm run test:api` compila y prueba el contrato HTTP con un proveedor local simulado, sin credenciales ni llamadas externas. La integración real requiere configurar `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en el proceso de Nest, aplicar la migración en un entorno local autorizado e iniciar sesión con una cuenta de prueba. La clave de servicio no debe configurarse para esta ruta.

### Verificación RLS local aislada

Con Docker disponible y la imagen `postgres:17` ya presente localmente, ejecutar desde la raíz:

```powershell
npm --prefix backend run test:rls
```

La prueba crea un contenedor PostgreSQL 17 temporal mediante el socket local explícito (pipe de Docker en Windows o socket Unix en Linux), sin red ni puertos publicados. No descarga imágenes y elimina únicamente el contenedor que creó. Si la imagen no está disponible o el motor local no responde, la prueba falla de forma explícita.

El probe aplica el archivo de migración actual y simula los roles y claims `auth.uid()` necesarios para verificar aislamiento, grants, restricciones de columnas y que las operaciones rechazadas no cambien datos. Es una prueba de PostgreSQL/RLS con autenticación simulada; no reemplaza una prueba de extremo a extremo contra Supabase local o un proveedor real. No requiere ni lee credenciales y nunca se conecta a una base remota. No forma parte del script predeterminado `test:api`.
