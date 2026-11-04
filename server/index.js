import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, ROOT, UPLOAD_DIR, ENTITIES, insert, update, remove, list, clean, getSettings, saveSettings, publicData } from './db.js';
import { mailConfigured, sendMail } from './mailer.js';
import { buildDecisionMail } from './mailtext.js';
import { hashPassword, verifyPassword, newToken, hashToken, passwordProblem } from './security.js';

const PUBLIC_DIR = path.join(ROOT, 'public');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 5173);
const SECURE = process.env.HERBARIO_SECURE === '1';
const SESSION_MS = 8 * 60 * 60 * 1000;
// Rutas limpias del sitio público; todas entregan index.html y el navegador elige la vista.
const PAGE_ROUTES = /^(especimenes|busqueda-avanzada|acerca|coleccion|cifras|servicios|tour-cientifico|biblioteca|publicaciones|contacto|publicaciones\/\d{1,9}|biblioteca\/\d{1,9}|ejemplar\/[\w.-]{1,20})$/;

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
  const row = db.prepare('SELECT u.id, u.username, u.displayName, u.email, u.avatar, s.expiresAt FROM sessions s JOIN users u ON u.id = s.userId WHERE s.tokenHash = ?').get(hashToken(token));
  if (!row) return null;
  if (row.expiresAt < Date.now()) { db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(hashToken(token)); return null; }
  return { id: row.id, username: row.username, displayName: row.displayName || '', email: row.email || '', avatar: row.avatar || '' };
};

const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const parseProfile = (b) => {
  const username = String(b.username || '').trim();
  if (!/^[\w.@-]{3,60}$/.test(username)) throw new HttpError(400, 'Usuario no válido (3 a 60 caracteres: letras, números, . _ - @).');
  const displayName = String(b.displayName || '').trim().slice(0, 80);
  const email = String(b.email || '').trim().slice(0, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Correo no válido.');
  const avatar = String(b.avatar || '');
  if (avatar && (avatar.length > 80_000 || !AVATAR_RE.test(avatar))) throw new HttpError(400, 'Imagen de perfil no válida.');
  return { username, displayName, email, avatar };
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

const imageRequestAttempts = new Map();
const IMAGE_ACCESS_MS = 7 * 24 * 60 * 60 * 1000;

// En hosting sin terminal, el primer administrador se crea con ADMIN_USER y ADMIN_PASSWORD (solo si no hay usuarios).
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get() && process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
  const problem = passwordProblem(process.env.ADMIN_PASSWORD);
  if (problem || !/^[\w.@-]{3,60}$/.test(process.env.ADMIN_USER)) console.error('ADMIN_USER/ADMIN_PASSWORD no válidos:', problem || 'usuario no válido');
  else {
    db.prepare('INSERT INTO users (username, passwordHash) VALUES (?, ?)').run(process.env.ADMIN_USER, hashPassword(process.env.ADMIN_PASSWORD));
    console.log(`Administrador "${process.env.ADMIN_USER}" creado.`);
  }
}

const handleApi = async (req, res, url) => {
  const method = req.method;
  const route = url.pathname;
  const ip = (SECURE && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'x';

  if (method !== 'GET' && method !== 'HEAD' && !req.headers['x-requested-with']) throw new HttpError(403, 'Solicitud no permitida.');

  if (route === '/api/solicitudes-imagen' && method === 'POST') {
    const now = Date.now();
    const recent = (imageRequestAttempts.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= 5) throw new HttpError(429, 'Demasiadas solicitudes. Intente de nuevo más tarde.');
    const body = await readJson(req, 10_000);
    const kind = body.kind === 'descarga' ? 'descarga' : 'imagen';
    const catalogNumber = String(body.catalogNumber || '').slice(0, kind === 'descarga' ? 200 : 20);
    const email = String(body.email || '').trim();
    const reason = String(body.reason || '').trim();
    if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Indique un correo electrónico válido.');
    if (reason.length < 5 || reason.length > 1000) throw new HttpError(400, 'Indique el motivo de la solicitud (entre 5 y 1000 caracteres).');
    if (!catalogNumber) throw new HttpError(400, 'Falta el ejemplar.');
    if (kind === 'imagen') {
      const specimen = db.prepare('SELECT image FROM specimens WHERE catalogNumber = ?').get(catalogNumber);
      if (!specimen || !specimen.image) throw new HttpError(404, 'Este ejemplar no tiene imagen disponible.');
    }
    db.prepare('INSERT INTO image_requests (catalogNumber, email, reason, kind) VALUES (?, ?, ?, ?)').run(catalogNumber, email, reason, kind);
    recent.push(now);
    imageRequestAttempts.set(ip, recent);
    return json(res, 201, { ok: true });
  }

  if (route === '/api/imagen-acceso' && method === 'GET') {
    const token = url.searchParams.get('token') || '';
    const row = /^[a-f0-9]{64}$/.test(token)
      ? db.prepare("SELECT r.catalogNumber, s.image FROM image_requests r JOIN specimens s ON s.catalogNumber = r.catalogNumber WHERE r.token = ? AND r.status = 'aprobada' AND r.expiresAt > ?").get(token, Date.now())
      : null;
    if (!row || !row.image) throw new HttpError(404, 'El enlace no es válido o ya venció.');
    return json(res, 200, { catalogNumber: row.catalogNumber, image: `${row.image}?t=${token}` });
  }

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
  if (route === '/api/me') return user ? json(res, 200, user) : json(res, 401, { error: 'No autenticado.' });
  if (!user) throw new HttpError(401, 'Debe iniciar sesión.');

  if (route === '/api/admin/profile' && method === 'PUT') {
    const p = parseProfile(await readJson(req, 100_000));
    if (db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(p.username, user.id)) throw new HttpError(409, 'Ese usuario ya existe.');
    db.prepare('UPDATE users SET username = ?, displayName = ?, email = ?, avatar = ? WHERE id = ?').run(p.username, p.displayName, p.email, p.avatar, user.id);
    return json(res, 200, { id: user.id, ...p });
  }

  if (route === '/api/admin/places' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
    if (q.length < 3) return json(res, 200, []);
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=es&viewbox=-79.1,13.5,-66.8,-4.3&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'HerbarioSURCO/1.0 (herbario@usco.edu.co)' }, signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!r || !r.ok) throw new HttpError(502, 'No se pudo consultar el buscador de lugares.');
    const found = await r.json();
    return json(res, 200, found.map((p) => ({ name: String(p.display_name || '').slice(0, 200), lat: Number(p.lat), lon: Number(p.lon) })).filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon)));
  }
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

  const requestMatch = route.match(/^\/api\/admin\/solicitudes(?:\/(\d+))?$/);
  if (requestMatch) {
    const id = requestMatch[1] ? Number(requestMatch[1]) : null;
    if (!id && method === 'GET') return json(res, 200, db.prepare('SELECT id, catalogNumber, email, reason, status, token, expiresAt, createdAt, decidedAt, kind FROM image_requests ORDER BY id DESC').all().map((r) => ({ ...r })));
    if (id && method === 'PATCH') {
      const { status } = await readJson(req, 1_000);
      if (status !== 'aprobada' && status !== 'rechazada') throw new HttpError(400, 'Estado no válido.');
      const kindRow = db.prepare('SELECT kind, email, catalogNumber FROM image_requests WHERE id = ?').get(id);
      if (!kindRow) throw new HttpError(404, 'Solicitud no encontrada.');
      const grant = status === 'aprobada' && kindRow.kind === 'imagen';
      const token = grant ? newToken() : null;
      const expiresAt = grant ? Date.now() + IMAGE_ACCESS_MS : null;
      const r = db.prepare("UPDATE image_requests SET status = ?, token = ?, expiresAt = ?, decidedAt = CURRENT_TIMESTAMP WHERE id = ?").run(status, token, expiresAt, id);
      if (!r.changes) throw new HttpError(404, 'Solicitud no encontrada.');

      const origin = (process.env.PUBLIC_URL || `${SECURE ? 'https' : 'http'}://${req.headers.host || `${HOST}:${PORT}`}`).replace(/\/+$/, '');
      const mail = buildDecisionMail(kindRow, status, token, origin);
      let mailSent = false;
      let mailError = '';
      if (mailConfigured()) {
        try { await sendMail(mail); mailSent = true; } catch (e) { mailError = e.message; console.error('Error enviando correo:', e.message); }
      }
      return json(res, 200, { ok: true, mailSent, mailError, mail });
    }
    if (id && method === 'DELETE') {
      db.prepare('DELETE FROM image_requests WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }
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
      if (!file) return send(res, 404, 'No encontrado');
      if (db.prepare('SELECT 1 FROM specimens WHERE image = ? AND hideImage = 1').get(`/uploads/${path.basename(file)}`) && !currentUser(req)) return send(res, 404, 'No encontrado');
      return serveFile(res, req, file);
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

server.listen(PORT, HOST, () => console.log(`Herbario SURCO en http://${HOST}:${PORT}  (administración: /admin/)`));

