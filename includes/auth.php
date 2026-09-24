<?php
declare(strict_types=1);

function start_app_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_name(SESSION_NAME);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function start_admin_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_name(ADMIN_SESSION_NAME);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function current_user_id(): ?int
{
    return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
}

function current_admin_id(): ?int
{
    return isset($_SESSION['admin_id']) ? (int) $_SESSION['admin_id'] : null;
}

function require_login(): void
{
    $uid = current_user_id();
    if (!$uid) {
        if (is_api_request()) {
            json_error('Unauthorized', 401);
        }
        redirect('login.php');
    }

    $user = get_user_by_id($uid);
    if (!$user || (int) $user['is_disabled'] === 1) {
        logout_user();
        if (is_api_request()) {
            json_error('Account disabled or not found', 403);
        }
        redirect('login.php?error=disabled');
    }

    touch_presence($uid, 'online');
}

function require_admin(): void
{
    if (!current_admin_id()) {
        redirect('admin/login.php');
    }
}

function is_api_request(): bool
{
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    return str_contains($uri, '/api/')
        || (isset($_SERVER['HTTP_ACCEPT']) && str_contains($_SERVER['HTTP_ACCEPT'], 'application/json'));
}

function login_user(array $user): void
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['username'] = $user['username'];
    csrf_token();
    touch_presence((int) $user['id'], 'online');
}

function logout_user(): void
{
    $uid = current_user_id();
    if ($uid) {
        $stmt = db()->prepare("UPDATE users SET presence = 'offline', last_seen_at = NOW() WHERE id = ?");
        $stmt->execute([$uid]);
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'] ?? '', (bool) $p['secure'], (bool) $p['httponly']);
    }
    session_destroy();
}

function login_admin(array $admin): void
{
    session_regenerate_id(true);
    $_SESSION['admin_id'] = (int) $admin['id'];
    $_SESSION['admin_username'] = $admin['username'];
    csrf_token();
    $stmt = db()->prepare('UPDATE admins SET last_login_at = NOW() WHERE id = ?');
    $stmt->execute([(int) $admin['id']]);
}

function logout_admin(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'] ?? '', (bool) $p['secure'], (bool) $p['httponly']);
    }
    session_destroy();
}

function validate_password(string $password): ?string
{
    if (strlen($password) < 8) {
        return 'Password must be at least 8 characters.';
    }
    if (!preg_match('/[A-Z]/', $password)) {
        return 'Password must include an uppercase letter.';
    }
    if (!preg_match('/[a-z]/', $password)) {
        return 'Password must include a lowercase letter.';
    }
    if (!preg_match('/[0-9]/', $password)) {
        return 'Password must include a number.';
    }
    return null;
}

function validate_username(string $username): ?string
{
    if ($username === '' || strlen($username) < 3 || strlen($username) > 50) {
        return 'Username must be 3-50 characters.';
    }
    if (!preg_match('/^[a-zA-Z0-9_\.]+$/', $username)) {
        return 'Username may only contain letters, numbers, underscores, and dots.';
    }
    return null;
}
