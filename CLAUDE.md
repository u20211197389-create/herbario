# Herbario SURCO

Sitio web del Herbario SURCO (Universidad Surcolombiana, Neiva-Huila) con panel de administración. Todo el contenido y las respuestas deben estar en español.

## Despliegues
- **Cloudflare Workers + D1** (sitio completo + admin `/admin/`): https://herbario-surco.herbariosurco.workers.dev
- **GitHub Pages** (copia pública estática en `docs/`): https://u20211197389-create.github.io/herbario/
- **Local**: servidor Node con SQLite (`npm run dev`, puerto 5173).

## Estructura
- `public/`: sitio público (`index.html`, `assets/js/app.js`, `assets/css/styles.css`) y panel (`public/admin/`).
- `server/`: servidor local (`index.js`, `db.js`, `entities.js`, `security.js`).
- `worker/`: API para Cloudflare (`index.js`, `mailer.js`, `schema.sql`).
- `scripts/`: `build-static.js` (genera `docs/`), `sync-from-online.mjs` (en línea → local).
- `documentacion/`: documentación del proyecto.

## Comandos
- `npm run dev`: servidor local.
- `npm run publicar`: regenera `docs/`.
- `npm run sync`: copia datos e imágenes de Cloudflare a la base local (cerrar el servidor local antes).
- `npx wrangler deploy`: publica el Worker.

## Documentación
La versión anterior del PDF está en `C:\Users\Juan\Documents\Documentacion Herbario SURCO.pdf`; su Markdown se recupera con `git show 2b4eac9^:documentacion/DOCUMENTACION.md`.

## Reglas de seguridad
- NO leer ni mostrar `.dev.vars`, `data/` (base de datos, usuarios), secretos de Cloudflare ni contraseñas.
- No incluir credenciales en la documentación.
