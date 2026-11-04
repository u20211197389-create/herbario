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

// Visor con zoom: botones + / − / inicio / pantalla completa, rueda del ratón, arrastre, gestos táctiles y minimapa.
const zoomViewer = (src, alt) => {
  const box = createElement('div', 'zoom-viewer');
  const img = document.createElement('img');
  img.className = 'zoom-img';
  img.alt = alt;
  img.draggable = false;
  const bar = createElement('div', 'zoom-tools');
  const nav = createElement('div', 'zoom-nav');
  const thumb = document.createElement('img');
  thumb.alt = '';
  thumb.draggable = false;
  const frame = createElement('div', 'zoom-frame');
  nav.append(thumb, frame);

  let s = 1; let tx = 0; let ty = 0; let fit = 1;
  const MAX = 8;
  const size = () => ({ w: box.clientWidth, h: box.clientHeight });
  const clamp = () => {
    const { w, h } = size();
    const iw = img.naturalWidth * s; const ih = img.naturalHeight * s;
    tx = iw <= w ? (w - iw) / 2 : Math.min(0, Math.max(w - iw, tx));
    ty = ih <= h ? (h - ih) / 2 : Math.min(0, Math.max(h - ih, ty));
  };
  const apply = () => {
    clamp();
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    const { w, h } = size();
    const k = nav.clientWidth / (img.naturalWidth || 1);
    const vx = Math.max(0, -tx / s); const vy = Math.max(0, -ty / s);
    const vw = Math.min(img.naturalWidth, w / s); const vh = Math.min(img.naturalHeight, h / s);
    frame.style.left = `${vx * k}px`; frame.style.top = `${vy * k}px`;
    frame.style.width = `${vw * k}px`; frame.style.height = `${vh * k}px`;
  };
  const home = () => {
    const { w, h } = size();
    fit = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    s = fit; tx = 0; ty = 0; apply();
  };
  const zoomAt = (factor, cx, cy) => {
    const next = Math.min(fit * MAX, Math.max(fit, s * factor));
    const k = next / s;
    tx = cx - (cx - tx) * k; ty = cy - (cy - ty) * k; s = next; apply();
  };
  const center = (factor) => { const { w, h } = size(); zoomAt(factor, w / 2, h / 2); };

  const button = (label, title, onClick) => {
    const b = createElement('button', 'zoom-btn', label);
    b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  };
  bar.append(
    button('+', 'Acercar', () => center(1.5)),
    button('−', 'Alejar', () => center(1 / 1.5)),
    button('⌂', 'Vista inicial', home),
    button('⛶', 'Pantalla completa', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (box.requestFullscreen) box.requestFullscreen();
    }),
  );

  const pointers = new Map();
  let pinch = 0;
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zoom-tools')) return;
    box.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    box.classList.add('is-dragging');
  });
  box.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const rect = box.getBoundingClientRect();
    if (pointers.size === 2) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomAt(dist / pinch, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      pinch = dist;
      return;
    }
    tx += e.clientX - p.x; ty += e.clientY - p.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    apply();
  });
  const release = (e) => {
    pointers.delete(e.pointerId); pinch = 0;
    if (!pointers.size) box.classList.remove('is-dragging');
  };
  box.addEventListener('pointerup', release);
  box.addEventListener('pointercancel', release);
  box.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });
  box.addEventListener('dblclick', (e) => {
    const rect = box.getBoundingClientRect();
    zoomAt(2, e.clientX - rect.left, e.clientY - rect.top);
  });
  nav.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const move = (ev) => {
      const r = nav.getBoundingClientRect(); const k = r.width / img.naturalWidth;
      const { w, h } = size();
      tx = w / 2 - ((ev.clientX - r.left) / k) * s; ty = h / 2 - ((ev.clientY - r.top) / k) * s; apply();
    };
    move(e);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  nav.addEventListener('wheel', (e) => e.stopPropagation());

  // Se reajusta al cambiar el tamaño (vista oculta al cargar, pantalla completa, rotación).
  new ResizeObserver(() => { if (img.naturalWidth && box.clientWidth) home(); }).observe(box);
  img.addEventListener('load', () => { thumb.src = src; requestAnimationFrame(() => { if (box.clientWidth) home(); }); });
  img.addEventListener('error', () => { box.replaceChildren(createElement('span', 'zoom-error', 'No se pudo cargar la imagen.')); });
  img.src = src;
  box.append(img, bar, nav);
  return box;
};

const requestDialog = document.getElementById('request-dialog');
const requestForm = document.getElementById('request-form');
const requestMsg = document.getElementById('request-msg');
let requestCatalog = '';
let requestKind = 'imagen';

const REQUEST_TEXTS = {
  imagen: ['Solicitar ver la imagen', 'Debe indicar un correo electrónico válido. El herbario revisará su solicitud y, si es aprobada, le enviará un enlace para ver la imagen del ejemplar.', 'Motivo de la solicitud', 'Enviar solicitud'],
  descarga: ['Solicitar descarga de datos', 'Debe indicar un correo electrónico válido. El herbario revisará su solicitud y, si es aprobada, le enviará a su correo el archivo con los datos solicitados.', 'Motivo de la descarga', 'Enviar solicitud']
};

const setRequestMsg = (text, ok) => {
  requestMsg.textContent = text;
  requestMsg.classList.toggle('ok', Boolean(ok));
  requestMsg.hidden = !text;
};

const openRequestDialog = (specimen, kind = 'imagen') => {
  requestCatalog = specimen.catalogNumber;
  requestKind = kind;
  const [title, note, reasonLabel, send] = REQUEST_TEXTS[kind];
  document.getElementById('request-title').textContent = title;
  document.getElementById('request-note').textContent = note;
  document.getElementById('request-reason-label').firstChild.textContent = `${reasonLabel} `;
  document.getElementById('request-send').textContent = send;
  requestForm.reset();
  setRequestMsg('');
  document.getElementById('request-send').disabled = false;
  requestDialog.showModal();
};

document.getElementById('request-cancel').addEventListener('click', () => requestDialog.close());
document.getElementById('request-x').addEventListener('click', () => requestDialog.close());

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('request-email').value.trim();
  const reason = document.getElementById('request-reason').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setRequestMsg('Escriba un correo electrónico válido.');
  if (reason.length < 5) return setRequestMsg('Cuéntenos brevemente el motivo de la solicitud.');
  if (window.SITE_STATIC) {
    const body = `${requestKind === 'descarga' ? 'Descarga' : 'Imagen'}: ${requestCatalog}\nCorreo: ${email}\nMotivo: ${reason}`;
    window.location.href = `mailto:herbario@usco.edu.co?subject=${encodeURIComponent(`Solicitud de ${requestKind === 'descarga' ? 'descarga' : 'imagen'}`)}&body=${encodeURIComponent(body)}`;
    return setRequestMsg('Se abrió su programa de correo para enviar la solicitud.', true);
  }
  const send = document.getElementById('request-send');
  send.disabled = true;
  try {
    const response = await fetch('/api/solicitudes-imagen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'herbario' },
      body: JSON.stringify({ catalogNumber: requestCatalog, email, reason, kind: requestKind })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo enviar la solicitud.');
    setRequestMsg('Solicitud enviada. El herbario le responderá a su correo.', true);
  } catch (error) {
    setRequestMsg(error.message);
    send.disabled = false;
  }
});

const lockedImage = (specimen, className, message) => {
  const box = createElement('div', `${className} image-locked`);
  box.append(createElement('p', '', message || 'Imagen disponible bajo solicitud'));
  const button = createElement('button', 'btn-request', 'Solicitar ver imagen');
  button.type = 'button';
  button.addEventListener('click', () => openRequestDialog(specimen));
  box.append(button);
  return box;
};

const specimenPicture = (specimen, className, size) => {
  if (!specimen.image && !specimen.hasImage) return createElement('div', className, 'Sin imagen');
  const alt = `Fotografía del ejemplar ${catalogLabel(specimen)}`;
  if (!specimen.image) {
    if (size !== 'detail') return createElement('div', className, 'Imagen bajo solicitud');
    const holder = createElement('div', 'detail-image-holder');
    const token = new URLSearchParams(window.location.search).get('acceso');
    if (!token || window.SITE_STATIC) {
      holder.append(lockedImage(specimen, className));
      return holder;
    }
    holder.append(createElement('div', className, 'Verificando acceso…'));
    fetch(`/api/imagen-acceso?token=${encodeURIComponent(token)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (data.catalogNumber !== specimen.catalogNumber) return Promise.reject();
        const wrap = createElement('div', `${className} has-image has-zoom`);
        wrap.append(zoomViewer(data.image, alt));
        holder.replaceChildren(wrap);
      })
      .catch(() => holder.replaceChildren(lockedImage(specimen, className, 'El enlace no es válido o ya venció. Puede solicitar el acceso de nuevo.')));
    return holder;
  }
  if (size === 'detail') {
    const wrap = createElement('div', `${className} has-image has-zoom`);
    wrap.append(zoomViewer(specimen.image, alt));
    return wrap;
  }
  const box = createElement('div', `${className} has-image`);
  const img = document.createElement('img');
  img.src = specimen.image;
  img.alt = alt;
  img.loading = size === 'card' ? 'lazy' : 'eager';
  box.append(img);
  return box;
};

const sortSelect = document.querySelector('#sort-results');
const sortedResults = () => {
  const mode = sortSelect?.value;
  if (!mode) return currentResults;
  const dir = mode === 'newest' ? -1 : 1;
  // Los ejemplares sin fecha quedan siempre al final.
  return [...currentResults].sort((a, b) => {
    if (!a.collectedAt || !b.collectedAt) return (a.collectedAt ? 0 : 1) - (b.collectedAt ? 0 : 1);
    return dir * String(a.collectedAt).localeCompare(String(b.collectedAt));
  });
};
sortSelect?.addEventListener('change', () => renderResults());

const renderResults = () => {
  specimenResults.replaceChildren();
  const total = herbariumSpecimens.length;
  const count = currentResults.length;
  const filtered = currentDescription !== 'Todos los ejemplares';
  queryDescription.hidden = !filtered;
  queryDescription.replaceChildren(createElement('strong', '', 'Búsqueda: '), document.createTextNode(currentDescription));
  const noun = (n) => (n === 1 ? ' espécimen' : ' especímenes');
  searchFeedback.replaceChildren(...(filtered
    ? [createElement('strong', '', String(count)), document.createTextNode(' de ' + total + noun(total))]
    : [document.createTextNode('Total en la colección: '), createElement('strong', '', String(total)), document.createTextNode(noun(total))]));
  downloadButton.disabled = count === 0;

  if (count === 0) {
    specimenResults.append(createElement('p', 'catalog-empty', 'No encontramos ejemplares con ese criterio. Prueba otro nombre, familia o lugar.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  sortedResults().forEach((specimen) => {
    const card = createElement('a', 'specimen-card');
    card.href = `${BASE}/ejemplar/${encodeURIComponent(specimen.catalogNumber)}/`;
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
  download.addEventListener('click', () => openRequestDialog(specimen, 'descarga'));

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

const nomenQuery = document.querySelector('#nomen-query');
nomenQuery?.addEventListener('input', () => {
  const term = nomenQuery.value.trim().toLowerCase();
  document.querySelectorAll('#nomen-table tbody tr').forEach((row) => { row.hidden = !!term && !row.textContent.toLowerCase().includes(term); });
});

const VIEW_PATHS = ['especimenes', 'busqueda-avanzada', 'acerca', 'coleccion', 'cifras', 'servicios', 'biblioteca', 'publicaciones', 'contacto', 'tour-cientifico'];
// Con publicación estática en un subdirectorio (p. ej. GitHub Pages), data.js define SITE_BASE.
const BASE = window.SITE_BASE || '';
const toPath = (route) => (route === 'inicio' ? `${BASE}/` : `${BASE}/${route}/`);

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
  const pathname = BASE && window.location.pathname.startsWith(BASE) ? window.location.pathname.slice(BASE.length) : window.location.pathname;
  return decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '') || 'inicio';
};

const navigate = (path) => {
  if (path !== window.location.pathname) window.history.pushState({}, '', path);
  showView();
};

const showView = () => {
  const hash = currentRoute();
  let current = hash;
  let detailSpecimen = null;
  let detailBook = null;

  if (hash.startsWith('biblioteca/')) {
    current = 'biblioteca-detalle';
    detailBook = libraryItems.find((book) => String(book.id) === hash.slice('biblioteca/'.length));
    if (!detailBook) current = 'biblioteca';
  }
  let detailPub = null;
  if (hash.startsWith('publicaciones/')) {
    current = 'publicaciones-detalle';
    detailPub = publications.find((pub) => String(pub.id) === hash.slice('publicaciones/'.length));
    if (!detailPub) current = 'publicaciones';
  }
  if (hash.startsWith('ejemplar/')) {
    current = 'ejemplar';
    detailSpecimen = herbariumSpecimens.find((specimen) => specimen.catalogNumber === hash.slice('ejemplar/'.length));
    if (!detailSpecimen) current = 'especimenes';
  }
  if (![...views].some((view) => view.dataset.view === current)) current = 'inicio';

  if (detailSpecimen) renderDetail(detailSpecimen);
  if (detailBook) renderBookDetail(detailBook);
  if (detailPub) renderPubDetail(detailPub);
  views.forEach((view) => { view.hidden = view.dataset.view !== current; });
  const activeMenu = current === 'publicaciones-detalle' || current === 'publicaciones' ? 'servicios' : current === 'ejemplar' || current === 'busqueda-avanzada' ? 'especimenes' : current === 'biblioteca' || current === 'biblioteca-detalle' || current === 'tour-cientifico' ? 'servicios' : current;
  menuLinks.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === toPath(activeMenu)));
  window.scrollTo(0, 0);
};

const showResults = (results, description) => {
  currentResults = results;
  currentDescription = description;
  renderResults();
  if (window.location.pathname === toPath('especimenes')) {
    showView();
  } else {
    navigate(toPath('especimenes'));
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
  hideSuggestions();
  quickSearch();
});

const suggestionList = createElement('ul', 'suggestions');
suggestionList.id = 'catalog-suggestions';
suggestionList.setAttribute('role', 'listbox');
suggestionList.hidden = true;
catalogSearch.append(suggestionList);
catalogQuery.setAttribute('aria-controls', 'catalog-suggestions');
let suggestionIndex = -1;

const suggestionTerms = [...new Set(herbariumSpecimens.flatMap((s) => [s.scientificName, s.genus, s.family, s.commonName]).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'es'));

function hideSuggestions() {
  suggestionList.hidden = true;
  suggestionIndex = -1;
}

const highlightSuggestion = (index) => {
  const items = [...suggestionList.children];
  items.forEach((item, i) => item.classList.toggle('is-active', i === index));
  suggestionIndex = index;
  items[index]?.scrollIntoView({ block: 'nearest' });
};

const chooseSuggestion = (term) => {
  catalogQuery.value = term;
  hideSuggestions();
  quickSearch();
};

const showSuggestions = () => {
  const query = normalize(catalogQuery.value.trim());
  if (!query) return hideSuggestions();
  const starts = suggestionTerms.filter((t) => normalize(t).startsWith(query));
  const inside = suggestionTerms.filter((t) => !normalize(t).startsWith(query) && normalize(t).includes(query));
  const found = [...starts, ...inside].slice(0, 30);
  suggestionList.replaceChildren(...found.map((term) => {
    const item = createElement('li', '', term);
    item.setAttribute('role', 'option');
    item.addEventListener('mousedown', (event) => { event.preventDefault(); chooseSuggestion(term); });
    return item;
  }));
  suggestionIndex = -1;
  suggestionList.hidden = !found.length;
};

catalogQuery.addEventListener('input', showSuggestions);
catalogQuery.addEventListener('focus', showSuggestions);
catalogQuery.addEventListener('blur', hideSuggestions);
catalogQuery.addEventListener('keydown', (event) => {
  if (suggestionList.hidden) return;
  const count = suggestionList.children.length;
  if (event.key === 'ArrowDown') { event.preventDefault(); highlightSuggestion((suggestionIndex + 1) % count); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); highlightSuggestion((suggestionIndex - 1 + count) % count); }
  else if (event.key === 'Enter' && suggestionIndex >= 0) { event.preventDefault(); chooseSuggestion(suggestionList.children[suggestionIndex].textContent); }
  else if (event.key === 'Escape') hideSuggestions();
});

advancedForm.addEventListener('submit', (event) => {
  event.preventDefault();
  runAdvancedSearch();
});

downloadButton.addEventListener('click', () => {
  openRequestDialog({ catalogNumber: `Todos los resultados de la búsqueda (${currentResults.length}): ${currentResults.map((s) => s.catalogNumber).join(', ')}` }, 'descarga');
});

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

const bookPath = (item) => toPath(`biblioteca/${item.id}`);

// La vista de detalle usa la misma búsqueda/filtros activos para el "Anterior/Siguiente".
const renderBookDetail = (item) => {
  const set = (id, ...nodes) => document.getElementById(id).replaceChildren(...nodes);
  const text = (tag, value, className) => { const n = document.createElement(tag); n.textContent = value; if (className) n.className = className; return n; };
  const joined = (value) => [].concat(value ?? []).join(', ');

  set('libd-kind', item.format || 'Libro');
  set('libd-title', item.title);

  const summary = [];
  const add = (label, value) => {
    if (!value || (Array.isArray(value) && !value.length)) return;
    const p = document.createElement('p');
    p.append(text('strong', `${label}: `), joined(value));
    summary.push(p);
  };
  add('Por', item.author);
  add('Colaboradores', item.contributors);
  add('Publicado', [item.publisher, item.year].filter(Boolean).join(', '));
  add('Edición', item.edition);
  set('libd-summary', ...summary);

  const row = document.createElement('tr');
  [item.status || '—', item.location || '—', item.available || '—'].forEach((v) => row.append(text('td', v)));
  set('libd-avail', row);

  const details = [];
  const detail = (label, value) => {
    if (!value || (Array.isArray(value) && !value.length)) return;
    details.push(text('dt', label), text('dd', joined(value)));
  };
  detail('Idioma', item.language);
  detail('Editor', item.publisher);
  detail('Año de publicación', item.year);
  detail('Edición', item.edition);
  detail('Temas', item.subjects);
  detail('Tipo de documento', item.format || 'Libro');
  detail('Ubicación', item.location);
  set('libd-details', ...details);

  const results = libFiltered();
  const at = results.findIndex((book) => book.id === item.id);
  const step = (offset) => results[at + offset];
  const go = (book) => { if (book) navigate(bookPath(book)); };
  document.getElementById('libd-pos').textContent = at >= 0 ? `${at + 1} de ${results.length}` : '';
  const prev = document.getElementById('libd-prev');
  const next = document.getElementById('libd-next');
  prev.disabled = at <= 0;
  next.disabled = at < 0 || at >= results.length - 1;
  prev.onclick = () => go(step(-1));
  next.onclick = () => go(step(1));

  // Estante: otros registros que comparten la primera materia (o el mismo formato si no tiene).
  const topic = (item.subjects || [])[0];
  const related = libraryItems
    .filter((book) => book.id !== item.id && (topic ? (book.subjects || []).includes(topic) : book.format === item.format))
    .slice(0, 5);
  set('libd-shelf', ...related.map((book) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = bookPath(book);
    const cover = text('div', '📖', 'lib-cover');
    const author = text('small', book.author || book.publisher || '');
    a.append(cover, text('small', book.format || 'Libro'), text('strong', book.title.length > 60 ? `${book.title.slice(0, 57)}…` : book.title), author);
    li.append(a);
    return li;
  }));
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
    const icon = document.createElement('a');
    icon.className = 'lib-cover lib-cover-link';
    icon.href = bookPath(item);
    icon.setAttribute('aria-label', `Ver ${item.title}`);
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
    const titleLink = document.createElement('a');
    titleLink.href = bookPath(item);
    titleLink.textContent = item.title;
    title.append(titleLink);
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

const pubPath = (pub) => toPath(`publicaciones/${pub.id}`);

// Acepta http(s) o un dominio escrito sin esquema (www.sitio.com); lo demás no es un enlace usable.
const pubUrl = (raw) => {
  const value = String(raw || '').trim();
  if (/^https?:\/\/\S+$/i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value)) return `https://${value}`;
  return '';
};

const renderPubDetail = (pub) => {
  document.getElementById('pubd-title').textContent = pub.name;
  const desc = document.getElementById('pubd-desc');
  desc.replaceChildren();
  if (pub.description) { const p = document.createElement('p'); p.textContent = pub.description; desc.append(p); }
  const link = document.getElementById('pubd-link');
  link.replaceChildren();
  const href = pubUrl(pub.url);
  if (href) {
    const a = document.createElement('a');
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'service-btn';
    a.textContent = 'Abrir publicación';
    link.append(a);
  }
  const cover = document.getElementById('pubd-cover');
  cover.replaceChildren();
  if (pub.image) {
    const img = document.createElement('img');
    img.src = pub.image; img.alt = `Portada de ${pub.name}`;
    cover.append(img);
  }
  const at = publications.findIndex((p) => p.id === pub.id);
  document.getElementById('pubd-pos').textContent = `${at + 1} de ${publications.length}`;
  const prev = document.getElementById('pubd-prev');
  const next = document.getElementById('pubd-next');
  prev.disabled = at <= 0; next.disabled = at >= publications.length - 1;
  prev.onclick = () => navigate(pubPath(publications[at - 1]));
  next.onclick = () => navigate(pubPath(publications[at + 1]));
};

const renderPublications = () => {
  if (!publications.length) return;
  const body = document.getElementById('pub-body');
  body.replaceChildren();
  publications.forEach((pub) => {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    const detailLink = document.createElement('a');
    detailLink.href = pubPath(pub);
    detailLink.textContent = pub.name;
    name.append(detailLink);
    const linkCell = document.createElement('td');
    const external = pubUrl(pub.url);
    if (external) {
      const a = document.createElement('a');
      a.href = external;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Abrir enlace';
      linkCell.append(a);
    } else {
      linkCell.textContent = '—';
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

// Convierte lo escrito en el panel (nombre del lugar o enlace de Google Maps) en la dirección del mapa incrustado.
const mapSources = (value) => {
  const v = (value || '').trim();
  const embed = (q) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;
  const open = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  if (!v) return { embed: embed('Universidad Surcolombiana sede Neiva'), open: open('Universidad Surcolombiana sede Neiva') };
  if (!/^https?:/i.test(v)) return { embed: embed(v), open: open(v) };
  let url;
  try { url = new URL(v); } catch { return null; }
  if (!/^(www\.|maps\.)?google\.com$/.test(url.hostname) || !url.pathname.startsWith('/maps')) return null;
  if (url.pathname.startsWith('/maps/embed')) return { embed: v, open: v };
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
  const coords = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const q = url.searchParams.get('q') || url.searchParams.get('query') || (place && decodeURIComponent(place[1].replace(/\+/g, ' '))) || (coords && `${coords[1]},${coords[2]}`);
  return q ? { embed: embed(q), open: v } : null;
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
  const mapBox = document.querySelector('.contact-map-wrap');
  if (mapBox && siteSettings.mapLink) {
    if (siteSettings.mapLink.trim() === '-') mapBox.hidden = true;
    else {
      const src = mapSources(siteSettings.mapLink);
      if (src) {
        mapBox.querySelector('iframe').src = src.embed;
        mapBox.querySelector('.map-link').href = src.open;
      }
    }
  }

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
    && !new RegExp(`^${BASE}/(admin|uploads|assets)(/|$)`).test(url.pathname);
  if (!internal) return;
  event.preventDefault();
  navigate(url.pathname);
});

// Carrusel del tour científico: desplazamiento con imanes (scroll-snap), flechas, puntos y teclado.
(() => {
  const track = document.getElementById('tour-track');
  if (!track) return;
  // Contenido editable desde el panel (Servicios); si está vacío se conserva el texto original de la página.
  const base = window.SITE_BASE || '';
  const urls = (siteSettings.tourImages || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (urls.length) {
    track.replaceChildren(...urls.map((src, n) => {
      const li = document.createElement('li');
      li.className = 'tour-slide';
      const img = document.createElement('img');
      img.src = src.startsWith('/') ? base + src : src;
      img.alt = `Tour científico: foto ${n + 1} de ${urls.length}`;
      if (n) img.loading = 'lazy';
      li.append(img);
      return li;
    }));
  }
  const info = document.querySelector('.tour-info');
  const blocks = (siteSettings.tourText || '').split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
  if (info && blocks.length) {
    info.replaceChildren(...blocks.map((b, n) => {
      const heading = b.startsWith('## ');
      const note = b.startsWith('> ');
      const node = document.createElement(heading ? 'h3' : 'p');
      node.textContent = heading ? b.slice(3) : note ? b.slice(2) : b;
      if (note) node.className = 'tour-note';
      else if (!heading && n === 0) node.className = 'tour-lead';
      return node;
    }));
  }
  const slides = [...track.children];
  const dots = document.getElementById('tour-dots');
  const index = () => Math.round(track.scrollLeft / track.clientWidth);
  const goTo = (i) => track.scrollTo({ left: Math.max(0, Math.min(slides.length - 1, i)) * track.clientWidth, behavior: 'smooth' });
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', `Ir a la foto ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dots.append(dot);
  });
  const update = () => {
    const i = index();
    [...dots.children].forEach((d, n) => d.classList.toggle('on', n === i));
  };
  track.addEventListener('scroll', () => window.requestAnimationFrame(update));
  window.addEventListener('resize', update);
  document.getElementById('tour-prev').addEventListener('click', () => goTo(index() === 0 ? slides.length - 1 : index() - 1));
  document.getElementById('tour-next').addEventListener('click', () => goTo(index() === slides.length - 1 ? 0 : index() + 1));
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('tour-cientifico').hidden) return;
    if (e.key === 'ArrowLeft') goTo(index() - 1);
    if (e.key === 'ArrowRight') goTo(index() + 1);
  });
  let timer;
  const next = () => goTo(index() === slides.length - 1 ? 0 : index() + 1);
  const stop = () => clearInterval(timer);
  const play = () => { stop(); timer = setInterval(() => { if (!document.getElementById('tour-cientifico').hidden && !document.hidden) next(); }, 4000); };
  const area = track.parentElement;
  area.addEventListener('mouseenter', stop);
  area.addEventListener('mouseleave', play);
  area.addEventListener('click', play);
  document.addEventListener('keydown', play);
  update();
  play();
})();
window.addEventListener('popstate', showView);
applySiteData();
renderPublications();
renderLibrary();
renderStats();
renderResults();
showView();
