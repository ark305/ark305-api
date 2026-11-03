# Persistencia de solicitudes de servicios

La migración `migrations/20261031031940_service_requests.sql` prepara solicitudes de interés, no reservas. Esta entrega es independiente de las rutas Nest que la consumirán en la siguiente entrega.

## Garantías

- El propietario se obtiene de `auth.uid()` y solo puede consultar sus filas mediante RLS.
- El usuario solo puede insertar servicio, fecha, invitados y preferencias. No puede elegir propietario, identificador, estado ni fecha de creación.
- El estado es siempre `received`; no representa disponibilidad, precio ni confirmación de proveedor.
- No se permiten consultas anónimas, actualizaciones ni eliminaciones desde el rol autenticado.

## Prueba local

Con Docker local y la imagen `postgres:17` previamente disponible, ejecutar desde la raíz:

```powershell
node backend/test/requests-rls.cjs
```

El comando crea un contenedor aislado sin red ni puertos publicados, aplica este archivo SQL y comprueba aislamiento entre dos usuarios, permisos, restricciones y conservación de datos tras operaciones rechazadas. Elimina únicamente su propio contenedor. No descarga imágenes ni usa credenciales existentes.

Se simulan los roles y claims de Supabase sobre PostgreSQL real: no equivale a una prueba de extremo a extremo con Supabase. La migración no se aplica a bases remotas durante esta prueba.

## Límites de la entrega

La base restringe longitud del identificador del servicio; la validación contra el catálogo demo corresponde a las rutas Nest. No existen proveedores conectados, cobros ni transiciones de estado.

Esta entrega contiene esquema, prueba y documentación. La siguiente incorpora la API y sus pruebas HTTP. No se debe eliminar la tabla para revertir una instalación que ya contenga datos sin una decisión explícita sobre su conservación.
