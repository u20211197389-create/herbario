// Copia el contenido del sitio en línea (Cloudflare D1) a la base local para que ambos queden iguales.
// Uso: npm run sync   (cierre antes el servidor local si está encendido)
// No copia usuarios ni contraseñas: cada instalación conserva sus propias cuentas.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { db, UPLOAD_DIR } from '../server/db.js';

const remote = (sql) => {
  const cmd = `npx wrangler d1 execute herbario --remote --json --command "${sql.replaceAll('"', '\\"')}"`;
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`No se pudo consultar el sitio en línea:\n${r.stderr || r.stdout}`);
  const out = r.stdout.slice(r.stdout.indexOf('['));
  return JSON.parse(out)[0].results;
};

const TABLES = ['specimens', 'publications', 'library_items', 'members', 'settings', 'image_requests'];
const incoming = {};
for (const t of TABLES) {
  incoming[t] = remote(`SELECT * FROM ${t}`);
  console.log(`${t}: ${incoming[t].length} registros`);
}

db.exec('BEGIN');
try {
  for (const t of TABLES) {
    const local = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    db.exec(`DELETE FROM ${t}`);
    for (const row of incoming[t]) {
      const cols = local.filter((c) => c in row);
      db.prepare(`INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => row[c]));
    }
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

// Imágenes subidas: en línea se guardan en D1 (base64 por partes); aquí son archivos.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const uploads = remote('SELECT name FROM uploads').map((u) => u.name).filter((n) => /^[A-Za-z0-9._-]+$/.test(n));
let downloaded = 0;
for (const name of uploads) {
  const file = path.join(UPLOAD_DIR, name);
  if (fs.existsSync(file)) continue;
  const chunks = remote(`SELECT data FROM upload_chunks WHERE name = '${name}' ORDER BY idx`);
  fs.writeFileSync(file, Buffer.from(chunks.map((c) => c.data).join(''), 'base64'));
  downloaded += 1;
}
console.log(`Imágenes: ${uploads.length} en línea, ${downloaded} descargadas.`);
console.log('Listo: la base local quedó igual que la de en línea.');
