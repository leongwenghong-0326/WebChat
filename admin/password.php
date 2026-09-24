<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/admin_bootstrap.php';
require_admin();

$error = '';
$success = '';
$adminId = (int) current_admin_id();

if (request_method() === 'POST') {
    if (!verify_csrf()) {
        $error = 'Invalid security token. Please try again.';
    } else {
        $current = (string) (input('current_password') ?? '');
        $new = (string) (input('new_password') ?? '');
        $confirm = (string) (input('confirm_password') ?? '');

        try {
            $stmt = db()->prepare('SELECT id, password_hash FROM admins WHERE id = ? LIMIT 1');
            $stmt->execute([$adminId]);
            $admin = $stmt->fetch();

            if (!$admin || !password_verify($current, $admin['password_hash'])) {
                $error = 'Current password is incorrect.';
            } elseif ($new !== $confirm) {
                $error = 'New password confirmation does not match.';
            } else {
                $passwordErr = validate_password($new);
                if ($passwordErr) {
                    $error = $passwordErr;
                } elseif (password_verify($new, $admin['password_hash'])) {
                    $error = 'New password must be different from the current password.';
                } else {
                    $hash = password_hash($new, PASSWORD_DEFAULT);
                    $upd = db()->prepare(
                        'UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?'
                    );
                    $upd->execute([$hash, $adminId]);
                    $success = 'Password updated successfully.';
                }
            }
        } catch (Throwable $e) {
            app_log('Admin password change failed: ' . $e->getMessage());
            $error = 'Unable to update password. Please try again.';
        }
    }
}

$adminTitle = 'Change Password';
$activeAdminNav = 'password';
require dirname(__DIR__) . '/includes/admin_layout_start.php';
?>
<h1 class="h3 mb-3">Change Password</h1>
<p class="text-muted mb-4">Update your admin password. After changing it, the demo warning banner will disappear.</p>

<?php if ($error): ?>
<div class="alert alert-danger"><?= e($error) ?></div>
<?php endif; ?>
<?php if ($success): ?>
<div class="alert alert-success"><?= e($success) ?></div>
<?php endif; ?>

<div class="card wc-card shadow-sm" style="max-width: 480px;">
    <div class="card-body">
        <form method="post" autocomplete="off">
            <?= csrf_field() ?>
            <div class="mb-3">
                <label class="form-label" for="current_password">Current password</label>
                <input type="password" class="form-control" id="current_password" name="current_password" required>
            </div>
            <div class="mb-3">
                <label class="form-label" for="new_password">New password</label>
                <input type="password" class="form-control" id="new_password" name="new_password" required minlength="8">
                <div class="form-text">At least 8 characters, with uppercase, lowercase, and a number.</div>
            </div>
            <div class="mb-3">
                <label class="form-label" for="confirm_password">Confirm new password</label>
                <input type="password" class="form-control" id="confirm_password" name="confirm_password" required minlength="8">
            </div>
            <button type="submit" class="btn btn-primary">
                <i class="fa-solid fa-key"></i> Update password
            </button>
        </form>
    </div>
</div>
<?php require dirname(__DIR__) . '/includes/admin_layout_end.php'; ?>