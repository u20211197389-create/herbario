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
    hint: 'Registros de la colección. El número de catálogo es único; al importar un CSV, los existentes se actualizan. En «Importar CSV» puedes elegir también las fotos (archivos llamados con el número de catálogo, por ejemplo 16513.jpg) y se asignan solas.',
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
      F('isType', 'Es ejemplar tipo', { type: 'bool' }), F('image', 'Imagen del espécimen', { type: 'image', wide: true }), F('hideImage', 'Ocultar foto al público', { type: 'bool' }),
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

const MAX_IMAGE_BYTES = 1_100_000;
// Las imágenes grandes se reducen en el navegador para respetar el límite de almacenamiento del servidor.
const shrinkImage = async (file) => {
  if (file.size <= MAX_IMAGE_BYTES) return file.arrayBuffer();
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  for (let quality = 0.85; quality > 0.3; quality -= 0.1) {
    const canvas = el('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_IMAGE_BYTES) return blob.arrayBuffer();
    scale *= 0.85;
  }
  throw new Error('No se pudo reducir la imagen lo suficiente.');
};

const imageField = (field, value) => {
  const input = el('input', { name: field.name, value: value || '', maxLength: 500, placeholder: '/uploads/… o https://…' });
  const preview = el('img', { class: 'image-preview', alt: 'Vista previa de la imagen', hidden: !value, src: value || '' });
  input.addEventListener('change', () => { preview.src = input.value; preview.hidden = !input.value; });
  preview.addEventListener('click', () => window.open(preview.src, '_blank', 'noopener'));
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const { url } = await api('POST', '/api/admin/upload', undefined, await shrinkImage(f));
      input.value = url; preview.src = url; preview.hidden = false;
    } catch (e) { fail(e); }
  } });
  return el('div', { class: 'wide image-field' }, el('label', {}, field.label, input), file, preview);
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
  const canEdit = canEditEntity(entity);
  const canDelete = canDeleteEntity(entity);
  const label = (name) => section.fields.find((f) => f.name === name)?.label || name;
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = rows.filter((r) => !q || Object.values(r).join(' ').toLowerCase().includes(q));
    body.replaceChildren(...shown.map((r) => {
      const actions = [];
      if (canEdit) actions.push(el('button', { class: 'btn small ghost', type: 'button', onclick: () => openForm(section, r, () => renderEntity(entity).catch(fail)) }, 'Editar'));
      if (canDelete) actions.push(el('button', { class: 'btn small danger', type: 'button', onclick: async () => {
        if (!confirm(`¿Eliminar este ${section.singular}? Esta acción no se puede deshacer.`)) return;
        try { await api('DELETE', `/api/admin/${entity}/${encodeURIComponent(r[section.key])}`); toast('Eliminado.'); renderEntity(entity).catch(fail); } catch (e) { fail(e); }
      } }, 'Eliminar'));
      return el('tr', {},
        ...section.columns.map((c) => el('td', {}, section.fields.find((f) => f.name === c)?.type === 'bool' ? (r[c] ? 'Sí' : '') : String(r[c] ?? ''))),
        el('td', { class: 'actions' }, ...actions));
    }));
    if (!shown.length) body.replaceChildren(el('tr', {}, el('td', { colSpan: section.columns.length + 1, class: 'empty' }, 'Sin registros.')));
    count.textContent = `${shown.length} de ${rows.length}`;
  };
  const count = el('span', { class: 'hint' });
  search.addEventListener('input', draw);

  const importInput = el('input', { type: 'file', accept: entity === 'specimens' ? '.csv,text/csv,image/*' : '.csv,text/csv', multiple: entity === 'specimens', hidden: true, onchange: async () => {
    const files = [...importInput.files];
    importInput.value = '';
    if (!files.length) return;
    try {
      const csv = files.find((f) => /\.csv$/i.test(f.name) || f.type === 'text/csv');
      const photos = files.filter((f) => f !== csv && f.type.startsWith('image/'));
      const parsed = csv ? parseCsv(await csv.text()) : [];
      if (!parsed.length && !photos.length) throw new Error('Selecciona un CSV con filas o fotos nombradas con el número de catálogo.');
      const notes = [];
      const known = new Set(rows.map((r) => String(r.catalogNumber)));
      parsed.forEach((r) => known.add(String(r.catalogNumber ?? '').trim()));
      for (const photo of photos) {
        const code = photo.name.replace(/\.[^.]+$/, '').trim();
        if (!known.has(code)) { notes.push(`Foto ${photo.name}: no hay un espécimen con número de catálogo ${code}.`); continue; }
        try {
          const { url } = await api('POST', '/api/admin/upload', undefined, await shrinkImage(photo));
          const row = parsed.find((r) => String(r.catalogNumber ?? '').trim() === code);
          if (row) row.image = url; else parsed.push({ catalogNumber: code, image: url });
        } catch (e) { notes.push(`Foto ${photo.name}: ${e.message}`); }
      }
      const r = parsed.length ? await api('POST', `/api/admin/${entity}/bulk`, { rows: parsed }) : { created: 0, updated: 0, errors: [] };
      const withPhoto = photos.length - notes.filter((n) => n.startsWith('Foto')).length;
      const summary = `Creados: ${r.created}. Actualizados: ${r.updated}.${photos.length ? ` Fotos asignadas: ${withPhoto}.` : ''}${[...r.errors, ...notes].length ? `\nAvisos:\n${[...r.errors, ...notes].join('\n')}` : ''}`
      toast('Importación terminada.'); await renderEntity(entity);
      const shown = panel.querySelector('pre.log');
      if (shown) { shown.textContent = summary; shown.hidden = false; }
    } catch (e) { fail(e); }
  } });
  const log = el('pre', { class: 'log', hidden: true });
  const names = section.fields.map((f) => f.name);
  const toolbar = [search];
  if (canEdit) {
    toolbar.push(el('button', { class: 'btn', type: 'button', onclick: () => openForm(section, null, () => renderEntity(entity).catch(fail)) }, `+ Nuevo ${section.singular}`));
    toolbar.push(el('button', { class: 'btn ghost', type: 'button', onclick: () => importInput.click() }, 'Importar CSV'));
  }
  toolbar.push(
    el('button', { class: 'btn ghost', type: 'button', onclick: () => download(`${entity}-plantilla.csv`, `${names.join(',')}\n`) }, 'Plantilla CSV'),
    el('button', { class: 'btn ghost', type: 'button', onclick: () => download(`${entity}.csv`, [names.join(','), ...rows.map((r) => names.map((n) => csvCell(String(r[n] ?? ''))).join(','))].join('\n')) }, 'Exportar CSV'),
    importInput, count);
  panel.replaceChildren(
    el('h2', {}, section.title), el('p', { class: 'hint' }, section.hint),
    el('div', { class: 'toolbar' }, ...toolbar),
    el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ...section.columns.map((c) => el('th', {}, label(c))), el('th', {}, ''))), body)),
    log,
  );
  draw();
};

const ABOUT_FIELDS = [
  ['aboutIntro', 'Introducción (párrafo inicial)', 'area'],
  ['history', 'Reseña histórica', 'area'], ['terms', 'Términos de uso', 'area'],
];
const CONTACT_FIELDS = [
  ['address', 'Dirección', 'text'], ['mapLink', 'Mapa', 'map'],
];

const mapPreviewSrc = (value) => {
  const v = (value || '').trim() || 'Universidad Surcolombiana sede Neiva';
  const embed = (q) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;
  if (!/^https?:/i.test(v)) return embed(v);
  try {
    const url = new URL(v);
    if (!/^(www\.|maps\.)?google\.com$/.test(url.hostname) || !url.pathname.startsWith('/maps')) return '';
    if (url.pathname.startsWith('/maps/embed')) return v;
    const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
    const coords = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const q = url.searchParams.get('q') || url.searchParams.get('query') || (place && decodeURIComponent(place[1].replace(/\+/g, ' '))) || (coords && `${coords[1]},${coords[2]}`);
    return q ? embed(q) : '';
  } catch { return ''; }
};
const mapField = (key, label, value) => {
  const input = el('input', { value: value && value !== '-' ? value : '', maxLength: 500, placeholder: 'Nombre del lugar o enlace de Google Maps' });
  const hidden = el('p', { class: 'hint' }, 'El mapa está oculto en la página «Contacto».');
  const frame = el('iframe', { class: 'map-preview', title: 'Vista previa del mapa', referrerpolicy: 'no-referrer-when-downgrade' });
  const state = { off: value === '-' };
  const sync = () => {
    const src = state.off ? '' : mapPreviewSrc(input.value);
    frame.hidden = !src; hidden.hidden = !state.off;
    if (src && frame.src !== src) frame.src = src;
    if (!state.off && !src) toast('Ese enlace no se reconoce: use un enlace largo de google.com/maps o escriba el nombre del lugar.');
  };
  input.addEventListener('change', () => { state.off = false; sync(); });
  // Sugerencias de lugares mientras se escribe (si hay varios con el mismo nombre, se elige uno).
  const list = el('ul', { class: 'place-list', hidden: true });
  let timer; let seq = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3 || /^https?:/i.test(q)) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const places = await api('GET', `/api/admin/places?q=${encodeURIComponent(q)}`);
        if (mine !== seq) return;
        list.replaceChildren(...(places.length ? places.map((p) => el('li', {}, el('button', { type: 'button', onclick: () => {
          input.value = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
          list.hidden = true; state.off = false; sync();
          toast('Lugar seleccionado. Pulse «Guardar» para publicarlo.');
        } }, p.name))) : [el('li', { class: 'hint' }, 'Sin resultados. Pruebe con otro nombre o agregue la ciudad.')]));
        list.hidden = false;
      } catch { list.hidden = true; }
    }, 450);
  });
  const wrap = el('div', { class: 'map-field' },
    el('label', {}, label, input), list,
    el('p', { class: 'hint' }, 'Escriba el nombre del lugar y elija uno de la lista, o pegue un enlace de Google Maps (google.com/maps…). Vacío = mapa de la Universidad. Los enlaces cortos (maps.app.goo.gl) no funcionan: ábralo y copie la dirección larga.'),
    el('div', { class: 'row' },
      el('button', { class: 'btn small', type: 'button', onclick: () => { state.off = false; input.value = ''; sync(); } }, 'Restablecer mapa original'),
      el('button', { class: 'btn small danger', type: 'button', onclick: () => { state.off = true; sync(); } }, 'Quitar mapa')),
    hidden, frame);
  sync();
  return { wrap, get: () => (state.off ? '-' : input.value.trim()) };
};// Cada formulario guarda solo sus propios campos; el servidor no toca los demás.
const renderSettings = (title, hint, fields, extra) => async () => {
  const data = await api('GET', '/api/admin/settings');
  if (fields.some(([k]) => !data[k])) {
    // Los campos vacíos se rellenan con el texto que el sitio público muestra por defecto.
    try {
      const doc = new DOMParser().parseFromString(await (await fetch('/')).text(), 'text/html');
      for (const [k] of fields) {
        const n = doc.querySelector('[data-setting="' + k + '"]');
        if (!data[k] && n && !n.classList.contains('pending')) data[k] = n.textContent.trim();
      }
    } catch { /* se deja vacío */ }
  }
  if (!isAdmin()) {
    const cards = fields.map(([key, label]) => el('div', { class: 'card' }, el('h3', {}, label), el('p', {}, data[key] || 'Sin información.')));
    $('panel').replaceChildren(el('h2', {}, title), el('p', { class: 'hint' }, hint), extra ? extra() : '', ...cards);
    return;
  }
  const inputs = {};
  const form = el('form', { class: 'card' });
  for (const [key, label, type] of fields) {
    if (type === 'map') { const m = mapField(key, label, data[key]); form.append(m.wrap); inputs[key] = m.get; continue; }
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
  const body = el('tbody', {}, ...users.map((u) => el('tr', {}, el('td', {}, u.displayName ? u.displayName + ' (' + u.username + ')' : u.username), el('td', {}, ROLE_LABELS[u.role] || 'Administrador'), el('td', {}, u.createdAt),
    el('td', { class: 'actions' }, el('button', { class: 'btn small', type: 'button', onclick: () => openProfile(u, true) }, 'Editar'), ' ', el('button', { class: 'btn small danger', type: 'button', onclick: async () => {
      if (!confirm(`¿Eliminar al usuario ${u.username}?`)) return;
      try { await api('DELETE', `/api/admin/users/${u.id}`); toast('Usuario eliminado.'); renderUsers().catch(fail); } catch (e) { fail(e); }
    } }, 'Eliminar')))));
  const nu = el('input', { required: true, maxLength: 60, autocomplete: 'off' });
  const np = el('input', { type: 'password', required: true, maxLength: 200, autocomplete: 'new-password' });
  const role = el('select', {}, ...Object.entries(ROLE_LABELS).map(([value, label]) => el('option', { value }, label)));
  const addForm = el('form', { class: 'card' }, el('h3', {}, 'Nuevo usuario'),
    el('div', { class: 'grid' }, el('label', {}, 'Correo o nombre de usuario', nu), el('label', {}, 'Tipo de usuario', role), el('label', {}, 'Contraseña (mín. 10, letras y números)', np)),
    el('div', { class: 'row' }, el('button', { class: 'btn', type: 'submit' }, 'Crear')));
  addForm.onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('POST', '/api/admin/users', { username: nu.value, password: np.value, role: role.value }); toast('Usuario creado.'); renderUsers().catch(fail); } catch (e) { fail(e); }
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
  $('panel').replaceChildren(el('h2', {}, 'Usuarios'),
    el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Correo o usuario'), el('th', {}, 'Tipo'), el('th', {}, 'Creado'), el('th', {}, ''))), body)),
    el('br'), addForm, pwForm);
};

let requestFilter = 'todas';
const renderRequests = async () => {
  const editable = isAdmin();
  const all = await api('GET', '/api/admin/solicitudes');
  const rows = requestFilter === 'todas' ? all : all.filter((r) => r.kind === requestFilter);
  const pending = all.filter((r) => r.status === 'pendiente').length;
  const decide = async (id, status) => {
    try {
      const out = await api('PATCH', `/api/admin/solicitudes/${id}`, { status });
      const decision = status === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada';
      if (out.mailSent) toast(`${decision}. Se envió el correo al solicitante.`);
      else {
        toast(`${decision}. No se pudo enviar el correo automáticamente${out.mailError ? `: ${out.mailError}` : ' (falta configurar SMTP)'}; se abrirá su programa de correo.`);
        const { to, subject, text } = out.mail;
        window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      }
      renderRequests().catch(fail);
    } catch (e) { fail(e); }
  };
  const linkCell = (r) => {
    if (r.status !== 'aprobada' || !r.token) return el('td', {}, '—');
    const expired = r.expiresAt < Date.now();
    const link = `${location.origin}/ejemplar/${encodeURIComponent(r.catalogNumber)}/?acceso=${r.token}`;
    const input = el('input', { readOnly: true, value: link });
    const copy = el('button', { class: 'btn small', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(link); } catch { input.select(); document.execCommand('copy'); }
      toast('Enlace copiado.');
    } }, 'Copiar');
    return el('td', {}, expired ? `Venció ${new Date(r.expiresAt).toLocaleDateString()}` : el('div', { class: 'row' }, input, copy));
  };
  const body = el('tbody', {}, ...rows.map((r) => {
    const actions = editable ? [
      ...(r.status === 'pendiente' ? [el('button', { class: 'btn small', type: 'button', onclick: () => decide(r.id, 'aprobada') }, 'Aprobar'), el('button', { class: 'btn small danger', type: 'button', onclick: () => decide(r.id, 'rechazada') }, 'Rechazar')] : []),
      el('button', { class: 'btn small danger', type: 'button', onclick: async () => {
        if (!confirm('¿Eliminar esta solicitud?')) return;
        try { await api('DELETE', `/api/admin/solicitudes/${r.id}`); renderRequests().catch(fail); } catch (e) { fail(e); }
      } }, 'Eliminar'),
    ] : [];
    return el('tr', {}, el('td', {}, r.createdAt), el('td', {}, `${r.kind === 'descarga' ? 'Descarga: ' : 'Imagen: '}${r.catalogNumber}`), el('td', {}, r.email), el('td', {}, r.reason),
      el('td', {}, r.status), linkCell(r), el('td', { class: 'actions' }, ...actions));
  }));
  $('panel').replaceChildren(el('h2', {}, 'Solicitudes de imagen y descarga'),
    el('div', { class: 'row' },
      el('label', {}, 'Mostrar ', el('select', { onchange: (ev) => { requestFilter = ev.target.value; renderRequests().catch(fail); } },
        ...[['todas', 'Todas'], ['descarga', 'Solicitudes de descarga'], ['imagen', 'Solicitudes de imagen']].map(([v, l]) => el('option', { value: v, selected: v === requestFilter }, l)))),
      el('strong', {}, `Pendientes: ${pending} · Total: ${all.length}`)),
      el('p', {}, 'Al aprobar o rechazar, el sistema envía un correo al solicitante (si el SMTP está configurado; si no, se abre su programa de correo con el mensaje listo). Imagen: el correo incluye un enlace privado válido 7 días. Descarga: envíe usted el archivo en un mensaje aparte.'),
    rows.length ? el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ...['Fecha', 'Ejemplar', 'Correo', 'Motivo', 'Estado', 'Enlace', ''].map((h) => el('th', {}, h)))), body)) : el('p', {}, 'No hay solicitudes.'));
};

const renderServices = async () => {
  const data = await api('GET', '/api/admin/settings');
  let text = data.tourText || '';
  let images = (data.tourImages || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!text || !images.length) {
    // Si aún no se ha personalizado, se parte del contenido actual de la página pública.
    try {
      const doc = new DOMParser().parseFromString(await (await fetch('/tour-cientifico/')).text(), 'text/html');
      if (!text) text = [...doc.querySelectorAll('.tour-info > *')].map((n) => (n.tagName === 'H3' ? '## ' : n.classList.contains('tour-note') ? '> ' : '') + n.textContent.trim()).join('\n\n');
      if (!images.length) images = [...doc.querySelectorAll('#tour-track img')].map((i) => i.getAttribute('src'));
    } catch { /* sin contenido inicial */ }
  }
  const area = el('textarea', { class: 'tour-text', value: text, maxLength: 20000, rows: 18 });
  if (!isAdmin()) area.disabled = true;
  const grid = el('div', { class: 'tour-admin-grid' });
  const draw = () => {
    grid.replaceChildren(...images.map((src, i) => el('figure', {},
      el('img', { src, alt: `Foto ${i + 1}`, loading: 'lazy' }),
      isAdmin() ? el('div', { class: 'tour-admin-actions' },
        el('button', { class: 'btn small', type: 'button', title: 'Mover antes', disabled: i === 0, onclick: () => { [images[i - 1], images[i]] = [images[i], images[i - 1]]; draw(); } }, '←'),
        el('button', { class: 'btn small', type: 'button', title: 'Mover después', disabled: i === images.length - 1, onclick: () => { [images[i + 1], images[i]] = [images[i], images[i + 1]]; draw(); } }, '→'),
        el('button', { class: 'btn small danger', type: 'button', onclick: () => { images.splice(i, 1); draw(); } }, 'Eliminar')) : null)));
    if (!images.length) grid.append(el('p', { class: 'hint' }, 'Sin imágenes: la página pública mostrará las fotos originales del tour.'));
  };
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, disabled: !isAdmin(), onchange: async () => {
    try {
      for (const f of file.files) {
        const { url } = await api('POST', '/api/admin/upload', undefined, await shrinkImage(f));
        images.push(url);
      }
      draw();
    } catch (e) { fail(e); }
    file.value = '';
  } });
  draw();
  const save = isAdmin() ? el('button', { class: 'btn', type: 'button', onclick: async () => {
    try { await api('PUT', '/api/admin/settings', { tourText: area.value, tourImages: images.join('\n') }); toast('Guardado.'); } catch (e) { fail(e); }
  } }, 'Guardar cambios') : null;
  $('panel').replaceChildren(el('h2', {}, 'Servicios'),
    el('p', { class: 'hint' }, 'Contenido de la página «Tour científico» (Servicios → Ver el tour).'),
    el('div', { class: 'card' },
      el('h3', {}, 'Texto'),
      el('p', { class: 'hint' }, 'Separe los párrafos con una línea en blanco. Una línea que empiece con «## » es un subtítulo y una que empiece con «> » es un recuadro destacado. El primer párrafo se muestra como frase de introducción.'),
      area),
    el('div', { class: 'card' },
      el('h3', {}, 'Imágenes del carrusel'),
      el('p', { class: 'hint' }, 'Agregue fotos, elimine las que no quiera y cambie el orden con las flechas. Recuerde pulsar «Guardar cambios».'),
      grid, el('label', {}, 'Agregar imágenes', file)),
    el('div', { class: 'row' }, save));
};
const TABS = [
  ['specimens', 'Especímenes', () => renderEntity('specimens')], ['publications', 'Publicaciones', () => renderEntity('publications')],
  ['library', 'Biblioteca', () => renderEntity('library')], ['members', 'Integrantes', () => renderEntity('members')],
  ['about', 'Acerca', renderSettings('Acerca', 'Textos de la página «Acerca». Las personas se editan en la pestaña «Integrantes». Si un campo queda vacío, el sitio muestra «pendiente de definir».', ABOUT_FIELDS, () => el('p', {}, el('button', { class: 'btn', type: 'button', onclick: () => openTab('members') }, 'Editar, agregar o eliminar integrantes (personas)')))], ['services', 'Servicios', renderServices], ['contact', 'Contacto', renderSettings('Contacto', 'Datos de la página «Contacto». Si un campo queda vacío, el sitio muestra «pendiente de definir».', CONTACT_FIELDS)], ['requests', 'Solicitudes', renderRequests], ['cifras', 'Cifras', renderCifras], ['users', 'Usuarios', renderUsers],
];

const openTab = (id) => {
  const available = visibleTabs();
  const tab = available.find((t) => t[0] === id) || available[0];
  if (!tab) return;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab[0]));
  sessionStorage.setItem('adminTab', tab[0]);
  tab[2]().catch(fail);
};

const showLogin = () => { $('app-view').hidden = true; $('login-view').hidden = false; $('login-pass').value = ''; };
let me = {};
const ROLE_LABELS = { administrador: 'Administrador', curador: 'Curador', pasante: 'Pasante', auxiliar: 'Auxiliar', monitor: 'Monitor' };
const isAdmin = () => me.role === 'administrador';
const canEditEntity = (entity) => isAdmin() || (entity === 'specimens' && ['curador', 'pasante', 'auxiliar'].includes(me.role));
const canDeleteEntity = (entity) => isAdmin() || (entity === 'specimens' && me.role === 'curador');
const visibleTabs = () => TABS.filter(([id]) => isAdmin()
  || me.role === 'curador' && id !== 'users'
  || ['pasante', 'auxiliar', 'monitor'].includes(me.role) && id === 'specimens');
const paintAvatar = (node, text) => {
  node.replaceChildren(me.avatar ? el('img', { src: me.avatar, alt: '' }) : text);
};
const applyProfile = () => {
  const shown = me.displayName || me.username || '?';
  $('who').textContent = shown;
  $('role-label').textContent = ROLE_LABELS[me.role] || 'Administrador';
  const ini = shown.charAt(0).toUpperCase();
  paintAvatar($('avatar'), ini); paintAvatar($('avatar2'), ini);
};
const showApp = (profile) => {
  me = profile;
  if (!ROLE_LABELS[me.role]) me.role = 'administrador';
  $('login-view').hidden = true; $('app-view').hidden = false;
  applyProfile();
  const tabs = visibleTabs().map(([id, label]) => {
    const button = el('button', { type: 'button', textContent: label, onclick: () => openTab(id) });
    button.dataset.tab = id;
    return button;
  });
  $('tabs').replaceChildren(...tabs);
  openTab(sessionStorage.getItem('adminTab'));
};

$('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('login-error').textContent = '';
  try {
    await api('POST', '/api/login', { username: $('login-user').value, password: $('login-pass').value });
    showApp(await api('GET', '/api/me'));
  } catch (e) { $('login-error').textContent = e.message; }
});

// La foto se recorta a un cuadrado de 160 px y se guarda dentro del perfil (unos 10 KB).
const avatarFromFile = async (file) => {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = el('canvas');
  canvas.width = canvas.height = 160;
  canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 160, 160);
  return canvas.toDataURL('image/jpeg', 0.85);
};

const openProfile = (target = me, managed = false) => {
  let avatar = target.avatar || '';
  const preview = el('span', { class: 'avatar xl' });
  const refresh = () => {
    const name = (user.value || target.username || '?').charAt(0).toUpperCase();
    preview.replaceChildren(avatar ? el('img', { src: avatar, alt: '' }) : name);
    remove.hidden = !avatar;
  };
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  const remove = el('button', { class: 'btn ghost', type: 'button', onclick: () => { avatar = ''; file.value = ''; refresh(); } }, 'Quitar foto');
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try { avatar = await avatarFromFile(file.files[0]); refresh(); } catch { toast('No se pudo leer la imagen.', true); }
  });
  const user = el('input', { name: 'username', type: 'email', value: target.username, required: true, maxLength: 60, autocomplete: 'username', placeholder: 'correo@usco.edu.co' });
  const dname = el('input', { name: 'displayName', value: target.displayName || '', maxLength: 80, placeholder: 'Ej: Juan Pérez' });
  user.addEventListener('input', refresh);
  const roleSel = el('select', {}, ...Object.entries(ROLE_LABELS).map(([value, label]) => el('option', { value, selected: value === target.role }, label)));
  const curPass = el('input', { type: 'password', maxLength: 200, autocomplete: 'current-password' });
  const newPass = el('input', { type: 'password', maxLength: 200, autocomplete: 'new-password' });
  const passFields = managed
    ? [el('label', {}, 'Tipo de usuario', roleSel), el('label', {}, 'Nueva contraseña (dejar vacío para no cambiarla)', newPass)]
    : [el('label', {}, 'Contraseña actual (solo si desea cambiarla)', curPass), el('label', {}, 'Contraseña nueva (mín. 10, letras y números)', newPass)];
  editorForm.replaceChildren(
    el('h2', {}, managed ? 'Editar usuario' : 'Editar perfil'),
    el('div', { class: 'profile-photo' }, preview, el('div', {}, el('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Cambiar foto'), ' ', remove, el('small', {}, 'Se recorta en cuadrado. PNG, JPG o WEBP.')), file),
    el('label', {}, 'Nombre para mostrar', dname),
    el('label', {}, 'Correo (para ingresar)', user),
    ...passFields,
    el('div', { class: 'actions' },
      el('button', { class: 'btn ghost', type: 'button', onclick: () => editor.close() }, 'Cancelar'),
      el('button', { class: 'btn', type: 'submit' }, 'Guardar')),
  );
  editorForm.onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const data = { username: user.value, displayName: dname.value, email: user.value, avatar };
      if (managed) {
        await api('PUT', `/api/admin/users/${target.id}`, { ...data, role: roleSel.value, password: newPass.value });
        editor.close(); toast('Usuario actualizado.'); renderUsers().catch(fail); return;
      }
      if (newPass.value && !curPass.value) throw new Error('Escriba su contraseña actual para cambiarla.');
      const saved = await api('PUT', '/api/admin/profile', data);
      if (newPass.value) await api('POST', '/api/admin/password', { current: curPass.value, next: newPass.value });
      me = { ...me, ...saved }; applyProfile(); editor.close(); toast('Perfil actualizado.');
    } catch (e) { fail(e); }
  };
  refresh();
  editor.showModal();
};
$('menu-profile').addEventListener('click', () => { closeUserMenu(); openProfile(); });
const closeUserMenu = () => { $('user-pop').hidden = true; $('user-btn').setAttribute('aria-expanded', 'false'); };
$('user-btn').addEventListener('click', (e) => { e.stopPropagation(); const open = $('user-pop').hidden; $('user-pop').hidden = !open; $('user-btn').setAttribute('aria-expanded', String(open)); });
document.addEventListener('click', (e) => { if (!e.target.closest('.usermenu')) closeUserMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUserMenu(); });
$('menu-pass').addEventListener('click', () => { closeUserMenu(); openProfile(); });
$('logout').addEventListener('click', async () => { closeUserMenu(); try { await api('POST', '/api/logout'); } catch { /* sesión ya cerrada */ } showLogin(); });

function addPasswordToggles(root) {
  root.querySelectorAll('input[type="password"]:not([data-toggle])').forEach((inp) => {
    inp.dataset.toggle = '1';
    const wrap = document.createElement('span');
    wrap.className = 'pass-wrap';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pass-toggle';
    const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    const sync = () => {
      const show = inp.type === 'text';
      btn.innerHTML = show ? EYE : EYE_OFF;
      btn.title = show ? 'Ocultar contraseña' : 'Mostrar contraseña';
      btn.setAttribute('aria-label', btn.title);
      btn.hidden = inp.value === '';
      if (inp.value === '') inp.type = 'password';
    };
    btn.addEventListener('click', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; sync(); inp.focus(); });
    inp.addEventListener('input', sync);
    wrap.appendChild(btn);
    sync();
  });
}
addPasswordToggles(document);
new MutationObserver(() => addPasswordToggles(document)).observe(document.body, { childList: true, subtree: true });

api('GET', '/api/me').then((p) => showApp(p)).catch(showLogin);
