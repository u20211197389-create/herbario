<?php
declare(strict_types=1);

$host = getenv('HERBARIO_DB_HOST') ?: '127.0.0.1';
$port = getenv('HERBARIO_DB_PORT') ?: '5432';
$database = getenv('HERBARIO_DB_NAME') ?: 'herbario';
$username = getenv('HERBARIO_DB_USER') ?: 'postgres';
$password = getenv('HERBARIO_DB_PASSWORD');

if ($password === false) {
    throw new RuntimeException('Defina la variable HERBARIO_DB_PASSWORD antes de conectarse.');
}

if (!ctype_digit($port) || (int) $port < 1 || (int) $port > 65535) {
    throw new InvalidArgumentException('HERBARIO_DB_PORT debe ser un puerto válido.');
}

$dsn = sprintf(
    'pgsql:host=%s;port=%s;dbname=%s',
    $host,
    $port,
    $database
);

try {
    return new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $exception) {
    throw new RuntimeException(
        'No se pudo conectar con PostgreSQL: ' . $exception->getMessage(),
        0,
        $exception
    );
}
