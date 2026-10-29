import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, ROOT, UPLOAD_DIR, ENTITIES, insert, update, remove, list, clean, getSettings, saveSettings, publicData } from './db.js';
import { hashPassword, verifyPassword, newToken, hashToken, passwordProblem } from './security.js';

const PUBLIC_DIR = path.join(ROOT, 'public');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 5173);
const SECURE = process.env.HERBARIO_SECURE === '1';
const SESSION_MS = 8 * 60 * 60 * 1000;
// Rutas limpias del sitio público; todas entregan index.html y el navegador elige la vista.
const PAGE_ROUTES = /^(especimenes|busqueda-avanzada|acerca|cifras|servicios|biblioteca|publicaciones|contacto|ejemplar\/[\w.-]{1,20})$/;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; frame-src https://maps.google.com https://www.google.com; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
};
const json = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const readBody = (req, limit) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) { reject(new HttpError(413, 'El contenido es demasiado grande.')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const readJson = async (req, limit = 5 * 1024 * 1024) => {
  const raw = await readBody(req, limit);
  try { const v = JSON.parse(raw.toString('utf8') || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch { throw new HttpError(400, 'JSON no vÃ¡lido.'); }
};

const parseCookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));

const currentUser = (req) => {
  const token = parseCookies(req).sid;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db.prepare('SELECT u.id, u.username, s.expiresAt FROM sessions s JOIN users u ON u.id = s.userId WHERE s.tokenHash = ?').get(hashToken(token));
  if (!row) return null;
  if (row.expiresAt < Date.now()) { db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(hashToken(token)); return null; }
  return { id: row.id, username: row.username };
};

const cookie = (value, maxAge) => `sid=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${SECURE ? '; Secure' : ''}`;

const attempts = new Map();
const lockedFor = (ip) => {
  const a = attempts.get(ip);
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 60000) : 0;
};
const failLogin = (ip) => {
  const a = attempts.get(ip) || { fails: 0, until: 0 };
  a.fails += 1;
  if (a.fails >= 5) { a.until = Date.now() + 15 * 60 * 1000; a.fails = 0; }
  attempts.set(ip, a);
};

const imageType = (buf) => {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
};

const parseId = (entity, raw) => {
  const id = decodeURIComponent(raw);
  if (entity === 'specimens') return /^[\w.-]{1,20}$/.test(id) ? id : null;
  return /^\d+$/.test(id) ? Number(id) : null;
};

const handleApi = async (req, res, url) => {
  const method = req.method;
  const route = url.pathname;
  const ip = req.socket.remoteAddress || 'x';

  if (method !== 'GET' && method !== 'HEAD' && !req.headers['x-requested-with']) throw new HttpError(403, 'Solicitud no permitida.');

  if (route === '/api/login' && method === 'POST') {
    const wait = lockedFor(ip);
    if (wait) throw new HttpError(429, `Demasiados intentos. Intente de nuevo en ${wait} minuto(s).`);
    const { username, password } = await readJson(req, 10_000);
    const row = db.prepare('SELECT id, passwordHash FROM users WHERE username = ?').get(String(username || '').slice(0, 100));
    const ok = verifyPassword(String(password || '').slice(0, 200), row?.passwordHash);
    if (!ok) { failLogin(ip); throw new HttpError(401, 'Usuario o contraseÃ±a incorrectos.'); }
    attempts.delete(ip);
    const token = newToken();
    db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(Date.now());
    db.prepare('INSERT INTO sessions (tokenHash, userId, expiresAt) VALUES (?, ?, ?)').run(hashToken(token), row.id, Date.now() + SESSION_MS);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(token, SESSION_MS / 1000) });
  }

  if (route === '/api/logout' && method === 'POST') {
    const token = parseCookies(req).sid;
    if (token) db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(hashToken(token));
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
  }

  const user = currentUser(req);
  if (route === '/api/me') return user ? json(res, 200, { username: user.username }) : json(res, 401, { error: 'No autenticado.' });
  if (!user) throw new HttpError(401, 'Debe iniciar sesiÃ³n.');

  if (route === '/api/admin/settings') {
    if (method === 'GET') return json(res, 200, getSettings());
    if (method === 'PUT') { saveSettings(await readJson(req, 100_000)); return json(res, 200, getSettings()); }
  }

  if (route === '/api/admin/password' && method === 'POST') {
    const { current, next } = await readJson(req, 10_000);
    const row = db.prepare('SELECT passwordHash FROM users WHERE id = ?').get(user.id);
    if (!verifyPassword(String(current || ''), row.passwordHash)) throw new HttpError(400, 'La contraseÃ±a actual no es correcta.');
    const problem = passwordProblem(next);
    if (problem) throw new HttpError(400, problem);
    db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hashPassword(next), user.id);
    return json(res, 200, { ok: true });
  }

  if (route === '/api/admin/upload' && method === 'POST') {
    const body = await readBody(req, 3 * 1024 * 1024);
    const ext = imageType(body);
    if (!ext) throw new HttpError(400, 'Solo se permiten imÃ¡genes PNG, JPG o WEBP.');
    const name = `${crypto.randomBytes(12).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), body);
    return json(res, 201, { url: `/uploads/${name}` });
  }

  if (route === '/api/admin/users') {
    if (method === 'GET') return json(res, 200, db.prepare('SELECT id, username, createdAt FROM users ORDER BY id').all().map((r) => ({ ...r })));
    if (method === 'POST') {
      const { username, password } = await readJson(req, 10_000);
      const name = String(username || '').trim();
      if (!/^[\w.@-]{3,60}$/.test(name)) throw new HttpError(400, 'Usuario no vÃ¡lido (3 a 60 caracteres: letras, nÃºmeros, . _ - @).');
      const problem = passwordProblem(password);
      if (problem) throw new HttpError(400, problem);
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(name)) throw new HttpError(409, 'Ese usuario ya existe.');
      db.prepare('INSERT INTO users (username, passwordHash) VALUES (?, ?)').run(name, hashPassword(password));
      return json(res, 201, { ok: true });
    }
  }
  const userMatch = route.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch && method === 'DELETE') {
    const id = Number(userMatch[1]);
    if (id === user.id) throw new HttpError(400, 'No puede eliminar su propio usuario.');
    if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n <= 1) throw new HttpError(400, 'Debe quedar al menos un administrador.');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return json(res, 200, { ok: true });
  }

  const m = route.match(/^\/api\/admin\/(specimens|publications|library|members)(?:\/(bulk|[^/]+))?$/);
  if (m) {
    const entity = m[1];
    const sub = m[2];
    if (!sub) {
      if (method === 'GET') return json(res, 200, list(entity));
      if (method === 'POST') {
        const body = await readJson(req, 200_000);
        try { const id = insert(entity, body); return json(res, 201, { id }); }
        catch (e) {
          if (/UNIQUE|PRIMARY/i.test(e.message)) throw new HttpError(409, 'Ya existe un registro con ese identificador.');
          throw new HttpError(400, e.message);
        }
      }
    } else if (sub === 'bulk' && method === 'POST') {
      const { rows } = await readJson(req);
      if (!Array.isArray(rows) || rows.length > 5000) throw new HttpError(400, 'Se esperaba una lista de hasta 5000 filas.');
      const result = { created: 0, updated: 0, errors: [] };
      db.exec('BEGIN');
      try {
        rows.forEach((row, i) => {
          try {
            if (entity === 'specimens') {
              const { value, error } = clean(entity, row);
              if (error) throw new Error(error);
              const exists = value.catalogNumber && db.prepare('SELECT 1 FROM specimens WHERE catalogNumber = ?').get(value.catalogNumber);
              if (exists) { update(entity, value.catalogNumber, value); result.updated += 1; } else { insert(entity, value); result.created += 1; }
            } else { insert(entity, row); result.created += 1; }
          } catch (e) { result.errors.push(`Fila ${i + 1}: ${e.message}`); }
        });
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return json(res, 200, result);
    } else {
      const id = parseId(entity, sub);
      if (id === null) throw new HttpError(400, 'Identificador no vÃ¡lido.');
      if (method === 'PUT') {
        const body = await readJson(req, 200_000);
        if (entity === 'specimens') body.catalogNumber = String(id);
        try { if (!update(entity, id, body)) throw new HttpError(404, 'No encontrado.'); }
        catch (e) { throw e instanceof HttpError ? e : new HttpError(400, e.message); }
        return json(res, 200, { ok: true });
      }
      if (method === 'DELETE') {
        if (!remove(entity, id)) throw new HttpError(404, 'No encontrado.');
        return json(res, 200, { ok: true });
      }
    }
  }
  throw new HttpError(404, 'Ruta no encontrada.');
};

const serveFile = (res, req, file, extraHeaders = {}) => {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'No encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache', ...extraHeaders });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
};

const safeJoin = (base, rel) => {
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { return null; }
  if (decoded.includes('\0') || decoded.split(/[\\/]/).some((p) => p.startsWith('.'))) return null;
  const full = path.resolve(base, `.${path.sep}${decoded}`);
  return full.startsWith(base + path.sep) || full === base ? full : null;
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'MÃ©todo no permitido.');

    if (url.pathname === '/assets/js/data.js') {
      const d = publicData();
      const js = `'use strict';\nconst herbariumSpecimens = ${JSON.stringify(d.specimens)};\nconst libraryItems = ${JSON.stringify(d.libraryItems)};\nconst publications = ${JSON.stringify(d.publications)};\nconst siteMembers = ${JSON.stringify(d.siteMembers)};\nconst siteSettings = ${JSON.stringify(d.siteSettings)};\n`
        .replace(/</g, '\\u003c');
      return send(res, 200, js, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
    }
    if (url.pathname.startsWith('/uploads/')) {
      const file = safeJoin(UPLOAD_DIR, url.pathname.slice('/uploads/'.length));
      return file ? serveFile(res, req, file) : send(res, 404, 'No encontrado');
    }
    let rel = url.pathname === '/' ? '/index.html' : url.pathname;
    if (rel === '/admin') return send(res, 301, '', { Location: '/admin/' });
    const section = rel.replace(/^\/|\/$/g, '');
    if (PAGE_ROUTES.test(section) && !path.extname(section)) {
      if (!rel.endsWith('/')) return send(res, 301, '', { Location: `${rel}/` });
      return serveFile(res, req, path.join(PUBLIC_DIR, 'index.html'));
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = safeJoin(PUBLIC_DIR, rel);
    if (!file) return send(res, 404, 'No encontrado');
    return serveFile(res, req, file);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'Error interno del servidor.' : e.message });
  }
});

server.listen(PORT, HOST, () => console.log(`Herbario SURCO en http://${HOST}:${PORT}  (administraciÃ³n: /admin/)`));

