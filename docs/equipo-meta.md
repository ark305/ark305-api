# Propuestas de Equipo con Meta

`POST /api/v1/ai` acepta `{ "task": "team-plan", "locale": "es", "prompt": "Necesito apoyo mensual en redes y una limpieza puntual" }` con la misma autenticación y cuota estricta de las tareas estructuradas existentes.

Meta selecciona servicios y redacta la justificación. Nest valida IDs, duplicados, horas, periodicidad y procedencia; calcula todos los importes desde el catálogo de demostración. No acepta precios inventados por el modelo. Un fallo devuelve un error, nunca una propuesta alternativa simulada.

| Concepto | Cálculo |
|---|---|
| Mensual por horas | Tarifa × horas semanales × 4,33, redondeado a dólares |
| Puntual por horas | Tarifa × horas del trabajo |
| Mensual fijo | Una tarifa mensual |
| Puntual fijo / por proyecto o persona | Una unidad; no implica un paquete para varias personas |
| Por cotizar | Importe `null`; excluido de ambos totales |

La respuesta contiene `plan` (`items`, `rationale`, `understood`, `demo`, `monthlyTotal`, `oneOffTotal`, `quoteCount`) y `provenance` (`provider`, `model`, `responseId`). Cada ítem incluye `id`, `hours`, `cadence` y `amount`.

El catálogo `src/modules/ai/team-catalog.ts` es una copia de los datos de demostración de `ark305/src/lib/talent.ts`, sin dependencia de ejecución entre repositorios. Una actualización de tarifas requiere actualizar ambos catálogos; el cliente rechaza importes incompatibles.

La propuesta no confirma personal, disponibilidad, contratación ni contratos. La vista no asigna automáticamente candidatos ficticios ni presenta un contrato generado. El catálogo de talento y sus selecciones anteriores permanecen intactos.

## Verificación

Ejecutar `npm test` en Nest y en Next. Las pruebas usan servidores locales controlados, no llaman a Meta ni consumen cuotas reales. La validación manual con el proveedor queda separada y debe limitarse a una solicitud representativa.
