'use strict';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n[k] = v;
  }
  n.append(...kids.flat().filter((x) => x != null));
  return n;
};

const api = async (method, path, body, raw) => {
  const opts = { method, headers: { 'X-Requested-With': 'admin' }, credentials: 'same-origin' };
  if (raw) { opts.body = raw; opts.headers['Content-Type'] = 'application/octet-stream'; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { showLogin(); throw new Error('Sesión expirada.'); }
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud.');
  return data;
};

let toastTimer;
const toast = (msg, isError) => {
  const t = $('toast');
  t.textContent = msg;
  t.className = isError ? 'toast err' : 'toast';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
};
const fail = (e) => toast(e.message, true);

// Definición de las secciones y sus campos.
const F = (name, label, extra = {}) => ({ name, label, ...extra });
const SECTIONS = {
  specimens: {
    title: 'Especímenes', singular: 'espécimen', key: 'catalogNumber',
    hint: 'Registros de la colección. El número de catálogo es único; al importar un CSV, los existentes se actualizan.',
    columns: ['catalogNumber', 'scientificName', 'family', 'department', 'collectedAt', 'isType'],
    fields: [
      F('catalogNumber', 'Número de catálogo', { required: true, lockOnEdit: true }), F('collectionNumber', 'Número de colecta'),
      F('scientificName', 'Nombre científico', { required: true }), F('authorship', 'Autoría'), F('identification', 'Identificación'),
      F('rank', 'Rango', { options: ['Especie', 'Género', 'Familia', 'Subespecie', 'Variedad'] }), F('family', 'Familia'), F('genus', 'Género'),
      F('commonName', 'Nombre común'), F('habit', 'Hábito'), F('reproductiveCondition', 'Condición reproductiva'),
      F('country', 'País'), F('department', 'Departamento'), F('municipality', 'Municipio'), F('locality', 'Localidad', { wide: true }),
      F('habitat', 'Hábitat', { wide: true }), F('collectedAt', 'Fecha de colecta (AAAA-MM-DD)'), F('collectors', 'Colectores'),
      F('identifiedBy', 'Identificado por'), F('originalLatitude', 'Latitud'), F('originalLongitude', 'Longitud'),
      F('minAltitude', 'Altitud mínima (m)'), F('maxAltitude', 'Altitud máxima (m)'),
      F('isType', 'Es ejemplar tipo', { type: 'bool' }), F('image', 'Imagen del espécimen', { type: 'image', wide: true }),
    ],
  },
  publications: {
    title: 'Publicaciones', singular: 'publicación', key: 'id',
    hint: 'Aparecen en la página pública «Publicaciones».',
    columns: ['name', 'url', 'description'],
    fields: [F('name', 'Nombre', { required: true, wide: true }), F('url', 'Enlace (https://…)', { wide: true }),
      F('description', 'Descripción', { type: 'area', wide: true }), F('image', 'Portada', { type: 'image', wide: true })],
  },
  library: {
    title: 'Biblioteca', singular: 'libro', key: 'id',
    hint: 'Catálogo bibliográfico. Autores secundarios y materias se separan con comas.',
    columns: ['title', 'author', 'publisher', 'year', 'format', 'status'],
    fields: [F('title', 'Título', { required: true, wide: true }), F('author', 'Autor'), F('publisher', 'Editorial'), F('year', 'Año'),
      F('edition', 'Edición'), F('format', 'Formato', { options: ['', 'Libro', 'Revista', 'Artículo', 'Tesis', 'Mapa', 'Otro'] }),
      F('location', 'Ubicación'), F('status', 'Estado', { options: ['', 'Disponible', 'Prestado', 'Solo consulta'] }), F('language', 'Idioma'),
      F('contributors', 'Colaboradores (separados por comas)', { wide: true }), F('subjects', 'Materias (separadas por comas)', { wide: true }),
      F('available', 'Disponibilidad (texto)', { wide: true })],
  },
  members: {
    title: 'Integrantes', singular: 'integrante', key: 'id',
    hint: 'Aparecen en «Acerca → Integrantes del herbario», ordenados por la posición.',
    columns: ['position', 'role', 'name', 'functionText'],
    fields: [F('role', 'Cargo', { required: true }), F('name', 'Nombre'), F('position', 'Posición (1, 2, 3…)', { type: 'int' }),
      F('functionText', 'Función', { type: 'area', wide: true }), F('photo', 'Foto', { type: 'image', wide: true })],
  },
};

// CSV mínimo (comillas, saltos de línea y delimitador , o ;).
const parseCsv = (text) => {
  const clean = text.replace(/^\uFEFF/, '');
  const first = clean.split(/\r?\n/, 1)[0];
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (q) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && clean[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...data] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
};

const csvCell = (v) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const download = (name, content) => {
  const a = el('a', { href: URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' })), download: name });
  document.body.append(a); a.click(); a.remove();
};

const editor = $('editor');
const editorForm = $('editor-form');

const imageField = (field, value) => {
  const input = el('input', { name: field.name, value: value || '', maxLength: 500, placeholder: '/uploads/… o https://…' });
  const preview = el('img', { alt: '', hidden: !value, src: value || '' });
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const { url } = await api('POST', '/api/admin/upload', undefined, await f.arrayBuffer());
      input.value = url; preview.src = url; preview.hidden = false;
    } catch (e) { fail(e); }
  } });
  return el('div', { class: 'wide' }, el('label', {}, field.label, el('div', { class: 'upload' }, input, preview)), file);
};

const openForm = (section, record, onSaved) => {
  const editing = Boolean(record);
  const inputs = {};
  const grid = el('div', { class: 'grid' });
  for (const f of section.fields) {
    const v = record ? record[f.name] : '';
    let node;
    if (f.type === 'image') { grid.append(imageField(f, v)); inputs[f.name] = () => grid.querySelector(`[name="${f.name}"]`).value; continue; }
    if (f.type === 'bool') {
      const cb = el('input', { type: 'checkbox', name: f.name, checked: Boolean(v) });
      node = el('label', { class: 'check' }, cb, f.label); inputs[f.name] = () => cb.checked;
    } else {
      let inp;
      if (f.options) {
        inp = el('select', { name: f.name }, ...(f.options.includes(v) || !v ? f.options : [v, ...f.options]).map((o) => el('option', { value: o, textContent: o || '—' })));
        inp.value = v || f.options[0];
      } else if (f.type === 'area') inp = el('textarea', { name: f.name, value: v ?? '', maxLength: 1000 });
      else inp = el('input', { name: f.name, value: v ?? '', type: f.type === 'int' ? 'number' : 'text', maxLength: 500, required: f.required, readOnly: editing && f.lockOnEdit });
      node = el('label', { class: f.wide ? 'wide' : '' }, f.label, inp); inputs[f.name] = () => inp.value;
    }
    if (f.wide && f.type === 'bool') node.classList.add('wide');
    grid.append(node);
  }
  const error = el('p', { class: 'error', role: 'alert' });
  editorForm.replaceChildren(
    el('h3', {}, `${editing ? 'Editar' : 'Nuevo'} ${section.singular}`), grid, error,
    el('div', { class: 'row' },
      el('button', { class: 'btn ghost', type: 'button', onclick: () => editor.close() }, 'Cancelar'),
      el('button', { class: 'btn', type: 'submit' }, 'Guardar')),
  );
  editorForm.onsubmit = async (ev) => {
    ev.preventDefault();
    const body = Object.fromEntries(section.fields.map((f) => [f.name, inputs[f.name]()]));
    try {
      if (editing) await api('PUT', `/api/admin/${section.entity}/${encodeURIComponent(record[section.key])}`, body);
      else await api('POST', `/api/admin/${section.entity}`, body);
      editor.close(); toast('Guardado.'); onSaved();
    } catch (e) { error.textContent = e.message; }
  };
  editor.showModal();
};

const renderEntity = async (entity) => {
  const section = { ...SECTIONS[entity], entity };
  const panel = $('panel');
  const rows = await api('GET', `/api/admin/${entity}`);
  const search = el('input', { type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar' });
  const body = el('tbody');
  const label = (name) => section.fields.find((f) => f.name === name)?.label || name;
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = rows.filter((r) => !q || Object.values(r).join(' ').toLowerCase().includes(q));
    body.replaceChildren(...shown.map((r) => el('tr', {},
      ...section.columns.map((c) => el('td', {}, section.fields.find((f) => f.name === c)?.type === 'bool' ? (r[c] ? 'Sí' : '') : String(r[c] ?? ''))),
      el('td', { class: 'actions' },
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => openForm(section, r, () => renderEntity(entity).catch(fail)) }, 'Editar'),
        el('button', { class: 'btn small danger', type: 'button', onclick: async () => {
          if (!confirm(`¿Eliminar este ${section.singular}? Esta acción no se puede deshacer.`)) return;
          try { await api('DELETE', `/api/admin/${entity}/${encodeURIComponent(r[section.key])}`); toast('Eliminado.'); renderEntity(entity).catch(fail); } catch (e) { fail(e); }
        } }, 'Eliminar')))));
    if (!shown.length) body.replaceChildren(el('tr', {}, el('td', { colSpan: section.columns.length + 1, class: 'empty' }, 'Sin registros.')));
    count.textContent = `${shown.length} de ${rows.length}`;
  };
  const count = el('span', { class: 'hint' });
  search.addEventListener('input', draw);

  const importInput = el('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: async () => {
    const f = importInput.files[0];
    if (!f) return;
    try {
      const parsed = parseCsv(await f.text());
      if (!parsed.length) throw new Error('El CSV no tiene filas.');
      const r = await api('POST', `/api/admin/${entity}/bulk`, { rows: parsed });
      log.textContent = `Creados: ${r.created}. Actualizados: ${r.updated}.${r.errors.length ? `\nErrores:\n${r.errors.join('\n')}` : ''}`;
      log.hidden = false; toast('Importación terminada.'); await renderEntity(entity); 
    } catch (e) { fail(e); }
  } });
  const log = el('pre', { class: 'log', hidden: true });
  const names = section.fields.map((f) => f.name);
  panel.replaceChildren(
    el('h2', {}, section.title), el('p', { class: 'hint' }, section.hint),
    el('div', { class: 'toolbar' }, search,
      el('button', { class: 'btn', type: 'button', onclick: () => openForm(section, null, () => renderEntity(entity).catch(fail)) }, `+ Nuevo ${section.singular}`),
      el('button', { class: 'btn ghost', type: 'button', onclick: () => importInput.click() }, 'Importar CSV'),
      el('button', { class: 'btn ghost', type: 'button', onclick: () => download(`${entity}-plantilla.csv`, `${names.join(',')}\n`) }, 'Plantilla CSV'),
      el('button', { class: 'btn ghost', type: 'button', onclick: () => download(`${entity}.csv`, [names.join(','), ...rows.map((r) => names.map((n) => csvCell(String(r[n] ?? ''))).join(','))].join('\n')) }, 'Exportar CSV'),
      importInput, count),
    el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ...section.columns.map((c) => el('th', {}, label(c))), el('th', {}, ''))), body)),
    log,
  );
  draw();
};

const ABOUT_FIELDS = [
  ['aboutIntro', 'Introducción (párrafo inicial)', 'area'], ['mission', 'Misión', 'area'], ['founderText', 'Fundador (texto)', 'area'],
  ['founderPhoto', 'Fundador (foto)', 'image'], ['history', 'Reseña histórica', 'area'], ['terms', 'Términos de uso', 'area'],
];
const CONTACT_FIELDS = [
  ['phone', 'Teléfono', 'text'], ['address', 'Dirección', 'text'], ['instagram', 'Instagram (@usuario o enlace)', 'text'],
];

// Cada formulario guarda solo sus propios campos; el servidor no toca los demás.
const renderSettings = (title, hint, fields, extra) => async () => {
  const data = await api('GET', '/api/admin/settings');
  const inputs = {};
  const form = el('form', { class: 'card' });
  for (const [key, label, type] of fields) {
    if (type === 'image') { form.append(imageField({ name: key, label }, data[key])); inputs[key] = () => form.querySelector(`[name="${key}"]`).value; continue; }
    const inp = type === 'area' ? el('textarea', { value: data[key] || '', maxLength: 5000 }) : el('input', { value: data[key] || '', maxLength: 500 });
    form.append(el('label', {}, label, inp)); inputs[key] = () => inp.value;
  }
  form.append(el('div', { class: 'row' }, el('button', { class: 'btn', type: 'submit' }, 'Guardar')));
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('PUT', '/api/admin/settings', Object.fromEntries(fields.map(([k]) => [k, inputs[k]()]))); toast('Guardado.'); } catch (e) { fail(e); }
  };
  $('panel').replaceChildren(el('h2', {}, title), el('p', { class: 'hint' }, hint), extra ? extra() : '', form);
};
const isCoord = (v) => /^\s*-?\d+(?:[.,]\d+)?\s*°/.test(v || '') || /^-?\d+[.,]\d+$/.test((v || '').trim());
const renderCifras = async () => {
  const rows = await api('GET', '/api/admin/specimens');
  const pct = (n) => (rows.length ? `${Math.round((n / rows.length) * 100)}%` : '0%');
  const distinct = (k) => new Set(rows.map((r) => r[k]).filter(Boolean)).size;
  const stat = (n, label) => el('div', { class: 'stat' }, el('b', {}, String(n)), label);
  $('panel').replaceChildren(el('h2', {}, 'Cifras'),
    el('p', { class: 'hint' }, 'Las cifras públicas se calculan solas a partir de los especímenes; no se editan a mano. Para cambiarlas, agregue, edite o elimine especímenes (por ejemplo, marque «Es ejemplar tipo»).'),
    el('div', { class: 'stats' },
      stat(rows.length, 'Registros'), stat(distinct('family'), 'Familias'), stat(distinct('genus'), 'Géneros'),
      stat(distinct('scientificName'), 'Nombres científicos'), stat(rows.filter((r) => r.isType).length, 'Ejemplares tipo'),
      stat(pct(rows.filter((r) => r.rank === 'Especie').length), 'Determinados'),
      stat(pct(rows.filter((r) => isCoord(r.originalLatitude) && isCoord(r.originalLongitude)).length), 'Georreferenciados')));
};

const renderUsers = async () => {
  const users = await api('GET', '/api/admin/users');
  const body = el('tbody', {}, ...users.map((u) => el('tr', {}, el('td', {}, u.username), el('td', {}, u.createdAt),
    el('td', { class: 'actions' }, el('button', { class: 'btn small danger', type: 'button', onclick: async () => {
      if (!confirm(`¿Eliminar al usuario ${u.username}?`)) return;
      try { await api('DELETE', `/api/admin/users/${u.id}`); toast('Usuario eliminado.'); renderUsers().catch(fail); } catch (e) { fail(e); }
    } }, 'Eliminar')))));
  const nu = el('input', { required: true, maxLength: 60, autocomplete: 'off' });
  const np = el('input', { type: 'password', required: true, maxLength: 200, autocomplete: 'new-password' });
  const addForm = el('form', { class: 'card' }, el('h3', {}, 'Nuevo administrador'),
    el('div', { class: 'grid' }, el('label', {}, 'Usuario', nu), el('label', {}, 'Contraseña (mín. 10, letras y números)', np)),
    el('div', { class: 'row' }, el('button', { class: 'btn', type: 'submit' }, 'Crear')));
  addForm.onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('POST', '/api/admin/users', { username: nu.value, password: np.value }); toast('Usuario creado.'); renderUsers().catch(fail); } catch (e) { fail(e); }
  };
  const cur = el('input', { type: 'password', required: true, maxLength: 200, autocomplete: 'current-password' });
  const nxt = el('input', { type: 'password', required: true, maxLength: 200, autocomplete: 'new-password' });
  const pwForm = el('form', { class: 'card' }, el('h3', {}, 'Cambiar mi contraseña'),
    el('div', { class: 'grid' }, el('label', {}, 'Contraseña actual', cur), el('label', {}, 'Contraseña nueva', nxt)),
    el('div', { class: 'row' }, el('button', { class: 'btn', type: 'submit' }, 'Cambiar')));
  pwForm.onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('POST', '/api/admin/password', { current: cur.value, next: nxt.value }); cur.value = ''; nxt.value = ''; toast('Contraseña cambiada.'); } catch (e) { fail(e); }
  };
  $('panel').replaceChildren(el('h2', {}, 'Usuarios administradores'),
    el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Usuario'), el('th', {}, 'Creado'), el('th', {}, ''))), body)),
    el('br'), addForm, pwForm);
};

const TABS = [
  ['specimens', 'Especímenes', () => renderEntity('specimens')], ['publications', 'Publicaciones', () => renderEntity('publications')],
  ['library', 'Biblioteca', () => renderEntity('library')], ['members', 'Integrantes', () => renderEntity('members')],
  ['about', 'Acerca', renderSettings('Acerca', 'Textos de la página «Acerca». Las personas se editan en la pestaña «Integrantes». Si un campo queda vacío, el sitio muestra «pendiente de definir».', ABOUT_FIELDS, () => el('p', {}, el('button', { class: 'btn', type: 'button', onclick: () => openTab('members') }, 'Editar, agregar o eliminar integrantes (personas)')))], ['contact', 'Contacto', renderSettings('Contacto', 'Datos de la página «Contacto». Si un campo queda vacío, el sitio muestra «pendiente de definir».', CONTACT_FIELDS)], ['cifras', 'Cifras', renderCifras], ['users', 'Usuarios', renderUsers],
];

const openTab = (id) => {
  const tab = TABS.find((t) => t[0] === id) || TABS[0];
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab[0]));
  sessionStorage.setItem('adminTab', tab[0]);
  tab[2]().catch(fail);
};

const showLogin = () => { $('app-view').hidden = true; $('login-view').hidden = false; $('login-pass').value = ''; };
const showApp = (username) => {
  $('login-view').hidden = true; $('app-view').hidden = false; $('who').textContent = username;
  $('tabs').replaceChildren(...TABS.map(([id, label]) => el('button', { type: 'button', textContent: label, onclick: () => openTab(id) }, )));
  $('tabs').querySelectorAll('button').forEach((b, i) => { b.dataset.tab = TABS[i][0]; });
  openTab(sessionStorage.getItem('adminTab'));
};

$('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('login-error').textContent = '';
  try {
    await api('POST', '/api/login', { username: $('login-user').value, password: $('login-pass').value });
    showApp((await api('GET', '/api/me')).username);
  } catch (e) { $('login-error').textContent = e.message; }
});
$('logout').addEventListener('click', async () => { try { await api('POST', '/api/logout'); } catch { /* sesión ya cerrada */ } showLogin(); });

api('GET', '/api/me').then((me) => showApp(me.username)).catch(showLogin);
