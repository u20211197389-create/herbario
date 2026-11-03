import { ENTITIES, SETTING_KEYS, clean, requiredError, passwordProblem } from '../server/entities.js';
import { buildDecisionMail } from '../server/mailtext.js';
import { mailConfigured, sendMail } from './mailer.js';

const SESSION_MS = 8 * 60 * 60 * 1000;
const IMAGE_ACCESS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_UPLOAD = 1_200_000;
const CHUNK = 300_000; // caracteres base64 por fila (múltiplo de 4)
const PBKDF2_ITERATIONS = 100_000;

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; frame-src https://maps.google.com https://www.google.com; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const respond = (body, status = 200, headers = {}) => new Response(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });
const json = (status, obj, headers = {}) => respond(JSON.stringify(obj), status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => Uint8Array.from(String(h).match(/../g) || [], (x) => parseInt(x, 16));
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hashToken = async (t) => hex(await crypto.subtle.digest('SHA-256', enc.encode(t)));

const pbkdf2 = async (password, salt) => {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256));
};
const hashPassword = async (password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${hex(salt)}$${hex(await pbkdf2(password, salt))}`;
};
// Con hash nulo se hace igualmente el cálculo para no revelar si el usuario existe.
const verifyPassword = async (password, stored) => {
  const [scheme, saltHex, hashHex] = String(stored || 'pbkdf2$00$00').split('$');
  const actual = await pbkdf2(password, unhex(saltHex || '00'));
  const expected = unhex(hashHex || '00');
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ (expected[i] ?? 0);
  return Boolean(stored) && scheme === 'pbkdf2' && diff === 0;
};

const parseCookies = (request) => Object.fromEntries(String(request.headers.get('Cookie') || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
const cookie = (value, maxAge) => `sid=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}; Secure`;

const readJson = async (request, limit = 5 * 1024 * 1024) => {
  const raw = await request.arrayBuffer();
  if (raw.byteLength > limit) throw new HttpError(413, 'El contenido es demasiado grande.');
  try { const v = JSON.parse(new TextDecoder().decode(raw) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch { throw new HttpError(400, 'JSON no válido.'); }
};

// Límite de intentos por clave, guardado en D1 (el Worker no conserva memoria entre peticiones).
const blockedMinutes = async (env, key, max) => {
  const r = await env.DB.prepare('SELECT count, resetAt FROM rate_limits WHERE key = ?').bind(key).first();
  return r && r.resetAt > Date.now() && r.count >= max ? Math.ceil((r.resetAt - Date.now()) / 60000) : 0;
};
const hit = async (env, key, windowMs) => {
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO rate_limits (key, count, resetAt) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN resetAt <= ? THEN 1 ELSE count + 1 END,
    resetAt = CASE WHEN resetAt <= ? THEN ? ELSE resetAt END`).bind(key, now + windowMs, now, now, now + windowMs).run();
};

const currentUser = async (request, env) => {
  const token = parseCookies(request).sid;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const th = await hashToken(token);
  const row = await env.DB.prepare('SELECT u.id, u.username, s.expiresAt FROM sessions s JOIN users u ON u.id = s.userId WHERE s.tokenHash = ?').bind(th).first();
  if (!row) return null;
  if (row.expiresAt < Date.now()) { await env.DB.prepare('DELETE FROM sessions WHERE tokenHash = ?').bind(th).run(); return null; }
  return { id: row.id, username: row.username };
};

// El primer administrador se crea con los secretos ADMIN_USER y ADMIN_PASSWORD (solo si aún no hay usuarios).
const ensureAdmin = async (env) => {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return;
  if (await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first()) return;
  if (passwordProblem(env.ADMIN_PASSWORD) || !/^[\w.@-]{3,60}$/.test(env.ADMIN_USER)) return;
  await env.DB.prepare('INSERT INTO users (username, passwordHash) VALUES (?, ?)').bind(env.ADMIN_USER, await hashPassword(env.ADMIN_PASSWORD)).run();
};

const names = (e) => e.fields.map((x) => x.name);
const insertStmt = (env, entityName, value) => {
  const e = ENTITIES[entityName];
  const cols = names(e);
  return env.DB.prepare(`INSERT INTO ${e.table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((c) => value[c]));
};
const updateStmt = (env, entityName, id, value) => {
  const e = ENTITIES[entityName];
  const cols = names(e).filter((c) => c !== e.key);
  return env.DB.prepare(`UPDATE ${e.table} SET ${cols.map((c) => `"${c}"=?`).join(',')} WHERE "${e.key}"=?`).bind(...cols.map((c) => value[c]), id);
};
const prepare = (entityName, record) => {
  const { value, error } = clean(entityName, record);
  if (error) throw new Error(error);
  const missing = requiredError(entityName, value);
  if (missing) throw new Error(missing);
  return value;
};

const list = async (env, entityName) => {
  const e = ENTITIES[entityName];
  const { results } = await env.DB.prepare(`SELECT ${e.key === 'id' ? 'id,' : ''}${names(e).map((c) => `"${c}"`).join(',')} FROM ${e.table} ORDER BY ${e.order}`).all();
  return results;
};

const getSettings = async (env) => {
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, '']));
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  for (const r of results) if (r.key in out) out[r.key] = r.value;
  return out;
};

const saveSettings = async (env, input) => {
  const stmts = [];
  for (const k of SETTING_KEYS) {
    if (!(k in input)) continue;
    const v = String(input[k] ?? '').trim();
    const max = ['history', 'terms', 'mission', 'founderText', 'aboutIntro'].includes(k) ? 5000 : 500;
    if (v.length > max) throw new HttpError(400, `El texto "${k}" es demasiado largo.`);
    if (k === 'founderPhoto' && v && !/^(https?:\/\/[^\s]+|\/uploads\/[A-Za-z0-9._-]+)$/i.test(v)) throw new HttpError(400, 'La foto debe ser un enlace http(s) o una imagen subida.');
    stmts.push(env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v));
  }
  if (stmts.length) await env.DB.batch(stmts);
};

const publicData = async (env) => {
  const [specs, lib, publications, members, siteSettings] = await Promise.all([
    list(env, 'specimens'), list(env, 'library'), list(env, 'publications'), list(env, 'members'), getSettings(env)]);
  const split = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
  return {
    specimens: specs.map(({ image, ...s }) => ({ ...s, hasImage: Boolean(image), isType: Boolean(s.isType) })),
    libraryItems: lib.map(({ contributors, subjects, ...r }) => ({ ...r, contributors: split(contributors), subjects: split(subjects) })),
    publications: publications.map(({ id, ...r }) => r),
    siteMembers: members.map(({ id, position, ...r }) => r),
    siteSettings,
  };
};

const imageType = (b) => {
  if (b.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return ['.png', 'image/png'];
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['.jpg', 'image/jpeg'];
  if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return ['.webp', 'image/webp'];
  return null;
};

const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const parseId = (entity, raw) => {
  let id;
  try { id = decodeURIComponent(raw); } catch { return null; }
  if (entity === 'specimens') return /^[\w.-]{1,20}$/.test(id) ? id : null;
  return /^\d+$/.test(id) ? Number(id) : null;
};

const serveUpload = async (request, env, url) => {
  const name = decodeURIComponent(url.pathname.slice('/uploads/'.length));
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name)) return respond('No encontrado', 404);
  const meta = await env.DB.prepare('SELECT type FROM uploads WHERE name = ?').bind(name).first();
  if (!meta) return respond('No encontrado', 404);
  const imageUrl = `/uploads/${name}`;
  const specimen = await env.DB.prepare('SELECT catalogNumber FROM specimens WHERE image = ?').bind(imageUrl).first();
  if (specimen) {
    const token = url.searchParams.get('t') || '';
    const granted = /^[a-f0-9]{64}$/.test(token) && await env.DB.prepare("SELECT 1 FROM image_requests WHERE token = ? AND status = 'aprobada' AND expiresAt > ? AND catalogNumber = ?").bind(token, Date.now(), specimen.catalogNumber).first();
    if (!granted && !(await currentUser(request, env))) return respond('No autorizado', 401, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  }
  const { results } = await env.DB.prepare('SELECT data FROM upload_chunks WHERE name = ? ORDER BY idx').bind(name).all();
  const bin = atob(results.map((r) => r.data).join(''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return respond(bytes, 200, { 'Content-Type': meta.type, 'Cache-Control': specimen ? 'private, no-store' : 'public, max-age=31536000, immutable' });
};

const handleApi = async (request, env, url) => {
  const method = request.method;
  const route = url.pathname;
  const ip = request.headers.get('CF-Connecting-IP') || 'x';

  if (method !== 'GET' && method !== 'HEAD' && !request.headers.get('X-Requested-With')) throw new HttpError(403, 'Solicitud no permitida.');

  if (route === '/api/solicitudes-imagen' && method === 'POST') {
    if (await blockedMinutes(env, `req:${ip}`, 5)) throw new HttpError(429, 'Demasiadas solicitudes. Intente de nuevo más tarde.');
    const body = await readJson(request, 10_000);
    const kind = body.kind === 'descarga' ? 'descarga' : 'imagen';
    const catalogNumber = String(body.catalogNumber || '').slice(0, kind === 'descarga' ? 200 : 20);
    const email = String(body.email || '').trim();
    const reason = String(body.reason || '').trim();
    if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Indique un correo electrónico válido.');
    if (reason.length < 5 || reason.length > 1000) throw new HttpError(400, 'Indique el motivo de la solicitud (entre 5 y 1000 caracteres).');
    if (!catalogNumber) throw new HttpError(400, 'Falta el ejemplar.');
    if (kind === 'imagen') {
      const specimen = await env.DB.prepare('SELECT image FROM specimens WHERE catalogNumber = ?').bind(catalogNumber).first();
      if (!specimen || !specimen.image) throw new HttpError(404, 'Este ejemplar no tiene imagen disponible.');
    }
    await env.DB.prepare('INSERT INTO image_requests (catalogNumber, email, reason, kind) VALUES (?, ?, ?, ?)').bind(catalogNumber, email, reason, kind).run();
    await hit(env, `req:${ip}`, 60 * 60 * 1000);
    return json(201, { ok: true });
  }

  if (route === '/api/imagen-acceso' && method === 'GET') {
    const token = url.searchParams.get('token') || '';
    const row = /^[a-f0-9]{64}$/.test(token)
      ? await env.DB.prepare("SELECT r.catalogNumber, s.image FROM image_requests r JOIN specimens s ON s.catalogNumber = r.catalogNumber WHERE r.token = ? AND r.status = 'aprobada' AND r.expiresAt > ?").bind(token, Date.now()).first()
      : null;
    if (!row || !row.image) throw new HttpError(404, 'El enlace no es válido o ya venció.');
    return json(200, { catalogNumber: row.catalogNumber, image: `${row.image}?t=${token}` });
  }

  if (route === '/api/login' && method === 'POST') {
    const wait = await blockedMinutes(env, `login:${ip}`, 5);
    if (wait) throw new HttpError(429, `Demasiados intentos. Intente de nuevo en ${wait} minuto(s).`);
    await ensureAdmin(env);
    const { username, password } = await readJson(request, 10_000);
    const row = await env.DB.prepare('SELECT id, passwordHash FROM users WHERE username = ?').bind(String(username || '').slice(0, 100)).first();
    const ok = await verifyPassword(String(password || '').slice(0, 200), row?.passwordHash);
    if (!ok) { await hit(env, `login:${ip}`, 15 * 60 * 1000); throw new HttpError(401, 'Usuario o contraseña incorrectos.'); }
    await env.DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(`login:${ip}`).run();
    const token = newToken();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expiresAt < ?').bind(Date.now()),
      env.DB.prepare('INSERT INTO sessions (tokenHash, userId, expiresAt) VALUES (?, ?, ?)').bind(await hashToken(token), row.id, Date.now() + SESSION_MS),
    ]);
    return json(200, { ok: true }, { 'Set-Cookie': cookie(token, SESSION_MS / 1000) });
  }

  if (route === '/api/logout' && method === 'POST') {
    const token = parseCookies(request).sid;
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE tokenHash = ?').bind(await hashToken(token)).run();
    return json(200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
  }

  const user = await currentUser(request, env);
  if (route === '/api/me') return user ? json(200, { username: user.username }) : json(401, { error: 'No autenticado.' });
  if (!user) throw new HttpError(401, 'Debe iniciar sesión.');

  if (route === '/api/admin/settings') {
    if (method === 'GET') return json(200, await getSettings(env));
    if (method === 'PUT') { await saveSettings(env, await readJson(request, 100_000)); return json(200, await getSettings(env)); }
  }

  if (route === '/api/admin/password' && method === 'POST') {
    const { current, next } = await readJson(request, 10_000);
    const row = await env.DB.prepare('SELECT passwordHash FROM users WHERE id = ?').bind(user.id).first();
    if (!(await verifyPassword(String(current || ''), row.passwordHash))) throw new HttpError(400, 'La contraseña actual no es correcta.');
    const problem = passwordProblem(next);
    if (problem) throw new HttpError(400, problem);
    await env.DB.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').bind(await hashPassword(next), user.id).run();
    return json(200, { ok: true });
  }

  if (route === '/api/admin/upload' && method === 'POST') {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_UPLOAD) throw new HttpError(413, 'La imagen supera 1,2 MB.');
    const bytes = new Uint8Array(raw);
    const kind = imageType(bytes);
    if (!kind) throw new HttpError(400, 'Solo se permiten imágenes PNG, JPG o WEBP.');
    const name = `${hex(crypto.getRandomValues(new Uint8Array(12)))}${kind[0]}`;
    const b64 = toBase64(bytes);
    const stmts = [env.DB.prepare('INSERT INTO uploads (name, type) VALUES (?, ?)').bind(name, kind[1])];
    for (let i = 0, idx = 0; i < b64.length; i += CHUNK, idx += 1) stmts.push(env.DB.prepare('INSERT INTO upload_chunks (name, idx, data) VALUES (?, ?, ?)').bind(name, idx, b64.slice(i, i + CHUNK)));
    await env.DB.batch(stmts);
    return json(201, { url: `/uploads/${name}` });
  }

  const requestMatch = route.match(/^\/api\/admin\/solicitudes(?:\/(\d+))?$/);
  if (requestMatch) {
    const id = requestMatch[1] ? Number(requestMatch[1]) : null;
    if (!id && method === 'GET') return json(200, (await env.DB.prepare('SELECT id, catalogNumber, email, reason, status, token, expiresAt, createdAt, decidedAt, kind FROM image_requests ORDER BY id DESC').all()).results);
    if (id && method === 'PATCH') {
      const { status } = await readJson(request, 1_000);
      if (status !== 'aprobada' && status !== 'rechazada') throw new HttpError(400, 'Estado no válido.');
      const row = await env.DB.prepare('SELECT kind, email, catalogNumber FROM image_requests WHERE id = ?').bind(id).first();
      if (!row) throw new HttpError(404, 'Solicitud no encontrada.');
      const grant = status === 'aprobada' && row.kind === 'imagen';
      const token = grant ? newToken() : null;
      const expiresAt = grant ? Date.now() + IMAGE_ACCESS_MS : null;
      await env.DB.prepare('UPDATE image_requests SET status = ?, token = ?, expiresAt = ?, decidedAt = CURRENT_TIMESTAMP WHERE id = ?').bind(status, token, expiresAt, id).run();

      const origin = (env.PUBLIC_URL || url.origin).replace(/\/+$/, '');
      const mail = buildDecisionMail(row, status, token, origin);
      let mailSent = false;
      let mailError = '';
      if (mailConfigured(env)) {
        try { await sendMail(env, mail); mailSent = true; } catch (e) { mailError = e.message; console.error('Error enviando correo:', e.message); }
      }
      return json(200, { ok: true, mailSent, mailError, mail });
    }
    if (id && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM image_requests WHERE id = ?').bind(id).run();
      return json(200, { ok: true });
    }
  }

  if (route === '/api/admin/users') {
    if (method === 'GET') return json(200, (await env.DB.prepare('SELECT id, username, createdAt FROM users ORDER BY id').all()).results);
    if (method === 'POST') {
      const { username, password } = await readJson(request, 10_000);
      const name = String(username || '').trim();
      if (!/^[\w.@-]{3,60}$/.test(name)) throw new HttpError(400, 'Usuario no válido (3 a 60 caracteres: letras, números, . _ - @).');
      const problem = passwordProblem(password);
      if (problem) throw new HttpError(400, problem);
      if (await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(name).first()) throw new HttpError(409, 'Ese usuario ya existe.');
      await env.DB.prepare('INSERT INTO users (username, passwordHash) VALUES (?, ?)').bind(name, await hashPassword(password)).run();
      return json(201, { ok: true });
    }
  }
  const userMatch = route.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch && method === 'DELETE') {
    const id = Number(userMatch[1]);
    if (id === user.id) throw new HttpError(400, 'No puede eliminar su propio usuario.');
    if ((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n <= 1) throw new HttpError(400, 'Debe quedar al menos un administrador.');
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return json(200, { ok: true });
  }

  const m = route.match(/^\/api\/admin\/(specimens|publications|library|members)(?:\/(bulk|[^/]+))?$/);
  if (m) {
    const entity = m[1];
    const sub = m[2];
    const e = ENTITIES[entity];
    if (!sub) {
      if (method === 'GET') return json(200, await list(env, entity));
      if (method === 'POST') {
        const body = await readJson(request, 200_000);
        let value;
        try { value = prepare(entity, body); } catch (err) { throw new HttpError(400, err.message); }
        try {
          const info = await insertStmt(env, entity, value).run();
          return json(201, { id: entity === 'specimens' ? value.catalogNumber : info.meta.last_row_id });
        } catch (err) {
          if (/UNIQUE|PRIMARY/i.test(err.message)) throw new HttpError(409, 'Ya existe un registro con ese identificador.');
          throw new HttpError(400, err.message);
        }
      }
    } else if (sub === 'bulk' && method === 'POST') {
      const { rows } = await readJson(request);
      if (!Array.isArray(rows) || rows.length > 3000) throw new HttpError(400, 'Se esperaba una lista de hasta 3000 filas.');
      const result = { created: 0, updated: 0, errors: [] };
      const existing = entity === 'specimens'
        ? new Set((await env.DB.prepare('SELECT catalogNumber FROM specimens').all()).results.map((r) => r.catalogNumber))
        : null;
      const stmts = [];
      rows.forEach((row, i) => {
        try {
          const value = prepare(entity, row);
          if (existing && existing.has(value.catalogNumber)) { stmts.push(updateStmt(env, entity, value.catalogNumber, value)); result.updated += 1; }
          else { stmts.push(insertStmt(env, entity, value)); result.created += 1; existing?.add(value.catalogNumber); }
        } catch (err) { result.errors.push(`Fila ${i + 1}: ${err.message}`); }
      });
      for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
      return json(200, result);
    } else {
      const id = parseId(entity, sub);
      if (id === null) throw new HttpError(400, 'Identificador no válido.');
      if (method === 'PUT') {
        const body = await readJson(request, 200_000);
        if (entity === 'specimens') body.catalogNumber = String(id);
        let value;
        try { value = prepare(entity, body); } catch (err) { throw new HttpError(400, err.message); }
        const info = await updateStmt(env, entity, id, value).run();
        if (!info.meta.changes) throw new HttpError(404, 'No encontrado.');
        return json(200, { ok: true });
      }
      if (method === 'DELETE') {
        const info = await env.DB.prepare(`DELETE FROM ${e.table} WHERE "${e.key}"=?`).bind(id).run();
        if (!info.meta.changes) throw new HttpError(404, 'No encontrado.');
        return json(200, { ok: true });
      }
    }
  }
  throw new HttpError(404, 'Ruta no encontrada.');
};

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'Método no permitido.');
      if (url.pathname === '/assets/js/data.js') {
        const d = await publicData(env);
        const js = `'use strict';\nconst herbariumSpecimens = ${JSON.stringify(d.specimens)};\nconst libraryItems = ${JSON.stringify(d.libraryItems)};\nconst publications = ${JSON.stringify(d.publications)};\nconst siteMembers = ${JSON.stringify(d.siteMembers)};\nconst siteSettings = ${JSON.stringify(d.siteSettings)};\n`
          .replace(/</g, '\\u003c');
        return respond(js, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      }
      if (url.pathname.startsWith('/uploads/')) return await serveUpload(request, env, url);
      return await env.ASSETS.fetch(request);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return json(status, { error: status === 500 ? 'Error interno del servidor.' : e.message });
    }
  },
};
