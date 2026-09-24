<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

if (current_user_id()) {
    redirect('chat.php');
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Create Account | <?= e(APP_NAME) ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
    <link href="<?= e(APP_URL) ?>/assets/css/app.css" rel="stylesheet">
    <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
    <meta name="app-url" content="<?= e(APP_URL) ?>">
</head>
<body class="wc-body wc-auth-page">
    <div class="wc-auth-card">
        <div class="wc-auth-header">
            <h1><i class="fa-solid fa-user-plus"></i> Join <?= e(APP_NAME) ?></h1>
            <p class="mb-0 opacity-75">Create your account</p>
        </div>
        <div class="wc-auth-body">
            <div id="registerAlert" class="alert alert-danger py-2 d-none" role="alert"></div>
            <form id="registerForm" class="wc-form" novalidate>
                <div class="mb-3">
                    <label class="form-label" for="username">Username</label>
                    <input type="text" class="form-control" id="username" name="username" required autofocus
                           minlength="3" maxlength="50" pattern="[a-zA-Z0-9_\.]+"
                           autocomplete="username">
                    <div class="form-text">3–50 characters; letters, numbers, underscores, dots.</div>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="email">Email</label>
                    <input type="email" class="form-control" id="email" name="email" required autocomplete="email">
                </div>
                <div class="mb-3">
                    <label class="form-label" for="password">Password</label>
                    <input type="password" class="form-control" id="password" name="password" required
                           minlength="8" autocomplete="new-password">
                    <div class="form-text">At least 8 characters with upper, lower, and a number.</div>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="confirm_password">Confirm password</label>
                    <input type="password" class="form-control" id="confirm_password" name="confirm_password"
                           required minlength="8" autocomplete="new-password">
                </div>
                <button type="submit" class="btn wc-btn-primary w-100" id="registerBtn">
                    <i class="fa-solid fa-user-plus"></i> Create account
                </button>
            </form>
            <p class="text-center text-muted small mt-3 mb-0">
                Already have an account? <a href="<?= e(APP_URL) ?>/login.php">Sign in</a>
            </p>
        </div>
    </div>

    <script>
    window.WC = window.WC || {};
    WC.appUrl = <?= json_encode(rtrim(APP_URL, '/')) ?>;
    WC.csrf = <?= json_encode(csrf_token()) ?>;
    </script>
    <script src="<?= e(APP_URL) ?>/assets/js/app.js"></script>
    <script>
    (function () {
        var form = document.getElementById('registerForm');
        var alertEl = document.getElementById('registerAlert');
        var btn = document.getElementById('registerBtn');

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            alertEl.classList.add('d-none');

            if (form.password.value !== form.confirm_password.value) {
                alertEl.textContent = 'Password confirmation does not match.';
                alertEl.classList.remove('d-none');
                return;
            }

            btn.disabled = true;

            try {
                await WC.api('auth.php?action=register', {
                    method: 'POST',
                    body: {
                        action: 'register',
                        username: form.username.value.trim(),
                        email: form.email.value.trim(),
                        password: form.password.value,
                        confirm_password: form.confirm_password.value,
                        csrf_token: WC.csrf
                    },
                    silent: true
                });
                WC.toast('Account created!', 'success');
                window.location.href = WC.appUrl + '/login.php?registered=1';
            } catch (err) {
                alertEl.textContent = err.message || 'Registration failed.';
                alertEl.classList.remove('d-none');
            } finally {
                btn.disabled = false;
            }
        });
    })();
    </script>
</body>
</html>
