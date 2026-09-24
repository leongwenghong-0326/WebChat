<?php
declare(strict_types=1);

/**
 * One-time fix for cPanel demo login.
 * Open once:
 *   https://leongwenghong.kolejsynergy.com/webchat/fix_demo_login.php?key=WebConnectFix2026
 * Then DELETE this file.
 */

$key = (string) ($_GET['key'] ?? '');
if ($key !== 'WebConnectFix2026') {
    http_response_code(403);
    echo 'Forbidden. Append ?key=WebConnectFix2026 to the URL.';
    exit;
}

require_once __DIR__ . '/includes/bootstrap.php';

header('Content-Type: text/plain; charset=utf-8');

try {
    $pdo = db();
    $userHash = password_hash('Hong0326', PASSWORD_DEFAULT);
    $adminHash = password_hash('admin123', PASSWORD_DEFAULT);

    $stmt = $pdo->prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1');
    $stmt->execute(['Lwh_0326', 'leongwenghong5@gmail.com']);
    $user = $stmt->fetch();

    if ($user) {
        $upd = $pdo->prepare('UPDATE users SET password_hash = ?, is_disabled = 0, username = ?, email = ? WHERE id = ?');
        $upd->execute([$userHash, 'Lwh_0326', 'leongwenghong5@gmail.com', $user['id']]);
        echo "Updated user #{$user['id']} password to Hong0326\n";
    } else {
        $ins = $pdo->prepare(
            'INSERT INTO users (username, email, password_hash, status_message, presence, is_disabled)
             VALUES (?, ?, ?, ?, ?, 0)'
        );
        $ins->execute(['Lwh_0326', 'leongwenghong5@gmail.com', $userHash, "Let's be friend!!!", 'offline']);
        echo "Created user Lwh_0326 with password Hong0326\n";
    }

    $admin = $pdo->prepare('SELECT id FROM admins WHERE username = ? LIMIT 1');
    $admin->execute(['admin']);
    $a = $admin->fetch();
    if ($a) {
        $pdo->prepare('UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?')
            ->execute([$adminHash, $a['id']]);
        echo "Updated admin password to admin123\n";
    } else {
        $pdo->prepare(
            'INSERT INTO admins (username, email, password_hash, must_change_password) VALUES (?, ?, ?, 0)'
        )->execute(['admin', 'admin@webconnect.local', $adminHash]);
        echo "Created admin / admin123\n";
    }

    // Clear login rate limits so failed attempts don't block you
    $pdo->exec("DELETE FROM rate_limits WHERE rate_key LIKE 'login:%' OR rate_key LIKE '%login%'");
    echo "Cleared login rate limits\n";

    echo "\nDONE. Login with:\n";
    echo "  User:  Lwh_0326  /  Hong0326\n";
    echo "  Admin: admin     /  admin123\n";
    echo "\nDELETE fix_demo_login.php from the server now.\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo 'ERROR: ' . $e->getMessage() . "\n";
    echo "Check includes/config.local.php database settings.\n";
}
