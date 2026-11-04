// Definición de entidades y validación, compartida por el servidor Node y el Worker de Cloudflare.
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

export const SETTING_KEYS = ['aboutIntro', 'mission', 'founderText', 'founderPhoto', 'history', 'terms', 'phone', 'address', 'tourText', 'tourImages', 'mapLink'];

export const DEFAULT_MEMBERS = [
  ['Director(a)', 'Nombre pendiente', 'dirige el herbario, autoriza los servicios y representa a la colección ante la universidad.'],
  ['Curador(a)', 'Nombre pendiente', 'cuida la colección, verifica la identificación taxonómica y revisa los registros de los ejemplares.'],
  ['Auxiliar de colección', 'Nombre pendiente', 'prepara, seca, etiqueta y organiza el material botánico, y registra los datos de colecta.'],
  ['Investigadores y estudiantes', 'Nombres pendientes', 'realizan colectas y proyectos de investigación, y apoyan las actividades del herbario.'],
];

export const columns = (e) => e.fields.map((x) => `"${x.name}" ${x.type === 'int' || x.type === 'bool' ? 'INTEGER' : 'TEXT'}`);

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

export const passwordProblem = (password) => {
  if (typeof password !== 'string' || password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (password.length > 200) return 'La contraseña es demasiado larga.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'La contraseña debe incluir letras y números.';
  return null;
};

export const requiredError = (entityName, value) => {
  if (entityName === 'specimens' && !value.catalogNumber) return 'El número de catálogo es obligatorio.';
  if (entityName === 'publications' && !value.name) return 'El nombre es obligatorio.';
  if (entityName === 'library' && !value.title) return 'El título es obligatorio.';
  if (entityName === 'members' && !value.role) return 'El cargo es obligatorio.';
  return null;
};
