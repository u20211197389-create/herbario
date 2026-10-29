'use strict';

const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.primary-navigation');
const catalogSearch = document.querySelector('#catalog-search');
const catalogQuery = document.querySelector('#catalog-query');
const advancedForm = document.querySelector('#advanced-form');
const queryDescription = document.querySelector('#query-description');
const searchFeedback = document.querySelector('#search-feedback');
const specimenResults = document.querySelector('#specimen-results');
const downloadButton = document.querySelector('#download-csv');
const detailTitle = document.querySelector('#detail-title');
const detailBody = document.querySelector('#detail-body');
const views = document.querySelectorAll('.view');
const menuLinks = document.querySelectorAll('.primary-navigation a');

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  catalog: 'M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5Z M12 6v13.5',
  plant: 'M5 19C4 10 9 5 20 4c0 11-5 16-14 15Zm0 0 8-8',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-4 3-6 7-6s7 2 7 6',
  pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
};

const downloadDialog = document.querySelector('#download-dialog');
const downloadChoice = document.querySelector('#download-choice');
let currentResults = herbariumSpecimens;
let currentDescription = 'Todos los ejemplares';


const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es');

const contains = (value, term) => !term || normalize(value).includes(normalize(term));

const createElement = (tagName, className, text) => {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const createIcon = (name) => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name]);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  return svg;
};

const createLine = (icon, text, className = '') => {
  const line = createElement('div', `specimen-line ${className}`.trim());
  line.append(createIcon(icon), createElement('span', '', text));
  return line;
};

const catalogLabel = (specimen) => `SURCO${String(specimen.catalogNumber).padStart(6, '0')}`;
const collectorLabel = (specimen) => `${specimen.collectors.split(',')[0].trim()} ${specimen.collectionNumber}`;
const placeLabel = (specimen) => [specimen.country, specimen.department, specimen.municipality].filter(Boolean).join(', ');

const specimenPicture = (specimen, className, size) => {
  if (!specimen.image) return createElement('div', className, 'Sin imagen');
  const box = createElement('div', `${className} has-image`);
  const img = document.createElement('img');
  img.src = specimen.image;
  img.alt = `Fotografía del ejemplar ${catalogLabel(specimen)}`;
  img.loading = size === 'card' ? 'lazy' : 'eager';
  box.append(img);
  return box;
};

const renderResults = () => {
  specimenResults.replaceChildren();
  queryDescription.replaceChildren(createElement('strong', '', 'Consulta por '), document.createTextNode(currentDescription));
  const count = currentResults.length;
  searchFeedback.replaceChildren(createElement('strong', '', String(count)), document.createTextNode(count === 1 ? ' registro' : ' registros'));
  downloadButton.disabled = count === 0;

  if (count === 0) {
    specimenResults.append(createElement('p', 'catalog-empty', 'No encontramos ejemplares con ese criterio. Prueba otro nombre, familia o lugar.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  currentResults.forEach((specimen) => {
    const card = createElement('a', 'specimen-card');
    card.href = `/ejemplar/${encodeURIComponent(specimen.catalogNumber)}/`;
    card.append(
      specimenPicture(specimen, 'no-image', 'card'),
      createLine('catalog', catalogLabel(specimen), 'is-id'),
      createLine('plant', specimen.scientificName),
      createLine('person', collectorLabel(specimen)),
      createLine('pin', placeLabel(specimen)),
    );
    fragment.append(card);
  });
  specimenResults.append(fragment);
};

const renderDetail = (specimen) => {
  detailTitle.textContent = catalogLabel(specimen);
  detailBody.replaceChildren();

  const name = createElement('p', 'detail-name');
  const scientific = createElement('em', '', specimen.scientificName);
  scientific.style.fontWeight = '700';
  name.append(
    createElement('span', 'family', `(${specimen.family})`),
    scientific,
    document.createTextNode(` ${specimen.authorship ?? ''}`),
  );

  const changes = createElement('a', 'btn-changes', '¿Cambios al ejemplar?');
  changes.href = `mailto:herbario@usco.edu.co?subject=${encodeURIComponent(`Cambios al ejemplar ${catalogLabel(specimen)}`)}`;

  const list = createElement('dl', 'detail-list');
  const addRow = (label, value, className = '') => {
    const row = createElement('div', `detail-row ${className}`.trim());
    row.append(createElement('dt', '', label), createElement('dd', '', value));
    list.append(row);
  };
  addRow('Determinado por:', specimen.identifiedBy || '—');
  addRow('Colectado por:', collectorLabel(specimen));
  addRow('Fecha de colecta:', specimen.collectedAt);
  addRow('Colectado en:', [placeLabel(specimen), specimen.locality].filter(Boolean).join('. '), 'split');
  if (specimen.habitat) addRow('Hábitat:', specimen.habitat);
  if (specimen.habit) addRow('Hábito:', specimen.habit);
  if (specimen.reproductiveCondition) addRow('Condición:', specimen.reproductiveCondition);

  const download = createElement('button', 'btn-download is-secondary', 'Descargar este ejemplar (XLSX)');
  download.type = 'button';
  download.addEventListener('click', () => downloadXlsx([specimen]));

  const info = createElement('div');
  info.append(name, changes, download, list);
  detailBody.append(specimenPicture(specimen, 'detail-image', 'detail'), info);
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes) => {
  let crc = 0xFFFFFFFF;
  bytes.forEach((byte) => { crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8); });
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

// ZIP sin compresión: suficiente para un .xlsx pequeño sin dependencias externas.
const buildZip = (files) => {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034B50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014B50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  });

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

const escapeXml = (value) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const columnName = (index) => String.fromCharCode(65 + index);

const downloadXlsx = (list) => {
  const columns = [
    ['Número de catálogo', 'catalogNumber'], ['Nombre científico', 'scientificName'], ['Autoría', 'authorship'],
    ['Familia', 'family'], ['Género', 'genus'], ['País', 'country'], ['Departamento', 'department'],
    ['Municipio', 'municipality'], ['Localidad', 'locality'], ['Fecha de colecta', 'collectedAt'],
    ['Colectores', 'collectors'], ['Número de colector', 'collectionNumber'], ['Hábito', 'habit'],
  ];
  const cell = (value, column, row) => `<c r="${columnName(column)}${row}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
  const rowXml = (values, row) => `<row r="${row}">${values.map((value, column) => cell(value, column, row)).join('')}</row>`;
  const rows = [rowXml(columns.map(([label]) => label), 1)]
    .concat(list.map((specimen, index) => rowXml(columns.map(([, key]) => specimen[key]), index + 2)));

  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const officeRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  const blob = buildZip([
    {
      name: '[Content_Types].xml',
      content: `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      content: `${xml}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `${xml}<workbook xmlns="${ns}" xmlns:r="${officeRel}"><sheets><sheet name="Especímenes" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `${xml}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: `${xml}<worksheet xmlns="${ns}"><sheetData>${rows.join('')}</sheetData></worksheet>`,
    },
  ]);

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'especimenes-herbario-surco.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
};

const VIEW_PATHS = ['especimenes', 'busqueda-avanzada', 'acerca', 'cifras', 'servicios', 'biblioteca', 'publicaciones', 'contacto'];
const toPath = (route) => (route === 'inicio' ? '/' : `/${route}/`);

// Los enlaces internos del HTML se escriben como #vista y aquí se convierten en rutas limpias (/vista/).
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  const route = link.getAttribute('href').slice(1);
  if (route === 'inicio' || VIEW_PATHS.includes(route)) link.setAttribute('href', toPath(route));
});

const currentRoute = () => {
  const legacy = decodeURIComponent(window.location.hash.slice(1));
  if (legacy && (legacy === 'inicio' || VIEW_PATHS.includes(legacy) || legacy.startsWith('ejemplar/'))) {
    window.history.replaceState({}, '', toPath(legacy.startsWith('ejemplar/') ? legacy : legacy));
  }
  return decodeURIComponent(window.location.pathname).replace(/^\/+|\/+$/g, '') || 'inicio';
};

const navigate = (path) => {
  if (path !== window.location.pathname) window.history.pushState({}, '', path);
  showView();
};

const showView = () => {
  const hash = currentRoute();
  let current = hash;
  let detailSpecimen = null;

  if (hash.startsWith('ejemplar/')) {
    current = 'ejemplar';
    detailSpecimen = herbariumSpecimens.find((specimen) => specimen.catalogNumber === hash.slice('ejemplar/'.length));
    if (!detailSpecimen) current = 'especimenes';
  }
  if (![...views].some((view) => view.dataset.view === current)) current = 'inicio';

  if (detailSpecimen) renderDetail(detailSpecimen);
  views.forEach((view) => { view.hidden = view.dataset.view !== current; });
  const activeMenu = current === 'ejemplar' || current === 'busqueda-avanzada' ? 'especimenes' : current === 'biblioteca' ? 'servicios' : current;
  menuLinks.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === toPath(activeMenu)));
  window.scrollTo(0, 0);
};

const showResults = (results, description) => {
  currentResults = results;
  currentDescription = description;
  renderResults();
  if (window.location.pathname === '/especimenes/') {
    showView();
  } else {
    navigate('/especimenes/');
  }
};

const FIELD_LABELS = {
  catalogNumber: 'Número de catálogo', family: 'Familia', genus: 'Género', species: 'Especie', country: 'País',
  department: 'Departamento', municipality: 'Municipio', locality: 'Localidad', minAltitude: 'Altura mínima',
  maxAltitude: 'Altura máxima', collectors: 'Colector', collectionNumber: 'Número de colector',
  habit: 'Hábito', commonName: 'Nombre común',
};

const runAdvancedSearch = () => {
  const data = Object.fromEntries(new FormData(advancedForm));
  const text = (key) => String(data[key] ?? '').trim();
  const catalogTerm = text('catalogNumber').replace(/^0+(?=\d)/, '');

  const matches = herbariumSpecimens.filter((specimen) => (
    (!catalogTerm || String(specimen.catalogNumber).replace(/^0+/, '') === catalogTerm)
    && contains(specimen.family, text('family'))
    && contains(specimen.genus, text('genus'))
    && contains(specimen.scientificName.split(' ').slice(1).join(' '), text('species'))
    && contains(specimen.country, text('country'))
    && contains(specimen.department, text('department'))
    && contains(specimen.municipality, text('municipality'))
    && contains(specimen.locality, text('locality'))
    && contains(specimen.collectors, text('collectors'))
    && contains(specimen.collectionNumber, text('collectionNumber'))
    && (!text('habit') || specimen.habit === text('habit'))
    && contains(specimen.commonName, text('commonName'))
    && (!text('minAltitude') || Number(specimen.maxAltitude ?? specimen.minAltitude) >= Number(text('minAltitude')))
    && (!text('maxAltitude') || Number(specimen.minAltitude ?? specimen.maxAltitude) <= Number(text('maxAltitude')))
  ));

  const used = Object.keys(FIELD_LABELS).filter((key) => text(key));
  showResults(
    matches,
    used.length ? used.map((key) => `${FIELD_LABELS[key]}: ${text(key)}`).join(' · ') : 'Todos los ejemplares',
  );
};

const quickSearch = () => {
  const query = catalogQuery.value.trim();
  const matches = herbariumSpecimens.filter((specimen) => contains(
    [
      specimen.catalogNumber, specimen.collectionNumber, specimen.identification, specimen.scientificName,
      specimen.authorship, specimen.rank, specimen.family, specimen.genus, specimen.habitat, specimen.habit,
      specimen.reproductiveCondition, specimen.country, specimen.department, specimen.municipality,
      specimen.locality, specimen.collectors, specimen.identifiedBy,
    ].join(' '),
    query,
  ));
  showResults(matches, query ? `Nombre científico: ${query}` : 'Todos los ejemplares');
};

[...new Set(herbariumSpecimens.map((specimen) => specimen.habit).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'es'))
  .forEach((habit) => advancedForm.elements.habit.append(new Option(habit, habit)));

menuToggle.addEventListener('click', () => {
  const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isExpanded));
  navigation.classList.toggle('is-open', !isExpanded);
});

navigation.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  navigation.classList.remove('is-open');
  if (link.getAttribute('href') === '/especimenes/') {
    currentResults = herbariumSpecimens;
    currentDescription = 'Todos los ejemplares';
    renderResults();
  }
});

catalogSearch.addEventListener('submit', (event) => {
  event.preventDefault();
  quickSearch();
});

advancedForm.addEventListener('submit', (event) => {
  event.preventDefault();
  runAdvancedSearch();
});

downloadButton.addEventListener('click', () => {
  downloadChoice.replaceChildren();
  currentResults.forEach((specimen) => {
    downloadChoice.append(new Option(`${catalogLabel(specimen)} · ${specimen.scientificName}`, specimen.catalogNumber));
  });
  downloadDialog.querySelector('.dialog-all-count').textContent = String(currentResults.length);
  downloadDialog.showModal();
});

downloadDialog.querySelector('#dialog-all').addEventListener('click', () => {
  downloadXlsx(currentResults);
  downloadDialog.close();
});

downloadDialog.querySelector('#dialog-one').addEventListener('click', () => {
  const specimen = currentResults.find((item) => item.catalogNumber === downloadChoice.value);
  if (specimen) downloadXlsx([specimen]);
  downloadDialog.close();
});

downloadDialog.querySelector('#dialog-cancel').addEventListener('click', () => downloadDialog.close());

const renderStats = () => {
  const list = herbariumSpecimens;
  const total = list.length;
  const $ = (id) => document.getElementById(id);
  const distinct = (items) => new Set(items.filter(Boolean)).size;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const isCoord = (v) => /^\s*-?\d+(?:[.,]\d+)?\s*°/.test(v || '') || /^-?\d+[.,]\d+$/.test((v || '').trim());
  const georef = list.filter((s) => isCoord(s.originalLatitude) && isCoord(s.originalLongitude)).length;
  const species = list.filter((s) => s.rank === 'Especie');

  $('st-total').textContent = total;
  $('st-types').textContent = list.filter((s) => s.isType).length;
  $('st-determined').textContent = pct(species.length);
  $('st-geo').textContent = pct(georef);
  $('st-families').textContent = distinct(list.map((s) => s.family));
  $('st-genera').textContent = distinct(list.map((s) => s.genus));
  $('st-species').textContent = distinct(species.map((s) => s.scientificName));

  const rank = (key) => {
    const counts = new Map();
    list.forEach((s) => { if (s[key]) counts.set(s[key], (counts.get(s[key]) || 0) + 1); });
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).slice(0, 15);
  };
  const fill = (listId, titleId, title, rows) => {
    $(titleId).textContent = `${title}`;
    const ul = $(listId);
    ul.replaceChildren();
    rows.forEach(([name, count]) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      const pill = document.createElement('span');
      label.textContent = name;
      pill.className = 'pill';
      pill.textContent = count;
      li.append(label, pill);
      ul.append(li);
    });
  };
  const fams = rank('family');
  const gens = rank('genus');
  const deps = rank('department');
  fill('st-fam-list', 'st-fam-title', `${fams.length} familias más representadas`, fams);
  fill('st-gen-list', 'st-gen-title', `${gens.length} géneros más representados`, gens);
  fill('st-dep-list', 'st-dep-title', `Registros por departamento (${deps.length})`, deps);
  $('st-dep-text').textContent = `Los registros de la base de datos corresponden a ${deps.length} departamento${deps.length === 1 ? '' : 's'} de Colombia: ${deps.map((d) => d[0]).join(', ')}.`;

  const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const byDept = new Map(deps.map(([n, c]) => [norm(n), c]));
  const colors = ['#fde9b0', '#f7c66b', '#e9913a', '#c4501f', '#7f1d1d'];
  const bucket = (n) => (n < 500 ? 0 : n < 1000 ? 1 : n < 1500 ? 2 : n < 2000 ? 3 : 4);
  const svg = $('co-map');
  const NS = 'http://www.w3.org/2000/svg';
  svg.setAttribute('viewBox', `0 0 ${colombiaMap.width} ${colombiaMap.height}`);
  svg.replaceChildren();
  colombiaMap.departments.forEach((dep) => {
    const count = byDept.get(norm(dep.name)) || 0;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', dep.d);
    path.setAttribute('fill', count ? colors[bucket(count)] : '#2b2b2b');
    path.setAttribute('stroke', '#777');
    path.setAttribute('stroke-width', '0.6');
    const tip = document.createElementNS(NS, 'title');
    tip.textContent = `${dep.name}: ${count} ejemplar${count === 1 ? '' : 'es'}`;
    path.append(tip);
    svg.append(path);
  });
  const legend = $('map-legend');
  legend.replaceChildren();
  const head = document.createElement('li');
  head.className = 'legend-title';
  head.textContent = 'Número de ejemplares';
  legend.append(head);
  ['< 500', '500 - 1000', '1000 - 1500', '1500 - 2000', '> 2000'].forEach((text, i) => {
    const li = document.createElement('li');
    const sw = document.createElement('i');
    sw.style.background = colors[i];
    li.append(sw, text);
    legend.append(li);
  });
};

const libForm = document.getElementById('lib-form');
const libSelected = new Map();
const LIB_FACETS = {
  status: ['status'], format: ['format'], location: ['location'], publisher: ['publisher'],
  contributor: ['contributors'], language: ['language'], subject: ['subjects'], year: ['year'],
};

const libValues = (item, facet) => [].concat(item[LIB_FACETS[facet][0]] ?? []).map(String).filter(Boolean);

const libFiltered = () => {
  const query = document.getElementById('lib-query').value.trim().toLowerCase();
  const field = document.getElementById('lib-field').value;
  const haystack = (item) => ({
    title: [item.title], author: [item.author], subject: item.subjects || [],
    all: [item.title, item.author, item.publisher, item.year, ...(item.subjects || []), ...(item.contributors || [])],
  }[field].join(' ').toLowerCase());
  return libraryItems.filter((item) => (
    (!query || haystack(item).includes(query))
    && [...libSelected].every(([facet, values]) => !values.size || libValues(item, facet).some((v) => values.has(v)))
  ));
};

const renderLibrary = () => {
  const results = libFiltered();
  const count = document.getElementById('lib-count');
  count.replaceChildren('Resultados: ');
  const strong = document.createElement('strong');
  strong.textContent = results.length ? `1-${results.length} de ${results.length}` : '0';
  count.append(strong);

  const list = document.getElementById('lib-list');
  list.replaceChildren();
  if (!results.length) {
    const empty = document.createElement('li');
    empty.className = 'lib-empty';
    empty.textContent = libraryItems.length
      ? 'No se encontraron registros con los criterios indicados.'
      : 'Aún no hay registros bibliográficos cargados en el catálogo de la biblioteca.';
    list.append(empty);
  }
  results.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'lib-item';
    const icon = document.createElement('div');
    icon.className = 'lib-cover';
    icon.textContent = '📖';
    const body = document.createElement('div');
    const line = (label, value) => {
      if (!value || (Array.isArray(value) && !value.length)) return;
      const p = document.createElement('p');
      const b = document.createElement('strong');
      b.textContent = `${label}: `;
      p.append(b, [].concat(value).join(', '));
      body.append(p);
    };
    const kind = document.createElement('small');
    kind.textContent = item.format || 'Libro';
    const title = document.createElement('h3');
    title.textContent = item.title;
    body.append(kind, title);
    line('Por', item.author);
    line('Colaboradores', item.contributors);
    line('Publicado', [item.publisher, item.year].filter(Boolean).join(', '));
    line('Edición', item.edition);
    line('Materias', item.subjects);
    line('Disponible', item.available);
    const number = document.createElement('span');
    number.className = 'lib-num';
    number.textContent = index + 1;
    li.append(number, icon, body);
    list.append(li);
  });

  Object.keys(LIB_FACETS).forEach((facet) => {
    const ul = document.getElementById(`lib-opt-${facet}`);
    ul.replaceChildren();
    const counts = new Map();
    libraryItems.forEach((item) => libValues(item, facet).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
    if (!counts.size) {
      const li = document.createElement('li');
      li.className = 'lib-none';
      li.textContent = 'Sin opciones';
      ul.append(li);
    }
    [...counts].sort((a, b) => b[1] - a[1]).forEach(([value, total]) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = Boolean(libSelected.get(facet)?.has(value));
      box.addEventListener('change', () => {
        if (!libSelected.has(facet)) libSelected.set(facet, new Set());
        const set = libSelected.get(facet);
        if (box.checked) set.add(value); else set.delete(value);
        renderLibrary();
      });
      const text = document.createElement('span');
      text.textContent = value;
      const n = document.createElement('em');
      n.textContent = total;
      label.append(box, text, n);
      li.append(label);
      ul.append(li);
    });
  });

  const active = [...libSelected].flatMap(([facet, set]) => [...set].map((value) => [facet, value]));
  document.getElementById('lib-active').hidden = !active.length;
  const activeList = document.getElementById('lib-active-list');
  activeList.replaceChildren();
  active.forEach(([facet, value]) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${value} ✕`;
    btn.addEventListener('click', () => { libSelected.get(facet).delete(value); renderLibrary(); });
    li.append(btn);
    activeList.append(li);
  });
  document.getElementById('lib-filter-title').textContent = `Depurar resultados (${active.length})`;
};

libForm.addEventListener('submit', (event) => { event.preventDefault(); renderLibrary(); });
document.getElementById('lib-clear').addEventListener('click', () => { libSelected.clear(); renderLibrary(); });

const renderPublications = () => {
  if (!publications.length) return;
  const body = document.getElementById('pub-body');
  body.replaceChildren();
  publications.forEach((pub) => {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.textContent = pub.name;
    const linkCell = document.createElement('td');
    if (pub.url) {
      const a = document.createElement('a');
      a.href = pub.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = pub.name;
      linkCell.append(a);
    }
    const desc = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = pub.description || '';
    desc.append(strong);
    if (pub.image) {
      const img = document.createElement('img');
      img.src = pub.image;
      img.alt = `Portada de ${pub.name}`;
      img.className = 'pub-cover';
      desc.append(img);
    }
    row.append(name, linkCell, desc);
    body.append(row);
  });
};

const setPhoto = (box, src, alt) => {
  if (!src) return;
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  box.replaceChildren(img);
  box.classList.add('has-photo');
};

const applySiteData = () => {
  document.querySelectorAll('[data-setting]').forEach((node) => {
    const value = (siteSettings[node.dataset.setting] || '').trim();
    if (!value) return;
    node.textContent = value;
    node.classList.remove('pending');
  });
  setPhoto(document.querySelector('[data-setting-photo]'), siteSettings.founderPhoto, 'Fotografía del fundador');

  const grid = document.getElementById('member-grid');
  grid.replaceChildren();
  siteMembers.forEach((m) => {
    const card = document.createElement('article');
    card.className = 'member-card';
    const photo = document.createElement('div');
    photo.className = 'member-photo';
    photo.textContent = 'Foto pendiente';
    setPhoto(photo, m.photo, `Fotografía de ${m.name || m.role}`);
    const role = document.createElement('h4');
    role.textContent = m.role;
    const name = document.createElement('p');
    name.className = 'member-name';
    name.textContent = m.name || 'Nombre pendiente';
    const fn = document.createElement('p');
    const label = document.createElement('strong');
    label.textContent = 'Función:';
    fn.append(label, ` ${m.functionText || 'pendiente de definir.'}`);
    card.append(photo, role, name, fn);
    grid.append(card);
  });
};

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || link.target) return;
  const url = new URL(link.href, window.location.href);
  const internal = url.origin === window.location.origin && !url.hash
    && !/^\/(admin|uploads|assets)(\/|$)/.test(url.pathname);
  if (!internal) return;
  event.preventDefault();
  navigate(url.pathname);
});

window.addEventListener('popstate', showView);
applySiteData();
renderPublications();
renderLibrary();
renderStats();
renderResults();
showView();
