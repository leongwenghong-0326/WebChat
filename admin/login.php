<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/admin_bootstrap.php';

if (current_admin_id()) {
    redirect('admin/index.php');
}

$error = '';
if (request_method() === 'POST') {
    if (!verify_csrf()) {
        $error = 'Invalid security token. Please try again.';
    } else {
        try {
            require_rate_limit('admin_login', RATE_LIMIT_LOGIN, RATE_LIMIT_LOGIN_WINDOW);
            $username = str_input('username');
            $password = (string) (input('password') ?? '');
            $stmt = db()->prepare('SELECT * FROM admins WHERE username = ? LIMIT 1');
            $stmt->execute([$username]);
            $admin = $stmt->fetch();
            if ($admin && password_verify($password, $admin['password_hash'])) {
                login_admin($admin);
                redirect('admin/index.php');
            }
            $error = 'Invalid username or password.';
        } catch (Throwable $e) {
            app_log('Admin login failed: ' . $e->getMessage());
            $error = 'Unable to connect to the database. Start MySQL in XAMPP (port 3307), then open install.php if needed.';
        }
    }
}

$adminTitle = 'Login';
require dirname(__DIR__) . '/includes/admin_layout_start.php';
?>
<div class="wc-auth-card mx-auto" style="max-width: 420px;">
    <div class="wc-auth-header">
        <h1><i class="fa-solid fa-shield-halved"></i> <?= e(APP_NAME) ?></h1>
        <p class="mb-0 opacity-75">Admin sign in</p>
    </div>
    <div class="wc-auth-body">
        <p class="text-muted small text-center mb-2">DEMO ONLY</p>
        <button type="button" class="btn btn-outline-secondary btn-sm w-100 mb-3" id="btnFillDemo"
                data-username="admin" data-password="admin123"
                title="Click to autofill demo credentials">
            <i class="fa-solid fa-key"></i>
            Use demo: <code>admin</code> / <code>admin123</code>
        </button>
        <?php if ($error): ?>
        <div class="alert alert-danger py-2"><?= e($error) ?></div>
        <?php endif; ?>
        <form method="post" id="adminLoginForm">
            <?= csrf_field() ?>
            <div class="mb-3">
                <label class="form-label" for="username">Username</label>
                <input type="text" class="form-control" id="username" name="username" required autofocus>
            </div>
            <div class="mb-3">
                <label class="form-label" for="password">Password</label>
                <input type="password" class="form-control" id="password" name="password" required>
            </div>
            <button type="submit" class="btn btn-primary w-100">Sign in</button>
        </form>
    </div>
</div>
<script>
(function () {
    var btn = document.getElementById('btnFillDemo');
    if (!btn) return;
    btn.addEventListener('click', function () {
        var user = document.getElementById('username');
        var pass = document.getElementById('password');
        if (user) user.value = btn.getAttribute('data-username') || 'admin';
        if (pass) pass.value = btn.getAttribute('data-password') || 'admin123';
        if (user) user.focus();
    });
})();
</script>
<?php require dirname(__DIR__) . '/includes/admin_layout_end.php'; ?>