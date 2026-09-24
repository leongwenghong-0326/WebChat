<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';

require_login();

$action = str_input('action');
$uid = current_user_id();
$pdo = db();

function own_profile(int $uid): array
{
    $user = get_user_by_id($uid);
    if (!$user) {
        json_error('User not found.', 404);
    }
    $data = public_user($user);
    $data['email'] = $user['email'];
    return $data;
}

function delete_avatar_file(?string $filename): void
{
    if (!$filename) {
        return;
    }
    $safe = basename($filename);
    if ($safe === '' || $safe === '.' || $safe === '..') {
        return;
    }
    $path = APP_PATH . '/uploads/avatars/' . $safe;
    if (is_file($path)) {
        @unlink($path);
    }
}

switch ($action) {
    case 'get':
        json_success('OK', ['profile' => own_profile($uid)]);

    case 'update':
        require_csrf();

        $user = get_user_by_id($uid);
        if (!$user) {
            json_error('User not found.', 404);
        }

        $statusMessage = str_input('status_message');
        if (strlen($statusMessage) > 255) {
            json_error('Status message must be 255 characters or fewer.');
        }

        $newUsername = str_input('username');
        $usernameToSave = $user['username'];

        if ($newUsername !== '' && strcasecmp($newUsername, $user['username']) !== 0) {
            $usernameErr = validate_username($newUsername);
            if ($usernameErr) {
                json_error($usernameErr);
            }

            $check = $pdo->prepare('SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1');
            $check->execute([$newUsername, $uid]);
            if ($check->fetch()) {
                json_error('Username is already taken.');
            }
            $usernameToSave = $newUsername;
        }

        $upd = $pdo->prepare(
            'UPDATE users SET username = ?, status_message = ?, updated_at = NOW() WHERE id = ?'
        );
        $upd->execute([$usernameToSave, $statusMessage !== '' ? $statusMessage : null, $uid]);

        $_SESSION['username'] = $usernameToSave;

        json_success('Profile updated.', ['profile' => own_profile($uid)]);

    case 'password':
        require_csrf();

        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$uid]);
        $row = $stmt->fetch();
        if (!$row) {
            json_error('User not found.', 404);
        }

        $current = (string) (input('current_password') ?? '');
        $newPassword = (string) (input('new_password') ?? '');
        $confirm = (string) (input('confirm') ?? '');

        if ($current === '' || $newPassword === '' || $confirm === '') {
            json_error('All password fields are required.');
        }

        if (!password_verify($current, $row['password_hash'])) {
            json_error('Current password is incorrect.');
        }

        if ($newPassword !== $confirm) {
            json_error('New password confirmation does not match.');
        }

        $passwordErr = validate_password($newPassword);
        if ($passwordErr) {
            json_error($passwordErr);
        }

        $hash = password_hash($newPassword, PASSWORD_DEFAULT);
        $upd = $pdo->prepare('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?');
        $upd->execute([$hash, $uid]);

        json_success('Password changed successfully.');

    case 'avatar':
        require_csrf();

        $user = get_user_by_id($uid);
        if (!$user) {
            json_error('User not found.', 404);
        }

        if (empty($_FILES['avatar'])) {
            json_error('No avatar file uploaded.');
        }

        try {
            $meta = store_upload($_FILES['avatar'], 'avatar');
        } catch (InvalidArgumentException $e) {
            json_error($e->getMessage());
        } catch (Throwable $e) {
            app_log('Avatar upload error: ' . $e->getMessage());
            json_error('Unable to upload avatar.', 500);
        }

        delete_avatar_file($user['avatar'] ?? null);

        $upd = $pdo->prepare('UPDATE users SET avatar = ?, updated_at = NOW() WHERE id = ?');
        $upd->execute([$meta['stored_name'], $uid]);

        json_success('Avatar updated.', ['profile' => own_profile($uid)]);

    default:
        json_error('Unknown action.', 404);
}
