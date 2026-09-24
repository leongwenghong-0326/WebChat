<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';

$action = str_input('action');
$pdo = db();

function profile_payload(array $user): array
{
    $data = public_user($user);
    $data['email'] = $user['email'];
    return $data;
}

function find_user_by_login(string $login): ?array
{
    $stmt = db()->prepare(
        'SELECT id, username, email, password_hash, avatar, status_message, presence,
                last_seen_at, last_activity_at, is_disabled, created_at
         FROM users
         WHERE username = ? OR email = ?
         LIMIT 1'
    );
    $stmt->execute([$login, $login]);
    $row = $stmt->fetch();
    return $row ?: null;
}

switch ($action) {
    case 'register':
        require_csrf();

        $username = str_input('username');
        $email = strtolower(str_input('email'));
        $password = (string) (input('password') ?? '');
        $confirm = (string) (input('confirm_password') ?? '');

        $usernameErr = validate_username($username);
        if ($usernameErr) {
            json_error($usernameErr);
        }

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_error('Please enter a valid email address.');
        }

        if ($password !== $confirm) {
            json_error('Password confirmation does not match.');
        }

        $passwordErr = validate_password($password);
        if ($passwordErr) {
            json_error($passwordErr);
        }

        $check = $pdo->prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1');
        $check->execute([$username, $email]);
        $existing = $check->fetch();
        if ($existing) {
            if (strcasecmp($existing['username'], $username) === 0) {
                json_error('Username is already taken.');
            }
            json_error('Email is already registered.');
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $ins = $pdo->prepare(
            'INSERT INTO users (username, email, password_hash, presence) VALUES (?, ?, ?, \'offline\')'
        );
        $ins->execute([$username, $email, $hash]);

        json_success('Account created successfully. You can now sign in.');

    case 'login':
        require_csrf();
        require_rate_limit('login', RATE_LIMIT_LOGIN, RATE_LIMIT_LOGIN_WINDOW);

        $login = str_input('login');
        $password = (string) (input('password') ?? '');

        if ($login === '' || $password === '') {
            json_error('Login and password are required.');
        }

        $user = find_user_by_login($login);
        if (!$user || !password_verify($password, $user['password_hash'])) {
            json_error('Invalid username/email or password.', 401);
        }

        if ((int) $user['is_disabled'] === 1) {
            json_error('This account has been disabled.', 403);
        }

        login_user($user);
        json_success('Signed in.', ['user' => profile_payload($user)]);

    case 'logout':
        require_csrf();
        logout_user();
        json_success('Signed out.');

    case 'me':
        require_login();
        $uid = current_user_id();
        $user = get_user_by_id($uid);
        if (!$user) {
            json_error('User not found.', 404);
        }
        json_success('OK', ['user' => profile_payload($user)]);

    default:
        json_error('Unknown action.', 404);
}
