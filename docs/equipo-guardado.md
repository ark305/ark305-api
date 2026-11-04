# Historial privado de Equipo

Nest guarda automáticamente cada resultado válido de `team-plan`. El snapshot conserva nombres, unidades, tarifas de referencia, importes calculados, texto, idioma y procedencia. Leerlo no consulta Meta ni recalcula tarifas.

## Activación

1. Revisar y aplicar `supabase/migrations/20261104041549_team_proposals.sql` al entorno autorizado. Esta implementación no aplica migraciones remotas automáticamente.
2. Configurar `TEAM_PROPOSAL_SIGNING_KEY` en el backend: secreto aleatorio dedicado de al menos 32 caracteres, nunca `NEXT_PUBLIC_*`. Conservarlo en el gestor de secretos y sus respaldos. No reutilizar la clave de Meta.
3. Reiniciar el backend. Sin clave o tabla disponible, `team-plan` falla antes de consumir cuota o llamar a Meta; los otros flujos de IA no dependen de esta configuración.

La firma HMAC protege el documento completo, incluida su identidad y propietario. RLS permite únicamente insertar y leer filas propias; Nest rechaza documentos alterados o no firmados. No se utiliza service-role. La firma acredita emisión por este backend, no una firma criptográfica de Meta. Los datos y precios continúan siendo de demostración.

**No cambiar ni perder la clave sin un plan de migración:** las propuestas existentes dejarían de verificarse. La rotación con múltiples claves queda fuera de esta fase. Guardar una copia segura de la clave junto con la política de respaldo de la base de datos.

## Contrato y errores

- Generación: campos existentes `plan` y `provenance`, más `storage: {saved: true, id}`. Si falla la escritura después de generar, devuelve el resultado con `storage: {saved: false}`; no llama a Meta otra vez. Ese resultado no tiene recuperación garantizada y debe conservarse antes de salir.
- `GET /api/v1/team-proposals`: `{items: [...]}`, últimas 50 propuestas propias.
- `GET /api/v1/team-proposals/:id`: propuesta propia o 404. Requiere JWT y no usa caché.
- Error de configuración, almacenamiento o firma: 503 `proposal_storage`, sin revelar secretos ni detalles internos.
- El historial usa nombres originales aunque un elemento ya no figure en el catálogo. No confirma disponibilidad, contratos ni solicitudes.

## Verificación local

`npm test` verifica contratos y persistencia con dobles locales; `node test/team-proposals-rls.cjs` verifica permisos en PostgreSQL 17 aislado con Docker local. La imagen debe existir: la prueba no descarga imágenes ni accede al Supabase remoto.

Referencia: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). Las políticas y los permisos se verifican por separado; no basta con habilitar RLS.
