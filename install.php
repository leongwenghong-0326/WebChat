<?php
declare(strict_types=1);

/**
 * WebConnect one-time installer.
 * Delete this file after successful setup.
 */

$error = '';
$success = '';
$step = $_POST['step'] ?? 'form';

function write_local_config(string $host, string $port, string $name, string $user, string $pass, string $appUrl): void
{
    $passExport = var_export($pass, true);
    $content = "<?php\n"
        . "declare(strict_types=1);\n\n"
        . "// Local overrides for WebConnect - do not commit secrets\n"
        . "define('DB_HOST', " . var_export($host, true) . ");\n"
        . "define('DB_PORT', " . var_export($port, true) . ");\n"
        . "define('DB_NAME', " . var_export($name, true) . ");\n"
        . "define('DB_USER', " . var_export($user, true) . ");\n"
        . "define('DB_PASS', {$passExport});\n"
        . "define('APP_URL', " . var_export(rtrim($appUrl, '/'), true) . ");\n"
        . "define('DISPLAY_ERRORS', true);\n";
    file_put_contents(__DIR__ . '/includes/config.local.php', $content);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $step === 'install') {
    $host = trim((string)($_POST['db_host'] ?? '127.0.0.1'));
    $port = trim((string)($_POST['db_port'] ?? '3307'));
    $name = trim((string)($_POST['db_name'] ?? 'webconnect'));
    $user = trim((string)($_POST['db_user'] ?? 'root'));
    $pass = (string)($_POST['db_pass'] ?? '');
    $appUrl = trim((string)($_POST['app_url'] ?? 'http://localhost/webchat'));

    try {
        $pdo = new PDO(
            "mysql:host={$host};port={$port};charset=utf8mb4",
            $user,
            $pass,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `{$name}`");

        $sql = file_get_contents(__DIR__ . '/database/database.sql');
        if ($sql === false) {
            throw new RuntimeException('Could not read database/database.sql');
        }
        // Strip CREATE DATABASE / USE so we install into the chosen DB
        $sql = preg_replace('/CREATE DATABASE.*?;/is', '', $sql) ?? $sql;
        $sql = preg_replace('/USE\s+`?webconnect`?\s*;/i', '', $sql) ?? $sql;

        $mysqli = new mysqli($host, $user, $pass, $name, (int)$port);
        if ($mysqli->connect_error) {
            throw new RuntimeException($mysqli->connect_error);
        }
        $mysqli->set_charset('utf8mb4');
        if (!$mysqli->multi_query($sql)) {
            throw new RuntimeException('Schema import failed: ' . $mysqli->error);
        }
        do {
            if ($res = $mysqli->store_result()) {
                $res->free();
            }
        } while ($mysqli->more_results() && $mysqli->next_result());

        // Ensure admin password hash is correct for Admin@ChangeMe1
        $hash = password_hash('admin123', PASSWORD_DEFAULT);
        $stmt = $mysqli->prepare('UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE username = ?');
        $adminUser = 'admin';
        $stmt->bind_param('ss', $hash, $adminUser);
        $stmt->execute();
        $stmt->close();


        $mysqli->close();
        write_local_config($host, $port, $name, $user, $pass, $appUrl);

        foreach (['avatars', 'images', 'files', 'voices', 'groups'] as $dir) {
            $p = __DIR__ . '/uploads/' . $dir;
            if (!is_dir($p)) {
                mkdir($p, 0755, true);
            }
        }
        if (!is_dir(__DIR__ . '/logs')) {
            mkdir(__DIR__ . '/logs', 0755, true);
        }

        $success = 'Installation complete. You can sign in and should delete install.php.';
        $step = 'done';
    } catch (Throwable $e) {
        $error = $e->getMessage();
        $step = 'form';
    }
}

$defaultUrl = 'http://localhost/webchat';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>WebConnect Installer</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background: linear-gradient(160deg, #0d3d36, #1a6b5c 45%, #d8efe9); min-height: 100vh; }
        .card { border: 0; border-radius: 1rem; box-shadow: 0 12px 40px rgba(0,0,0,.18); }
        .btn-primary { background: #1a6b5c; border-color: #1a6b5c; }
    </style>
</head>
<body class="d-flex align-items-center py-5">
<div class="container" style="max-width:640px">
    <div class="card p-4 p-md-5">
        <h1 class="h3 mb-1">WebConnect Installer</h1>
        <p class="text-muted">Create the database, import schema, and write local config.</p>
        <?php if ($error): ?><div class="alert alert-danger"><?= htmlspecialchars($error) ?></div><?php endif; ?>
        <?php if ($success): ?>
            <div class="alert alert-success"><?= htmlspecialchars($success) ?></div>
            <ul>
                <li>User app: <a href="<?= htmlspecialchars($defaultUrl) ?>/login.php"><?= htmlspecialchars($defaultUrl) ?>/login.php</a></li>
                <li>Admin: <a href="<?= htmlspecialchars($defaultUrl) ?>/admin/login.php">admin/login.php</a></li>
                <li>Admin DEMO: <code>admin</code> / <code>Admin@ChangeMe1</code> (change after login)</li>
                <li>Users: create accounts at <code>register.php</code></li>
            </ul>
            <p class="text-danger fw-semibold">Delete <code>install.php</code> after setup.</p>
        <?php else: ?>
        <form method="post">
            <input type="hidden" name="step" value="install">
            <div class="row g-3">
                <div class="col-md-8"><label class="form-label">DB Host</label><input class="form-control" name="db_host" value="127.0.0.1" required></div>
                <div class="col-md-4"><label class="form-label">Port</label><input class="form-control" name="db_port" value="3307" required></div>
                <div class="col-md-6"><label class="form-label">Database</label><input class="form-control" name="db_name" value="webconnect" required></div>
                <div class="col-md-6"><label class="form-label">DB User</label><input class="form-control" name="db_user" value="root" required></div>
                <div class="col-12"><label class="form-label">DB Password</label><input class="form-control" name="db_pass" type="password" placeholder="Leave empty for default XAMPP"></div>
                <div class="col-12"><label class="form-label">APP URL</label><input class="form-control" name="app_url" value="<?= htmlspecialchars($defaultUrl) ?>" required></div>
                <div class="col-12">
                    <p class="small text-muted mb-0">Create user accounts yourself at <code>register.php</code> after install. No demo users are created.</p>
                </div>
                <div class="col-12"><button class="btn btn-primary w-100" type="submit">Install WebConnect</button></div>
            </div>
        </form>
        <p class="small text-muted mt-3 mb-0">If connection fails on port 3306, start MySQL from the XAMPP Control Panel. A separate MySQL 8 Windows service may be using a different password.</p>
        <?php endif; ?>
    </div>
</div>
</body>
</html>