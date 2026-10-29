// Genera una copia estática de la parte pública (sin administración) en docs/,
// lista para publicarse en GitHub Pages. Uso: npm run publicar
import fs from 'node:fs';
import path from 'node:path';
import { db, ROOT, UPLOAD_DIR, publicData } from '../server/db.js';

const BASE = (process.env.SITE_BASE ?? '/herbario').replace(/\/+$/, '');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'docs');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(PUBLIC, 'assets'), path.join(OUT, 'assets'), { recursive: true });
if (fs.existsSync(UPLOAD_DIR)) fs.cpSync(UPLOAD_DIR, path.join(OUT, 'uploads'), { recursive: true });

const d = publicData();
const js = `'use strict';\nwindow.SITE_BASE = ${JSON.stringify(BASE)};\nconst herbariumSpecimens = ${JSON.stringify(d.specimens)};\nconst libraryItems = ${JSON.stringify(d.libraryItems)};\nconst publications = ${JSON.stringify(d.publications)};\nconst siteMembers = ${JSON.stringify(d.siteMembers)};\nconst siteSettings = ${JSON.stringify(d.siteSettings)};\n`
  .replace(/</g, '\\u003c')
  .replaceAll('"/uploads/', `"${BASE}/uploads/`);
fs.writeFileSync(path.join(OUT, 'assets', 'js', 'data.js'), js);

const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8').replaceAll('"/assets/', `"${BASE}/assets/`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
// GitHub Pages sirve 404.html en rutas desconocidas (/contacto/, /ejemplar/…), así las URLs limpias funcionan.
fs.writeFileSync(path.join(OUT, '404.html'), html);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

db.close();
console.log(`Sitio estático generado en docs/ (base "${BASE}"): ${d.specimens.length} especímenes.`);
