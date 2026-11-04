# Borradores comerciales con Meta

El panel solicita `POST /api/v1/ai` con `task: seller-draft`, sesión del usuario y un `serviceId` propio. Nest recupera el perfil y servicio desde ProfilesPort; no acepta nombre, propietario ni precio de servicio enviados por el navegador. No usa perfiles demo.

| Acción | Datos adicionales | Resultado |
|---|---|---|
| `post` | Contexto opcional | Borrador de publicación o propuesta comercial |
| `reply` | `customerMessage` obligatorio | Respuesta basada en el mensaje del cliente |
| `price` | `cost`, `marginPercent` | Explicación y tarjeta numérica calculada por Nest |

Todas las acciones requieren `locale` (`es`/`en`) y `tone` (`business`/`lifestyle`). El contexto y mensaje admiten hasta 2.000 caracteres. Costo: 0,01–1.000.000 USD; margen bruto: 0–95%. La fórmula es `costo / (1 - margen / 100)`, redondeada a centavos. Un costo de 75 USD con margen del 25% produce 100 USD, no 93,75 USD: margen no es recargo.

La respuesta incluye `draft.text`, `provenance` (Meta, modelo, ID de respuesta) y, solo para precio, `pricing` con costo, margen, precio y moneda. Los errores son reales, sin reemplazo por plantillas. La consulta de perfil/servicio precede a la cuota estricta y a Meta. Los servicios inexistentes o ajenos producen el mismo error `seller_service`.

El precio calculado no es una estimación de mercado. Los datos del perfil son declaraciones del usuario, no verificación comercial. Hay que revisar el texto y confirmar alcance, costos, impuestos, disponibilidad y condiciones. Copiar no publica, envía, reserva ni contrata.

Las pruebas automatizadas usan dobles locales; no consumen Meta ni acceden a Supabase real.
