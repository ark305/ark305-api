import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const templates = new URL('../emails/auth/', import.meta.url);
const pages = new Map([
  ['/confirmation', ['confirmation.html', 'Confirmación de cuenta']],
  ['/magic-link', ['magic-link.html', 'Enlace de acceso']],
  ['/recovery', ['recovery.html', 'Recuperación de contraseña']],
]);

export function createPreviewServer() {
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'");
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' }); response.end(); return;
    }
    const path = new URL(request.url, 'http://localhost').pathname;
    try {
      if (path === '/logo.png' || path === '/brand/ark-logo-email.png') {
        const logo = await readFile(new URL('../emails/assets/ark-logo-email.png', import.meta.url));
        response.writeHead(200, { 'Content-Type': 'image/png' }); response.end(logo); return;
      }
      let html;
      if (path === '/') {
        html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Correos ARK305 — vista previa</title>
          <body style="margin:0;padding:24px;background:#080c0b;color:#f6f1e7;font-family:Arial,sans-serif"><h1>Correos ARK305</h1>
          <p>Vista previa local. Los botones no autentican usuarios ni envían correos. Las plantillas todavía deben cargarse en Supabase.</p>
          ${[...pages].map(([url, [, label]]) => `<section style="max-width:620px;margin:32px auto"><h2><a style="color:#87c6bc" href="${url}">${label}</a></h2><iframe title="${label}" src="${url}" style="width:100%;height:850px;border:1px solid #34534e;border-radius:20px"></iframe></section>`).join('')}
          </body></html>`;
      } else if (pages.has(path)) {
        html = (await readFile(new URL(pages.get(path)[0], templates), 'utf8'))
          .replaceAll('{{ .ConfirmationURL }}', '#preview-only').replaceAll('{{ .SiteURL }}', '');
      } else {
        response.writeHead(404); response.end('Not found'); return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html);
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Preview asset unavailable');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createPreviewServer().listen(3102, '127.0.0.1', () => {
    console.log('ARK305 email preview: http://127.0.0.1:3102');
  });
}
