<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function readRequired(string $label, int $maxLength): string
{
    while (true) {
        fwrite(STDOUT, $label . ': ');
        $input = fgets(STDIN);

        if ($input === false) {
            throw new RuntimeException('No se pudo leer la entrada.');
        }

        $value = trim($input);
        $length = preg_match_all('/./us', $value, $matches);

        if ($value === '' || $length === false || $length > $maxLength) {
            fwrite(STDOUT, 'El valor es obligatorio y no debe exceder ' . $maxLength . " caracteres.\n");
            continue;
        }

        return $value;
    }
}

function readPositiveInteger(string $label): int
{
    while (true) {
        $value = readRequired($label, 10);
        $number = filter_var($value, FILTER_VALIDATE_INT, [
            'options' => [
                'min_range' => 1,
                'max_range' => 2147483647,
            ],
        ]);

        if ($number !== false) {
            return $number;
        }

        fwrite(STDOUT, "Ingrese un entero positivo válido.\n");
    }
}

$documentTypes = [
    '1' => 'Cédula de Ciudadanía',
    '2' => 'Cédula de Extranjería',
    '3' => 'Pasaporte',
];

fwrite(STDOUT, "Creación inicial del usuario Director\n");
fwrite(STDOUT, "Tipo de documento:\n");
foreach ($documentTypes as $number => $documentType) {
    fwrite(STDOUT, "  {$number}. {$documentType}\n");
}

do {
    $documentTypeChoice = readRequired('Seleccione una opción', 1);
    if (!isset($documentTypes[$documentTypeChoice])) {
        fwrite(STDOUT, "Seleccione 1, 2 o 3.\n");
    }
} while (!isset($documentTypes[$documentTypeChoice]));

$documentNumber = readPositiveInteger('Número de documento');
$name = readRequired('Nombres', 50);
$lastName = readRequired('Apellidos', 50);
$userCode = readPositiveInteger('Código interno');
$mobile = readPositiveInteger('Número de celular');
$address = readRequired('Dirección', 50);

$email = getenv('HERBARIO_DIRECTOR_EMAIL') ?: 'herbario@usco.edu.co';
if (strlen($email) > 50 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    fwrite(STDERR, "HERBARIO_DIRECTOR_EMAIL debe ser un correo válido de máximo 50 caracteres.\n");
    exit(1);
}

$password = getenv('HERBARIO_DIRECTOR_PASSWORD');
if ($password === false || strlen($password) < 8) {
    fwrite(STDERR, "Defina HERBARIO_DIRECTOR_PASSWORD con una contraseña de al menos 8 caracteres; se recomiendan 12 o más.\n");
    exit(1);
}

$passwordHash = password_hash($password, PASSWORD_DEFAULT);
putenv('HERBARIO_DIRECTOR_PASSWORD');
unset($password);

if ($passwordHash === false) {
    throw new RuntimeException('No se pudo generar el hash de la contraseña.');
}

$pdo = require __DIR__ . '/../config/database.php';

try {
    $pdo->beginTransaction();
    $pdo->exec('LOCK TABLE public.users IN EXCLUSIVE MODE');

    $directorExists = $pdo->query(
        "SELECT 1 FROM public.users WHERE use_role = 'Director'::public.use_role LIMIT 1"
    )->fetchColumn();

    if ($directorExists !== false) {
        $pdo->rollBack();
        fwrite(STDERR, "Ya existe un usuario Director. No se realizaron cambios.\n");
        exit(1);
    }

    $statement = $pdo->prepare(
        "INSERT INTO public.users (
            use_doc_number,
            use_name,
            use_last_name,
            use_doc_type,
            use_code,
            use_mobile,
            use_address,
            use_email,
            use_password,
            use_role
        ) VALUES (
            :doc_number,
            :name,
            :last_name,
            CAST(:doc_type AS public.use_doc_type),
            :user_code,
            :mobile,
            :address,
            :email,
            :password_hash,
            'Director'::public.use_role
        )"
    );

    $statement->execute([
        'doc_number' => $documentNumber,
        'name' => $name,
        'last_name' => $lastName,
        'doc_type' => $documentTypes[$documentTypeChoice],
        'user_code' => $userCode,
        'mobile' => $mobile,
        'address' => $address,
        'email' => $email,
        'password_hash' => $passwordHash,
    ]);

    $pdo->commit();
    fwrite(STDOUT, "Usuario Director creado correctamente para {$email}.\n");
} catch (PDOException $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    fwrite(STDERR, 'Error de base de datos: ' . $exception->getMessage() . "\n");
    exit(1);
}
