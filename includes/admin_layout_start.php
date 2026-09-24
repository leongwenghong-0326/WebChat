<?php
declare(strict_types=1);
/** @var string $adminTitle */
/** @var string $activeAdminNav */
$adminTitle = $adminTitle ?? 'Admin';
$activeAdminNav = $activeAdminNav ?? '';
$adminId = current_admin_id();
$adminUser = (string) ($_SESSION['admin_username'] ?? 'Admin');
$mustChange = false;
if ($adminId) {
    $stmt = db()->prepare('SELECT must_change_password FROM admins WHERE id = ? LIMIT 1');
    $stmt->execute([$adminId]);
    $mustChange = (int) $stmt->fetchColumn() === 1;
}

if (!function_exists('wc_asset_ver')) {
    function wc_asset_ver(string $relativePath): string
    {
        $full = APP_PATH . '/' . ltrim(str_replace('\\', '/', $relativePath), '/');
        return is_file($full) ? (string) filemtime($full) : (string) time();
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($adminTitle) ?> | <?= e(APP_NAME) ?> Admin</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
    <link href="<?= e(APP_URL) ?>/assets/css/app.css?v=<?= e(wc_asset_ver('assets/css/app.css')) ?>" rel="stylesheet">
    <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
    <meta name="app-url" content="<?= e(APP_URL) ?>">
</head>
<body class="wc-body<?= $adminId ? ' wc-app' : ' wc-auth-page' ?>">
<?php if ($adminId): ?>
<button type="button" class="wc-sidebar-toggle" id="btnSidebarToggle" aria-label="Open menu">
    <i class="fa-solid fa-bars"></i>
</button>
<div class="wc-sidebar-backdrop" id="sidebarBackdrop"></div>
<aside class="wc-app-sidebar" id="appSidebar">
    <div class="wc-sidebar-brand">
        <a href="<?= e(APP_URL) ?>/admin/index.php">
            <i class="fa-solid fa-shield-halved"></i>
            <span><?= e(APP_NAME) ?></span>
        </a>
        <div class="wc-sidebar-brand-sub">Admin Panel</div>
    </div>
    <nav class="wc-sidebar-nav">
        <a class="wc-sidebar-link <?= $activeAdminNav === 'dashboard' ? 'active' : '' ?>" href="<?= e(APP_URL) ?>/admin/index.php">
            <i class="fa-solid fa-chart-line"></i><span>Dashboard</span>
        </a>
        <a class="wc-sidebar-link <?= $activeAdminNav === 'users' ? 'active' : '' ?>" href="<?= e(APP_URL) ?>/admin/users.php">
            <i class="fa-solid fa-users"></i><span>Users</span>
        </a>
        <a class="wc-sidebar-link <?= $activeAdminNav === 'forums' ? 'active' : '' ?>" href="<?= e(APP_URL) ?>/admin/forums.php">
            <i class="fa-solid fa-comments"></i><span>Forums</span>
        </a>
        <a class="wc-sidebar-link <?= $activeAdminNav === 'reports' ? 'active' : '' ?>" href="<?= e(APP_URL) ?>/admin/reports.php">
            <i class="fa-solid fa-flag"></i><span>Reports</span>
        </a>
        <a class="wc-sidebar-link <?= $activeAdminNav === 'password' ? 'active' : '' ?>" href="<?= e(APP_URL) ?>/admin/password.php">
            <i class="fa-solid fa-key"></i><span>Password</span>
        </a>
    </nav>
    <div class="wc-sidebar-footer">
        <div class="wc-sidebar-user">
            <span class="wc-nav-avatar wc-admin-avatar-fallback"><i class="fa-solid fa-user-shield"></i></span>
            <span class="wc-sidebar-username"><?= e($adminUser) ?></span>
        </div>
        <a class="btn btn-sm btn-outline-light w-100" href="<?= e(APP_URL) ?>/admin/logout.php">Logout</a>
    </div>
</aside>
<div class="wc-app-content">
<main class="wc-main">
    <?php if ($mustChange): ?>
    <div class="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
            <strong>DEMO ONLY:</strong> Change the default admin password before production use.
        </div>
        <a class="btn btn-sm btn-warning" href="<?= e(APP_URL) ?>/admin/password.php">Change password</a>
    </div>
    <?php endif; ?>
<?php endif; ?>