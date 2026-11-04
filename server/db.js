import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { ENTITIES, SETTING_KEYS, DEFAULT_MEMBERS, columns, clean, requiredError } from './entities.js';
export { ENTITIES, SETTING_KEYS, clean };

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.HERBARIO_DATA || path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(process.env.HERBARIO_DB || path.join(DATA_DIR, 'herbario.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
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
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decidedAt TEXT);
`);
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'displayName')) {
  db.exec("ALTER TABLE users ADD COLUMN displayName TEXT NOT NULL DEFAULT ''; ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''; ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT '';");
}
if (!db.prepare('PRAGMA table_info(image_requests)').all().some((c) => c.name === 'kind')) {
  db.exec("ALTER TABLE image_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'imagen'");
}

// Migración: bases creadas antes de existir ciertas columnas.
for (const e of Object.values(ENTITIES)) {
  const have = new Set(db.prepare(`PRAGMA table_info(${e.table})`).all().map((c) => c.name));
  for (const fld of e.fields) {
    if (!have.has(fld.name)) db.exec(`ALTER TABLE ${e.table} ADD COLUMN "${fld.name}" ${fld.type === 'int' || fld.type === 'bool' ? 'INTEGER' : 'TEXT'}`);
  }
}

const seed = () => {
  const seedFile = path.join(ROOT, 'server', 'seed', 'specimens.seed.js');
  if (!db.prepare('SELECT 1 FROM specimens LIMIT 1').get() && fs.existsSync(seedFile)) {
    const ctx = vm.createContext({});
    const list = vm.runInContext(`${fs.readFileSync(seedFile, 'utf8')}\nherbariumSpecimens`, ctx);
    for (const s of list) insert('specimens', s);
  }
  if (!db.prepare('SELECT 1 FROM library_items LIMIT 1').get()) {
    const libFile = path.join(ROOT, 'server', 'seed', 'library.seed.json');
    if (fs.existsSync(libFile)) for (const item of JSON.parse(fs.readFileSync(libFile, 'utf8'))) insert('library', item);
  }
  if (!db.prepare('SELECT 1 FROM members LIMIT 1').get()) {
    DEFAULT_MEMBERS.forEach(([role, name, functionText], i) => insert('members', { role, name, functionText, position: i + 1 }));
  }
};

const names = (e) => e.fields.map((x) => x.name);

export function insert(entityName, record) {
  const e = ENTITIES[entityName];
  const { value, error } = clean(entityName, record);
  if (error) throw new Error(error);
  const missing = requiredError(entityName, value);
  if (missing) throw new Error(missing);
  const cols = names(e);
  const info = db.prepare(`INSERT INTO ${e.table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map((c) => value[c]));
  return entityName === 'specimens' ? value.catalogNumber : Number(info.lastInsertRowid);
}

export function update(entityName, id, record) {
  const e = ENTITIES[entityName];
  const { value, error } = clean(entityName, record);
  if (error) throw new Error(error);
  const cols = names(e).filter((c) => c !== e.key);
  const missing = requiredError(entityName, value);
  if (missing) throw new Error(missing);
  return db.prepare(`UPDATE ${e.table} SET ${cols.map((c) => `"${c}"=?`).join(',')} WHERE "${e.key}"=?`)
    .run(...cols.map((c) => value[c]), id).changes;
}

export const remove = (entityName, id) => {
  const e = ENTITIES[entityName];
  return db.prepare(`DELETE FROM ${e.table} WHERE "${e.key}"=?`).run(id).changes;
};

export const list = (entityName) => {
  const e = ENTITIES[entityName];
  const rows = db.prepare(`SELECT ${e.key === 'id' ? 'id,' : ''}${names(e).map((c) => `"${c}"`).join(',')} FROM ${e.table} ORDER BY ${e.order}`).all();
  return rows.map((r) => ({ ...r }));
};

export const getSettings = () => {
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, '']));
  for (const r of db.prepare('SELECT key, value FROM settings').all()) if (r.key in out) out[r.key] = r.value;
  return out;
};

export const saveSettings = (input) => {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const k of SETTING_KEYS) {
    if (!(k in input)) continue;
    const v = String(input[k] ?? '').trim();
    const max = k === 'tourText' ? 20000 : k === 'tourImages' ? 5000 : k === 'history' || k === 'terms' || k === 'mission' || k === 'founderText' || k === 'aboutIntro' ? 5000 : 500;
    if (v.length > max) throw new Error(`El texto "${k}" es demasiado largo.`);
    if (k === 'founderPhoto' && v && !/^(https?:\/\/[^\s]+|\/uploads\/[A-Za-z0-9._-]+)$/i.test(v)) throw new Error('La foto debe ser un enlace http(s) o una imagen subida.');
    if (k === 'tourImages' && v && v.split(/\r?\n/).some((l) => !/^(https?:\/\/[^\s]+|\/uploads\/[A-Za-z0-9._-]+|\/assets\/img\/tour\/[A-Za-z0-9._-]+)$/i.test(l.trim()))) throw new Error('Cada imagen debe ser un enlace http(s) o una imagen subida.');
    stmt.run(k, v);
  }
};

// Datos públicos en el formato que espera app.js.
export const publicData = () => {
  const specimens = list('specimens').map(({ image, ...s }) => ({ ...s, hasImage: Boolean(image), isType: Boolean(s.isType) }));
  const libraryItems =   list('library').map(({ contributors, subjects, ...r }) => ({
    ...r,
    contributors: contributors ? contributors.split(',').map((x) => x.trim()).filter(Boolean) : [],
    subjects: subjects ? subjects.split(',').map((x) => x.trim()).filter(Boolean) : [],
  }));
  const publications = list('publications');
  const siteMembers = list('members').map(({ id, position, ...r }) => r);
  return { specimens, libraryItems, publications, siteMembers, siteSettings: getSettings() };
};

seed();
