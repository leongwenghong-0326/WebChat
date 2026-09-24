<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

if (current_user_id()) {
    redirect('chat.php');
}

$registered = isset($_GET['registered']);
$disabled = isset($_GET['error']) && $_GET['error'] === 'disabled';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign In | <?= e(APP_NAME) ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
    <link href="<?= e(APP_URL) ?>/assets/css/app.css" rel="stylesheet">
    <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
    <meta name="app-url" content="<?= e(APP_URL) ?>">
</head>
<body class="wc-body wc-auth-page">
    <div class="wc-auth-card">
        <div class="wc-auth-header">
            <h1><i class="fa-solid fa-comments"></i> <?= e(APP_NAME) ?></h1>
            <p class="mb-0 opacity-75">Sign in to continue</p>
        </div>
        <div class="wc-auth-body">
            <?php if ($registered): ?>
            <div class="alert alert-success py-2">Account created. Please sign in.</div>
            <?php endif; ?>
            <?php if ($disabled): ?>
            <div class="alert alert-danger py-2">Your account has been disabled.</div>
            <?php endif; ?>
            <p class="text-muted small text-center mb-2">DEMO ONLY (autofill — not stored by the app)</p>
            <div class="d-grid gap-2 mb-3">
                <button type="button" class="btn btn-outline-secondary btn-sm" id="btnFillDemoUser"
                        data-login="Lwh_0326" data-password="Hong0326"
                        title="Click to autofill username">
                    <i class="fa-solid fa-key"></i>
                    Use username: <code>Lwh_0326</code>
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="btnFillDemoEmail"
                        data-login="leongwenghong5@gmail.com" data-password="Hong0326"
                        title="Click to autofill email">
                    <i class="fa-solid fa-envelope"></i>
                    Use email: <code>leongwenghong5@gmail.com</code>
                </button>
            </div>
            <div id="loginAlert" class="alert alert-danger py-2 d-none" role="alert"></div>
            <form id="loginForm" class="wc-form" novalidate>
                <div class="mb-3">
                    <label class="form-label" for="login">Username or email</label>
                    <input type="text" class="form-control" id="login" name="login" required autofocus autocomplete="username">
                </div>
                <div class="mb-3">
                    <label class="form-label" for="password">Password</label>
                    <input type="password" class="form-control" id="password" name="password" required autocomplete="current-password">
                </div>
                <button type="submit" class="btn wc-btn-primary w-100" id="loginBtn">
                    <i class="fa-solid fa-right-to-bracket"></i> Sign in
                </button>
            </form>
            <p class="text-center text-muted small mt-3 mb-0">
                No account? <a href="<?= e(APP_URL) ?>/register.php">Create one</a>
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
        var form = document.getElementById('loginForm');
        var alertEl = document.getElementById('loginAlert');
        var btn = document.getElementById('loginBtn');

        function fillDemo(button) {
            if (!button || !form) return;
            form.login.value = button.getAttribute('data-login') || '';
            form.password.value = button.getAttribute('data-password') || '';
            form.login.focus();
        }

        var fillUser = document.getElementById('btnFillDemoUser');
        var fillEmail = document.getElementById('btnFillDemoEmail');
        if (fillUser) fillUser.addEventListener('click', function () { fillDemo(fillUser); });
        if (fillEmail) fillEmail.addEventListener('click', function () { fillDemo(fillEmail); });

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            alertEl.classList.add('d-none');
            btn.disabled = true;

            try {
                await WC.api('auth.php?action=login', {
                    method: 'POST',
                    body: {
                        action: 'login',
                        login: form.login.value.trim(),
                        password: form.password.value,
                        csrf_token: WC.csrf
                    },
                    silent: true
                });
                WC.toast('Signed in successfully.', 'success');
                window.location.href = WC.appUrl + '/chat.php';
            } catch (err) {
                alertEl.textContent = err.message || 'Sign in failed.';
                alertEl.classList.remove('d-none');
            } finally {
                btn.disabled = false;
            }
        });
    })();
    </script>
</body>
</html>
