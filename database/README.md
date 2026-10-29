# Base de datos de Herbario

El esquema de `schema.sql` proviene del volcado PostgreSQL entregado para el proyecto. Contiene la estructura y los tipos de datos; no contiene filas de datos.

## Requisitos

- PostgreSQL 15 o compatible.
- PHP CLI con las extensiones `PDO` y `pdo_pgsql`.

## Importar el esquema

Desde la raíz del proyecto, cree una base de datos vacía y restaure el esquema como el usuario PostgreSQL que puede asignar los objetos al propietario `postgres`:

```powershell
createdb -U postgres herbario
psql -U postgres -d herbario -v ON_ERROR_STOP=1 -f database\schema.sql
```

Si la base ya existe, no vuelva a importar el esquema sobre objetos existentes.

## Crear el usuario Director

El alta es un comando de consola, no una página web. Solicita los datos personales obligatorios definidos en `public.users` y solo permite crear un Director cuando todavía no existe uno. La contraseña debe tener al menos 8 caracteres (se recomiendan 12 o más), se guarda con `password_hash()` y no está escrita en el código.

Configure las variables de conexión `HERBARIO_DB_HOST`, `HERBARIO_DB_PORT`, `HERBARIO_DB_NAME`, `HERBARIO_DB_USER` y `HERBARIO_DB_PASSWORD`. `HERBARIO_DIRECTOR_EMAIL` puede cambiar el correo inicial documentado; si no se define, se utiliza ese correo.

En Windows PowerShell, puede introducir los secretos sin escribirlos en el historial:

```powershell
$dbSecret = Read-Host 'Contraseña de PostgreSQL' -AsSecureString
$directorSecret = Read-Host 'Contraseña del Director (mínimo 8 caracteres)' -AsSecureString
$dbPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbSecret)
$directorPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($directorSecret)
try {
    $env:HERBARIO_DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($dbPointer)
    $env:HERBARIO_DIRECTOR_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($directorPointer)
    php database\create_director.php
} finally {
    Remove-Item Env:HERBARIO_DB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:HERBARIO_DIRECTOR_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($dbPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($directorPointer)
}
```

No publique el comando ni sus variables de entorno con contraseñas en archivos versionados o registros compartidos. El script de alta está fuera de `public/` y rechaza cualquier ejecución que no sea por CLI.
