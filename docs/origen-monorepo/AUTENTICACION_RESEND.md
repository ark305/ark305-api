# Autenticación de ARK305 con correo de marca

ARK305 conserva Supabase Auth como autoridad de usuarios, sesiones y contraseñas. La aplicación usa plantillas de autenticación con marca ARK y el correo se enviará mediante el SMTP personalizado de Resend, cuando se configure externamente.

## Flujo para usuarios

1. La persona solicita una cuenta con su correo. Supabase Auth envía un enlace de un solo uso y crea la cuenta de forma autoservicio si aún no existe.
2. El enlace abre el callback de ARK305, que intercambia el código PKCE y crea una sesión autenticada antes de que se establezca la contraseña.
3. La pantalla de ARK305 verifica esa sesión y permite elegir y confirmar una contraseña de 12 a 128 caracteres.
4. La aplicación actualiza la contraseña en Supabase Auth y cierra la sesión local; la siguiente visita usa el acceso con correo y contraseña.
5. Si se olvida la contraseña, se solicita un enlace de recuperación y se elige la nueva contraseña en la misma pantalla protegida por sesión.

El formulario de recuperación siempre muestra el mismo resultado, aunque no se envíe correo para una dirección sin cuenta. Esto evita revelar si una dirección está registrada. La configuración del enlace, la URL de retorno y el correo deben probarse en un proyecto de desarrollo antes de habilitar el envío real.

La solicitud de cuenta usa el enlace de acceso de Supabase con `shouldCreateUser: true`; por eso también permite que una cuenta existente verifique su correo y establezca o actualice su contraseña. El formulario normal de acceso usa contraseña. No se añadió una política de servidor que obligue a todas las sesiones a haber pasado por este paso ni se deshabilitaron otros métodos que Auth pueda aceptar directamente. El enlace crea una sesión autenticada antes de que la persona establezca la contraseña.

La página de creación de contraseña recibe el ID de la sesión verificada por el servidor. Antes del cambio, la interfaz confirma que la sesión activa corresponde a ese ID y usa una instancia Supabase aislada, en memoria, con el token exacto que verificó; así un cambio de cuenta entre la validación y la petición no mueve la actualización a otra identidad. Esta instancia no persiste la sesión, utiliza una clave de canal única y se descarta sin enviar un cierre de sesión remoto, por lo que no puede emitir un evento de cierre sobre la sesión principal del navegador. Los eventos de cierre de sesión o cambio de cuenta borran los campos e invalidan la operación pendiente. Si la petición ya se envió, solo puede actualizar la identidad del token fijado, y su respuesta no redirige ni cierra la sesión nueva. La acción de cierre de sesión vuelve a verificar el mismo ID en el servidor y no cierra la sesión de otra cuenta.

## Plantillas

Los archivos de `supabase/templates/` son HTML fuente; no se aplican automáticamente a un proyecto alojado. En Supabase, copia cada contenido al tipo de plantilla correspondiente en **Authentication → Emails**:

| Archivo | Plantilla de Supabase | Asunto sugerido | Uso |
|---|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirma tu correo de ARK305 | Confirmación de dirección cuando se usa el flujo de signup correspondiente. |
| `magic-link.html` | Magic link | Crea tu contraseña de ARK305 | Enlace de solicitud de cuenta enviado por `signInWithOtp`. |
| `recovery.html` | Reset password | Recupera tu contraseña de ARK305 | Recuperación iniciada por `resetPasswordForEmail`. |

Las plantillas conservan `{{ .ConfirmationURL }}` de Supabase. No sustituyas ese valor por una URL inventada ni incluyas credenciales en el HTML. La expiración efectiva depende del ajuste de Auth del proyecto y debe ser comprobada allí; el contenido no promete una duración fija. Desactiva el seguimiento/rewrite de enlaces del proveedor para que no altere los enlaces de autenticación.

## Configuración externa pendiente

Esta implementación no configuró Resend, Supabase, DNS ni remitente y no envió mensajes. Para activar el correo de marca, una persona autorizada debe:

1. Tener acceso a la cuenta de Resend y elegir un dominio de envío que ARK controle.
2. Agregar los registros DNS que Resend muestre para verificar ese dominio; verificar el estado de envío antes de usarlo.
3. Obtener las credenciales SMTP de Resend y configurar en **Supabase → Authentication → SMTP Settings** el host, puerto, usuario, contraseña y un remitente aprobado para el dominio.
4. Configurar la URL del sitio y permitir las rutas de retorno exactas del entorno en **Supabase → Authentication → URL Configuration**: `/auth/callback` del entorno local y del dominio de producción.
5. Configurar la política de contraseña mínima del servidor Auth de acuerdo con la regla de 12 caracteres que valida la interfaz. La validación del navegador no sustituye la política del proveedor.
6. Probar signup, enlace de creación, recovery, expiración y uso único en un proyecto de desarrollo con correo controlado antes del entorno real.

No se guardan secretos SMTP en la aplicación web ni se usa una API key de Resend desde el navegador. Las solicitudes de autenticación se entregan a Supabase Auth; Supabase usa el transporte SMTP configurado.

## Fuentes oficiales

- [Configurar SMTP personalizado en Supabase Auth](https://supabase.com/docs/guides/auth/auth-smtp)
- [Configurar URL de retorno de Supabase Auth](https://supabase.com/docs/guides/auth/redirect-urls)
- [Plantillas de correo de Supabase Auth](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Autenticación basada en contraseña y recuperación](https://supabase.com/docs/guides/auth/passwords)
- [Configuración SMTP de Resend](https://resend.com/changelog/smtp-service)
- [Verificación de dominio en Resend](https://resend.com/changelog/domain-verification-events)
