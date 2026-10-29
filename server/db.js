import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.HERBARIO_DATA || path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(process.env.HERBARIO_DB || path.join(DATA_DIR, 'herbario.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Tipos: text, int (entero), bool, list (texto separado por comas), url (http(s) o /uploads/).
const f = (name, type = 'text', max = 200) => ({ name, type, max });

export const ENTITIES = {
  specimens: {
    table: 'specimens', key: 'catalogNumber', order: 'CAST(catalogNumber AS INTEGER)',
    fields: [
      f('catalogNumber', 'text', 20), f('collectionNumber', 'text', 40), f('identification'), f('scientificName'),
      f('authorship'), f('rank', 'text', 40), f('family', 'text', 100), f('genus', 'text', 100), f('habitat', 'text', 400),
      f('habit', 'text', 100), f('reproductiveCondition', 'text', 100), f('country', 'text', 100), f('department', 'text', 100),
      f('municipality', 'text', 100), f('locality', 'text', 400), f('collectedAt', 'text', 40), f('collectors', 'text', 300),
      f('identifiedBy', 'text', 300), f('originalLatitude', 'text', 40), f('originalLongitude', 'text', 40),
      f('minAltitude', 'text', 20), f('maxAltitude', 'text', 20), f('commonName'), f('isType', 'bool'), f('image', 'url', 500),
    ],
  },
  publications: {
    table: 'publications', key: 'id', order: 'id DESC',
    fields: [f('name', 'text', 200), f('url', 'url', 500), f('description', 'text', 1000), f('image', 'url', 500)],
  },
  library: {
    table: 'library_items', key: 'id', order: 'title COLLATE NOCASE',
    fields: [
      f('title', 'text', 300), f('author', 'text', 200), f('publisher', 'text', 200), f('year', 'text', 10), f('edition', 'text', 100),
      f('format', 'text', 60), f('location', 'text', 100), f('status', 'text', 60), f('language', 'text', 60),
      f('contributors', 'list', 500), f('subjects', 'list', 500), f('available', 'text', 200),
    ],
  },
  members: {
    table: 'members', key: 'id', order: 'position, id',
    fields: [f('role', 'text', 100), f('name', 'text', 150), f('functionText', 'text', 600), f('photo', 'url', 500), f('position', 'int')],
  },
};

export const SETTING_KEYS = ['aboutIntro', 'mission', 'founderText', 'founderPhoto', 'history', 'terms', 'phone', 'address', 'instagram'];

const columns = (e) => e.fields.map((x) => `"${x.name}" ${x.type === 'int' || x.type === 'bool' ? 'INTEGER' : 'TEXT'}`);

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
`);

// Migración: bases creadas antes de existir ciertas columnas.
for (const e of Object.values(ENTITIES)) {
  const have = new Set(db.prepare(`PRAGMA table_info(${e.table})`).all().map((c) => c.name));
  for (const fld of e.fields) {
    if (!have.has(fld.name)) db.exec(`ALTER TABLE ${e.table} ADD COLUMN "${fld.name}" ${fld.type === 'int' || fld.type === 'bool' ? 'INTEGER' : 'TEXT'}`);
  }
}

const DEFAULT_MEMBERS = [
  ['Director(a)', 'Nombre pendiente', 'dirige el herbario, autoriza los servicios y representa a la colección ante la universidad.'],
  ['Curador(a)', 'Nombre pendiente', 'cuida la colección, verifica la identificación taxonómica y revisa los registros de los ejemplares.'],
  ['Auxiliar de colección', 'Nombre pendiente', 'prepara, seca, etiqueta y organiza el material botánico, y registra los datos de colecta.'],
  ['Investigadores y estudiantes', 'Nombres pendientes', 'realizan colectas y proyectos de investigación, y apoyan las actividades del herbario.'],
];

const seed = () => {
  const seedFile = path.join(ROOT, 'server', 'seed', 'specimens.seed.js');
  if (!db.prepare('SELECT 1 FROM specimens LIMIT 1').get() && fs.existsSync(seedFile)) {
    const ctx = vm.createContext({});
    const list = vm.runInContext(`${fs.readFileSync(seedFile, 'utf8')}\nherbariumSpecimens`, ctx);
    for (const s of list) insert('specimens', s);
  }
  if (!db.prepare('SELECT 1 FROM members LIMIT 1').get()) {
    DEFAULT_MEMBERS.forEach(([role, name, functionText], i) => insert('members', { role, name, functionText, position: i + 1 }));
  }
};

// Normaliza y valida un registro; devuelve { value } o { error }.
export const clean = (entityName, input, { partial = false } = {}) => {
  const e = ENTITIES[entityName];
  const out = {};
  for (const fld of e.fields) {
    if (!(fld.name in input)) { if (!partial) out[fld.name] = fld.type === 'int' || fld.type === 'bool' ? 0 : ''; continue; }
    let v = input[fld.name];
    if (fld.type === 'bool') { out[fld.name] = v === true || v === 1 || v === '1' || /^(s[ií]|true|x)$/i.test(String(v)) ? 1 : 0; continue; }
    if (fld.type === 'int') {
      const n = Number.parseInt(v, 10);
      out[fld.name] = Number.isFinite(n) ? n : 0; continue;
    }
    if (Array.isArray(v)) v = v.join(', ');
    v = String(v ?? '').replace(/\u0000/g, '').trim();
    if (v.length > fld.max) return { error: `El campo "${fld.name}" supera ${fld.max} caracteres.` };
    if (fld.type === 'url' && v && !/^(https?:\/\/[^\s]+|\/uploads\/[A-Za-z0-9._-]+)$/i.test(v)) {
      return { error: `El campo "${fld.name}" debe ser un enlace http(s) o una imagen subida.` };
    }
    out[fld.name] = v;
  }
  return { value: out };
};

const names = (e) => e.fields.map((x) => x.name);

export function insert(entityName, record) {
  const e = ENTITIES[entityName];
  const { value, error } = clean(entityName, record);
  if (error) throw new Error(error);
  if (entityName === 'specimens' && !value.catalogNumber) throw new Error('El número de catálogo es obligatorio.');
  if (entityName === 'publications' && !value.name) throw new Error('El nombre es obligatorio.');
  if (entityName === 'library' && !value.title) throw new Error('El título es obligatorio.');
  if (entityName === 'members' && !value.role) throw new Error('El cargo es obligatorio.');
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
  if (entityName === 'publications' && !value.name) throw new Error('El nombre es obligatorio.');
  if (entityName === 'library' && !value.title) throw new Error('El título es obligatorio.');
  if (entityName === 'members' && !value.role) throw new Error('El cargo es obligatorio.');
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
    const max = k === 'history' || k === 'terms' || k === 'mission' || k === 'founderText' || k === 'aboutIntro' ? 5000 : 500;
    if (v.length > max) throw new Error(`El texto "${k}" es demasiado largo.`);
    if (k === 'founderPhoto' && v && !/^(https?:\/\/[^\s]+|\/uploads\/[A-Za-z0-9._-]+)$/i.test(v)) throw new Error('La foto debe ser un enlace http(s) o una imagen subida.');
    stmt.run(k, v);
  }
};

// Datos públicos en el formato que espera app.js.
export const publicData = () => {
  const specimens = list('specimens').map((s) => ({ ...s, isType: Boolean(s.isType) }));
  const libraryItems = list('library').map(({ id, contributors, subjects, ...r }) => ({
    ...r,
    contributors: contributors ? contributors.split(',').map((x) => x.trim()).filter(Boolean) : [],
    subjects: subjects ? subjects.split(',').map((x) => x.trim()).filter(Boolean) : [],
  }));
  const publications = list('publications').map(({ id, ...r }) => r);
  const siteMembers = list('members').map(({ id, position, ...r }) => r);
  return { specimens, libraryItems, publications, siteMembers, siteSettings: getSettings() };
};

seed();
