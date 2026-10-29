# Herbario SURCO

Sitio web del Herbario SURCO de la Universidad Surcolombiana, con panel de administración. Su diseño sigue el del Herbario Forestal UDBC y está adaptado a móvil. Funciona con un servidor Node.js sin dependencias externas (usa `node:sqlite`, incluido en Node reciente) y una base SQLite.

## Iniciar

1. Instala [Node.js](https://nodejs.org/) (versión reciente con `node:sqlite`).
2. Crea tu cuenta de administrador (la contraseña se pide por pantalla, mínimo 10 caracteres con letras y números; no se guarda en archivos):

```powershell
npm.cmd run crear-admin
```

3. Inicia el sitio:

```powershell
npm.cmd run dev
```

- Sitio público: `http://127.0.0.1:5173`
- Administración: `http://127.0.0.1:5173/admin/` (no hay enlace en el sitio público; se entra escribiendo la dirección).

Variables opcionales: `PORT`, `HOST` (por defecto `127.0.0.1`), `HERBARIO_DATA` (carpeta de datos), `HERBARIO_DB` (archivo de la base) y `HERBARIO_SECURE=1` si se publica con HTTPS.

## Panel de administración

Permite agregar, editar y eliminar: **Especímenes**, **Publicaciones**, **Biblioteca**, **Integrantes**, **Acerca** (introducción, misión, fundador, historia, términos), **Contacto** (teléfono, dirección, Instagram) y **Usuarios**. Cada lista admite importar, exportar y descargar plantilla CSV, y las imágenes (portadas y fotos) se suben como PNG, JPG o WEBP de hasta 3 MB.

**Cifras** no se edita a mano: se calcula con los especímenes (el número de «Ejemplares tipo» sale de la casilla «Es ejemplar tipo» de cada espécimen).

Los datos viven en `data/herbario.db` y las imágenes en `data/uploads/`. **Haz copias de seguridad de la carpeta `data/`.** Al primer arranque se cargan los 8 ejemplares de la plantilla Excel (`server/seed/specimens.seed.js`).

Seguridad: contraseñas con scrypt, sesión por cookie HttpOnly/SameSite, bloqueo de 15 minutos tras 5 intentos fallidos, cabecera obligatoria en peticiones que modifican datos, validación de enlaces e imágenes, y política CSP. Si el sitio se publica en Internet, usa HTTPS.
## Secciones

La navegación usa rutas limpias (por ejemplo `/contacto/`); el servidor entrega `public/index.html` en cada una y cada sección es una vista de esa página. Los enlaces antiguos con `#` (como `/#contacto`) se redirigen solos:

| Vista | Ruta | Contenido |
| --- | --- | --- |
| Inicio | `/` | Búsqueda rápida y enlace a búsqueda avanzada |
| Especímenes | `/especimenes/` | Resultados con tarjetas y descarga en XLSX (todos o uno) |
| Ejemplar | `/ejemplar/<número>/` | Detalle de un espécimen y descarga individual |
| Búsqueda avanzada | `/busqueda-avanzada/` | Filtros por catálogo, taxonomía, localidad, colector y hábito |
| Acerca | `/acerca/` | Misión, fundador, integrantes, historia y términos |
| Cifras | `/cifras/` | Estadísticas calculadas de los datos, listas y mapa de Colombia por departamento |
| Servicios | `/servicios/` | Tarjetas de servicios y tabla de tarifas (por definir) |
| Biblioteca | `/biblioteca/` | Catálogo bibliográfico con filtros |
| Publicaciones, Contacto | `/publicaciones/`, `/contacto/` | Publicaciones del herbario y datos de contacto con mapa |

## Archivos principales

- `public/index.html`: estructura de todas las vistas.
- `public/assets/css/styles.css`: estilos.
- `public/assets/js/app.js`: enrutado, búsqueda, resultados, descarga XLSX (generada sin librerías) y cifras.
- `server/`: servidor (`index.js`), base SQLite (`db.js`), seguridad (`security.js`) y creación de administradores (`create-admin.js`). La ruta `/assets/js/data.js` entrega al sitio los datos guardados en la base.
- `public/admin/`: panel de administración.
- `public/assets/js/colombia-map.js`: contornos departamentales simplificados (DANE, MGN 2018) para el mapa de Cifras.
- `public/assets/img/logo-herbario-surco.png`: logo.

## Estado actual

Los datos se guardan en SQLite. El esquema PostgreSQL y el script de Director de la carpeta `database/` quedan como ruta de migración futura; no se usan ahora.

- En la plantilla se omitió la fila 2 (ejemplo) y las filas 11 y 12 (sin número de catálogo ni identificación).
- La plantilla no trae el identificador de institución que exige la tabla SQL, y las coordenadas decimales están fuera de rango; no se inventaron esos datos.
- No hay datos de altura, nombre común ni ejemplares tipo; se pueden completar desde el panel.
- Los textos institucionales (misión, historia, fundador, tarifas) siguen pendientes hasta que se escriban en el panel (las tarifas aún están fijas en `index.html`).
## Publicar la parte p�blica en l�nea (GitHub Pages)

1. `npm run publicar` genera `docs/` con el sitio est�tico (sin administraci�n).
2. `git add -A`, `git commit -m "Publicar sitio"` y `git push`.
3. En GitHub: Settings ? Pages ? Branch `main` y carpeta `/docs`.

El sitio queda en https://u20211197389-create.github.io/herbario/. Cada vez que cambies datos en el panel, repite los pasos 1 y 2.
