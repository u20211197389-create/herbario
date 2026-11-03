// Genera worker/schema.sql y worker/seed.sql (para Cloudflare D1) a partir de la base local data/herbario.db.
// Uso: npm run d1:export
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { ENTITIES, columns } from '../server/entities.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'worker');
const db = new DatabaseSync(path.join(process.env.HERBARIO_DATA || path.join(ROOT, 'data'), 'herbario.db'));

const schema = `-- Generado por scripts/export-d1.mjs
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  passwordHash TEXT NOT NULL, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (
  tokenHash TEXT PRIMARY KEY, userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expiresAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS specimens (${columns(ENTITIES.specimens).join(', ').replace('"catalogNumber" TEXT', '"catalogNumber" TEXT PRIMARY KEY')});
CREATE TABLE IF NOT EXISTS publications (id INTEGER PRIMARY KEY AUTOINCREMENT, ${columns(ENTITIES.publications).join(', ')});
CREATE TABLE IF NOT EXISTS library_items (id INTEGER PRIMARY KEY AUTOINCREMENT, ${columns(ENTITIES.library).join(', ')});
CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, ${columns(ENTITIES.members).join(', ')});
CREATE TABLE IF NOT EXISTS image_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, catalogNumber TEXT NOT NULL, email TEXT NOT NULL, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente', token TEXT, expiresAt INTEGER,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decidedAt TEXT, kind TEXT NOT NULL DEFAULT 'imagen');
CREATE TABLE IF NOT EXISTS uploads (name TEXT PRIMARY KEY, type TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS upload_chunks (name TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (name, idx));
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resetAt INTEGER NOT NULL);
`;
fs.writeFileSync(path.join(OUT, 'schema.sql'), schema);

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const lines = ['-- Generado por scripts/export-d1.mjs'];
const images = new Set();
for (const e of Object.values(ENTITIES)) {
  const cols = e.fields.map((f) => f.name);
  const withId = e.key === 'id';
  const rows = db.prepare(`SELECT ${withId ? 'id,' : ''}${cols.map((c) => `"${c}"`).join(',')} FROM ${e.table} ORDER BY ${e.order}`).all();
  for (const r of rows) {
    const names = withId ? ['id', ...cols] : cols;
    lines.push(`INSERT INTO ${e.table} (${names.map((c) => `"${c}"`).join(',')}) VALUES (${names.map((c) => q(r[c])).join(',')});`);
    for (const f of e.fields) if (f.type === 'url' && /^\/uploads\//.test(r[f.name] || '')) images.add(r[f.name].slice('/uploads/'.length));
  }
}
for (const s of db.prepare('SELECT key, value FROM settings').all()) lines.push(`INSERT INTO settings (key, value) VALUES (${q(s.key)}, ${q(s.value)});`);

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const CHUNK = 60_000; // base64 por sentencia SQL (D1 limita cada sentencia a 100 KB)
for (const name of images) {
  const file = path.join(process.env.HERBARIO_DATA || path.join(ROOT, 'data'), 'uploads', name);
  if (!fs.existsSync(file)) continue;
  const b64 = fs.readFileSync(file).toString('base64');
  lines.push(`INSERT INTO uploads (name, type) VALUES (${q(name)}, ${q(MIME[path.extname(name)] || 'application/octet-stream')});`);
  const BIG = 300_000;
  for (let i = 0, idx = 0; i < b64.length; i += BIG, idx += 1) {
    const part = b64.slice(i, i + BIG);
    lines.push(`INSERT INTO upload_chunks (name, idx, data) VALUES (${q(name)}, ${idx}, ${q(part.slice(0, CHUNK))});`);
    for (let j = CHUNK; j < part.length; j += CHUNK) lines.push(`UPDATE upload_chunks SET data = data || ${q(part.slice(j, j + CHUNK))} WHERE name = ${q(name)} AND idx = ${idx};`);
  }
}
fs.writeFileSync(path.join(OUT, 'seed.sql'), `${lines.join('\n')}\n`);
console.log(`schema.sql y seed.sql generados (${lines.length - 1} sentencias, ${images.size} imágenes).`);
