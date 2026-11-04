# Correos de autenticación de ARK305

Tres plantillas listas para cargar en **Supabase Auth**. Resend transporta los mensajes por SMTP; estas plantillas no se instalan en el catálogo de Resend ni necesitan su clave Full access.

## Revisar localmente

Desde la raíz de `ark305-api`:

```sh
node scripts/preview-auth-emails.mjs
```

Abrir `http://127.0.0.1:3102`. La vista previa utiliza enlaces ficticios: no inicia sesiones, modifica contraseñas ni envía correos. Para probar el flujo real, abrir la web en `http://localhost:3100` con el backend en el puerto `3001`.

## Instalar en Supabase

| Plantilla de Supabase | Archivo HTML | Asunto |
| --- | --- | --- |
| Confirm sign up | `auth/confirmation.html` | Confirm your ARK305 account |
| Magic link | `auth/magic-link.html` | Your ARK305 sign-in link |
| Reset password | `auth/recovery.html` | Reset your ARK305 password |

1. Configurar y guardar el SMTP de Resend en Supabase. El remitente acordado es `ARK305 <no-reply@updates.ark305.com>`; utilizar la clave Sending access como contraseña SMTP.
2. En Authentication → Email → Templates, copiar el contenido completo de cada HTML y su asunto. Los asuntos también están en `auth/subjects.json`.
3. Conservar literalmente `{{ .ConfirmationURL }}`: Supabase genera el enlace y mantiene el destino solicitado por la aplicación. No sustituirlo por una URL fija de Vercel o localhost.
4. En URL Configuration, mantener la URL pública de la web como Site URL y permitir el callback local `http://localhost:3100/auth/callback**`, además del callback de producción correspondiente. Abrir el correo en el mismo navegador que solicitó el enlace para conservar el contexto PKCE.
5. Publicar el logo PNG del frontend y comprobar que `SITE_URL/brand/ark-logo-email.png` responde públicamente antes de activar las plantillas. No usar la URL del backend como Site URL.
6. Realizar una solicitud de registro y otra de recuperación, separadas según los límites vigentes; revisar entrega en Resend y que cada enlace complete su flujo. No reutilizar enlaces ya consumidos.

El registro utiliza `signInWithOtp`: una cuenta nueva puede recibir Confirm sign up y una existente Magic link. Por eso deben personalizarse ambas. La recuperación utiliza Reset password. El idioma inicial de estas plantillas es inglés; no cambia automáticamente con el idioma de la interfaz.

## Logo y seguridad

- Original entregado por el usuario: `logoark.svg`, conservado sin modificaciones.
- PNG renderizado sin rediseñar el logo: `emails/assets/ark-logo-email.png`. Se utiliza PNG en el correo para no depender del soporte de SVG del cliente.
- Copia pública para el siguiente despliegue del frontend: `ark305/public/brand/ark-logo-email.png`, desde la carpeta padre de los repositorios.
- La vista previa usa su copia local; no depende del repositorio frontend.
- El enlace es personal y de un solo uso. No se incluye una duración fija, pues depende de la configuración de Supabase.
- No habilitar seguimiento de clics en Resend para estos enlaces de autenticación.
- No colocar claves de Resend en las plantillas, en el frontend ni en Git.

Crear estos archivos no modifica el SMTP ni las plantillas del proyecto remoto. La entrega real queda pendiente hasta completar esa configuración.

## Verificación

```sh
node --test test/auth-email-templates.test.mjs
```

La prueba valida placeholders, ausencia de código activo, rutas permitidas de la vista previa y enlaces ficticios. La compatibilidad visual y entrega en Gmail, Outlook y otros clientes debe comprobarse con envíos reales después de la instalación.

Referencias: [plantillas Supabase](https://supabase.com/docs/guides/auth/auth-email-templates), [SMTP de Resend con Supabase](https://resend.com/docs/send-with-supabase-smtp).
