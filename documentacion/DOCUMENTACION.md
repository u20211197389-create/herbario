# Documentación del proyecto: Herbario virtual SURCO

> Documento de apoyo para el informe de pasantía. Los campos entre corchetes `[ ... ]` deben completarse con datos propios (nombre, programa, periodo, tutores).

| | |
|---|---|
| **Proyecto** | Sitio web y sistema de administración del Herbario SURCO |
| **Institución** | Universidad Surcolombiana, Neiva (Huila) |
| **Dependencia** | Herbario SURCO |
| **Pasante** | [Nombre completo] |
| **Programa académico** | [Programa] |
| **Periodo de la pasantía** | [Fecha inicio] a [Fecha fin] |
| **Tutor institucional** | [Nombre] |
| **Repositorio** | https://github.com/u20211197389-create/herbario |
| **Sitio publicado** | https://u20211197389-create.github.io/herbario/ |

---

## 1. Resumen

Se desarrolló el sitio web del Herbario SURCO para consultar en línea los datos de colecta de sus especímenes, junto con un panel de administración privado para mantener la información. El sitio público permite buscar y ordenar especímenes, ver sus fotografías con zoom, consultar estadísticas de la colección, el catálogo de la biblioteca y las publicaciones. El acceso a las imágenes y a las descargas se controla mediante solicitudes que el herbario aprueba o rechaza.

## 2. Planteamiento del problema y justificación

El herbario conserva cerca de 18.500 especímenes (según el Protocolo 2026), pero su información estaba en hojas de Excel y registros físicos, sin una forma pública de consultarla. Esto dificulta que estudiantes, investigadores y la comunidad accedan a los datos, y que el herbario controle quién ve sus imágenes y quién descarga sus registros. El catálogo de la biblioteca (691 obras) tampoco era consultable por el público.

## 3. Objetivos

**General.** Diseñar e implementar el herbario virtual SURCO con un sistema de administración de contenidos.

**Específicos.**
1. Publicar una página web de consulta de especímenes con búsqueda rápida y avanzada.
2. Ofrecer un panel de administración para crear, editar, eliminar, importar y exportar los datos.
3. Controlar el acceso a imágenes y descargas mediante un flujo de solicitud y aprobación.
4. Presentar cifras y un mapa de la colección calculados automáticamente.
5. Incorporar el catálogo de la biblioteca del herbario.
6. Publicar la parte pública en línea sin depender de un servidor propio.

## 4. Alcance y limitaciones

**Incluye:** sitio público, panel de administración, base de datos SQLite, publicación estática en GitHub Pages, importación del catálogo bibliográfico.

**No incluye (por ahora):**
- Administración en línea: el panel solo funciona en el computador donde corre el servidor.
- Tarifas, misión, historia, fundador e integrantes: faltan los textos oficiales del herbario.
- Datos de altura, nombre común y ejemplares tipo en los 8 especímenes de ejemplo.
- Migración a PostgreSQL (hay un esquema preparado en `database/`, no se usa).

## 5. Fuentes de información utilizadas

- Plantilla Excel de especímenes (8 registros cargados; se omitieron filas de ejemplo o sin número de catálogo ni identificación).
- «Base datos biblioteca Herbario.xlsx» (691 obras importadas; 288 filas vacías omitidas).
- «Protocolo actualizado herbario_2026.pdf» (datos institucionales, organización de la colección y flujo de depósito de material).
- Diseño de referencia: Herbario Forestal UDBC.

## 6. Requerimientos

### 6.1 Funcionales

| Código | Requerimiento |
|---|---|
| RF1 | Buscar especímenes por texto (inicio) y por filtros: catálogo, familia, género, especie, país, departamento, municipio, localidad, altura, colector, número de colector, hábito y nombre común. |
| RF2 | Listar resultados en tarjetas y ordenarlos por número de catálogo o por fecha de colecta (más recientes o más antiguos primero). |
| RF3 | Ver el detalle de cada ejemplar y su imagen con zoom. |
| RF4 | Solicitar ver la imagen o descargar datos indicando correo y motivo. |
| RF5 | Aprobar o rechazar solicitudes desde la administración; la aprobación genera un enlace temporal. |
| RF6 | Mostrar cifras (totales, listas y mapa por departamento) calculadas de los datos. |
| RF7 | Consultar el catálogo de la biblioteca con filtros. |
| RF8 | Mostrar secciones institucionales: Acerca, Colección, Servicios, Publicaciones y Contacto. |
| RF9 | Administrar especímenes, publicaciones, biblioteca, integrantes, textos del sitio y usuarios. |
| RF10 | Importar y exportar listas en CSV, y subir imágenes. |

### 6.2 No funcionales

- **Seguridad:** contraseñas con scrypt, sesión por cookie HttpOnly, bloqueo tras intentos fallidos, validación de entradas.
- **Usabilidad:** diseño adaptado a móvil, navegación con rutas limpias, interfaz de administración moderna.
- **Portabilidad:** sin dependencias externas; solo Node.js.
- **Disponibilidad:** la parte pública se publica como sitio estático y funciona sin el servidor local.
- **Mantenibilidad:** código organizado por responsabilidades y datos centralizados en una base SQLite.

## 7. Arquitectura

```
Navegador ── sitio público (HTML/CSS/JS) ──┐
                                           ├── Servidor Node.js ── SQLite (data/herbario.db)
Navegador ── panel /admin/ ────────────────┘                    └── Imágenes (data/uploads/)

npm run publicar ──► carpeta docs/ (sitio estático) ──► GitHub Pages
```

- **Frontend:** una sola página (`public/index.html`) con una vista por sección; el enrutado en `public/assets/js/app.js` usa rutas limpias (`/especimenes/`, `/cifras/`…).
- **Backend:** `server/index.js` (rutas y API), `server/db.js` (base de datos y validación), `server/security.js` (contraseñas y tokens).
- **Datos:** SQLite con el módulo `node:sqlite`; el sitio recibe los datos a través de `/assets/js/data.js`.
- **Publicación:** `scripts/build-static.js` genera `docs/` con los datos incrustados y sin administración.

### 7.1 Tecnologías

| Capa | Tecnología |
|---|---|
| Lenguaje | JavaScript (Node.js, módulos ES) |
| Base de datos | SQLite (`node:sqlite`) |
| Interfaz | HTML5, CSS3, JavaScript sin frameworks |
| Descargas | XLSX generado sin librerías externas |
| Control de versiones | Git y GitHub |
| Hospedaje público | GitHub Pages |

### 7.2 Estructura de carpetas

| Ruta | Contenido |
|---|---|
| `public/` | Sitio público y panel de administración (`public/admin/`) |
| `server/` | Servidor, base de datos, seguridad y datos iniciales |
| `scripts/build-static.js` | Generador del sitio estático |
| `docs/` | Sitio estático publicado (generado, no editar a mano) |
| `database/` | Esquema PostgreSQL para una migración futura |
| `data/` | Base de datos e imágenes (no se publica; requiere copia de seguridad) |
| `documentacion/` | Este documento |

## 8. Modelo de datos

| Tabla | Descripción | Campos principales |
|---|---|---|
| `specimens` | Especímenes | catálogo, número de colector, nombre científico, autoría, familia, género, hábitat, hábito, país, departamento, municipio, localidad, fecha de colecta, colectores, determinador, coordenadas, altura, nombre común, ejemplar tipo, imagen |
| `library_items` | Biblioteca | título, autor, editorial, año, edición, formato, ubicación, estado, idioma, colaboradores, materias, disponibilidad |
| `publications` | Publicaciones | nombre, enlace, descripción, imagen |
| `members` | Integrantes | cargo, nombre, función, foto, posición |
| `settings` | Textos del sitio | introducción, misión, fundador, historia, términos, teléfono, dirección, Instagram |
| `image_requests` | Solicitudes | ejemplar, correo, motivo, tipo (imagen o descarga), estado, token, vencimiento, fechas |
| `users`, `sessions` | Administradores y sesiones | usuario, hash de contraseña, token de sesión |

## 9. Funcionalidades del sitio público

| Sección | Ruta | Descripción |
|---|---|---|
| Inicio | `/` | Búsqueda rápida y acceso a la búsqueda avanzada |
| Especímenes | `/especimenes/` | Resultados en tarjetas, ordenamiento por fecha de colecta y solicitud de descarga |
| Ejemplar | `/ejemplar/<número>/` | Ficha del espécimen con imagen ampliable y solicitud de imagen |
| Búsqueda avanzada | `/busqueda-avanzada/` | Filtros combinables |
| Acerca | `/acerca/` | Datos institucionales, misión, fundador, integrantes, historia y términos |
| Colección | `/coleccion/` | Organización (Cronquist, APG IV), actualización nomenclatural, depósito de material y enlaces de consulta |
| Cifras | `/cifras/` | Estadísticas y mapa de Colombia por departamento |
| Servicios | `/servicios/` | Servicios y tarifas (por definir) |
| Biblioteca | `/biblioteca/` | Catálogo de 691 obras con filtros por formato, editorial, idioma, materia y año |
| Publicaciones | `/publicaciones/` | Publicaciones del herbario |
| Contacto | `/contacto/` | Datos de contacto y mapa |

### 9.1 Flujo de solicitud de imagen o descarga

1. El visitante pulsa «Solicitar ver la imagen» o intenta descargar.
2. Se muestra un formulario que pide correo y motivo.
3. La solicitud se guarda y aparece en la administración.
4. El administrador la aprueba o la rechaza.
5. Si se aprueba, se genera un enlace con vencimiento para ver la imagen.

En la versión publicada en GitHub Pages (sin servidor), la solicitud se envía por correo a herbario@usco.edu.co.

## 10. Panel de administración

Se accede escribiendo `/admin/` (no hay enlace público) con usuario y contraseña. Permite:

- Agregar, editar y eliminar especímenes, publicaciones, obras de la biblioteca e integrantes.
- Importar y exportar CSV y descargar plantillas.
- Subir imágenes PNG, JPG o WEBP de hasta 3 MB.
- Editar los textos de Acerca y los datos de Contacto.
- Revisar las solicitudes de imagen y descarga, con los correos y motivos.
- Gestionar usuarios y cambiar la contraseña.

## 11. Seguridad

| Medida | Detalle |
|---|---|
| Contraseñas | Hash scrypt con sal; mínimo 10 caracteres con letras y números |
| Comparación | Tiempo constante, sin revelar si el usuario existe |
| Sesión | Cookie HttpOnly y SameSite; el token se guarda como hash SHA-256 |
| Fuerza bruta | Bloqueo de 15 minutos tras 5 intentos fallidos |
| Peticiones que modifican datos | Cabecera obligatoria contra CSRF |
| Entradas | Límites de longitud y validación de enlaces e imágenes |
| Navegador | Política de seguridad de contenido (CSP) |
| Enlaces de imagen | Token aleatorio con vencimiento |

## 12. Instalación y operación

**Requisitos:** Node.js reciente con `node:sqlite` y Git.

```powershell
npm.cmd run crear-admin   # crea el administrador (la contraseña se pide por pantalla)
npm.cmd run dev           # inicia en http://127.0.0.1:5173
npm run publicar          # genera docs/ para GitHub Pages
```

Para actualizar el sitio publicado: `npm run publicar`, luego `git add -A`, `git commit` y `git push`. En GitHub Pages se usa la rama `main` y la carpeta `/docs`.

**Copias de seguridad:** copiar periódicamente la carpeta `data/` (base de datos e imágenes).

## 13. Resultados

| Resultado | Estado |
|---|---|
| Sitio público con 11 vistas | Terminado |
| Panel de administración | Terminado |
| Búsqueda avanzada y ordenamiento por fecha | Terminado |
| Imagen con zoom y control de acceso | Terminado |
| Cifras y mapa por departamento | Terminado |
| Catálogo de biblioteca (691 obras) | Cargado |
| Pestaña Colección con datos del protocolo | Terminada |
| Publicación en GitHub Pages | En línea |

## 14. Trabajo pendiente y recomendaciones

1. Cargar la colección completa de especímenes (hoy hay 8 de ejemplo).
2. Completar los textos institucionales (misión, historia, fundador, integrantes) y las tarifas.
3. Agregar a la tabla nomenclatural los cambios de familia del protocolo (unos 38).
4. Mostrar el contenido (índice) de cada obra de la biblioteca.
5. Alojar el servidor en línea (hosting con Node.js y HTTPS) para administrar sin depender de un equipo local y enviar correos automáticos.
6. Migrar a PostgreSQL si crece el volumen de datos.
7. Incluir en el panel el calendario de mantenimiento y el formato de etiqueta del protocolo.
8. Publicar los datos en SiB Colombia con el formato Darwin Core.

## 15. Cronograma

| Fase | Actividades | Periodo |
|---|---|---|
| 1. Análisis | Revisión de documentos y plantilla de datos | [ ] |
| 2. Diseño | Interfaz basada en el Herbario Forestal UDBC | [ ] |
| 3. Desarrollo | Sitio público, búsqueda, cifras y mapa | [ ] |
| 4. Administración | Panel, usuarios, importación y exportación | [ ] |
| 5. Imágenes | Zoom y solicitudes de acceso | [ ] |
| 6. Contenido | Biblioteca, Colección y datos del protocolo | [ ] |
| 7. Publicación | GitHub Pages y documentación | [ ] |

## 16. Conclusiones

- El herbario cuenta con un sitio web que hace consultable su información y controla el acceso a sus imágenes.
- El panel de administración permite al personal mantener los datos sin conocimientos técnicos.
- El diseño sin dependencias externas y la publicación estática reducen costos y mantenimiento.
- Quedan por completar los datos y textos institucionales, que dependen del herbario.

## 17. Anexos sugeridos

- Capturas de pantalla del sitio y del panel de administración.
- Plantilla Excel de especímenes y catálogo de la biblioteca.
- Protocolo actualizado del herbario 2026.
- Manual de usuario del administrador (basado en la sección 10).
- Carta de la institución que avala la pasantía.
