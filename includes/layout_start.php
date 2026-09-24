<?php
declare(strict_types=1);
/** @var string $pageTitle */
/** @var string $activeNav */
$pageTitle = $pageTitle ?? APP_NAME;
$activeNav = $activeNav ?? '';
$uid = current_user_id();
$me = $uid ? get_user_by_id($uid) : null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($pageTitle) ?> | <?= e(APP_NAME) ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
    <link href="<?= e(APP_URL) ?>/assets/css/app.css?v=<?= e(is_file(APP_PATH . '/assets/css/app.css') ? (string) filemtime(APP_PATH . '/assets/css/app.css') : (string) time()) ?>" rel="stylesheet">
    <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
    <meta name="app-url" content="<?= e(APP_URL) ?>">
    <meta name="user-id" content="<?= e((string) ($uid ?? '')) ?>">
</head>
<body class="wc-body<?= $me ? ' wc-app' : '' ?>">
<?php if ($me): ?>
<button type="button" class="wc-sidebar-toggle" id="btnSidebarToggle" aria-label="Open menu">
    <i class="fa-solid fa-bars"></i>
</button>
<div class="wc-sidebar-backdrop" id="sidebarBackdrop"></div>
<aside class="wc-app-sidebar" id="appSidebar">
    <div class="wc-sidebar-brand">
        <a href="<?= e(APP_URL) ?>/chat.php">
            <i class="fa-solid fa-comments"></i>
            <span><?= e(APP_NAME) ?></span>
        </a>
    </div>
    <nav class="wc-sidebar-nav">
        <a class="wc-sidebar-link <?= $activeNav === 'chat' ? 'active' : '' ?>" href="<?= e(APP_URL) ?>/chat.php">
            <i class="fa-solid fa-message"></i><span>Chat</span>
        </a>
        <a class="wc-sidebar-link <?= $activeNav === 'friends' ? 'active' : '' ?>" href="<?= e(APP_URL) ?>/friends.php">
            <i class="fa-solid fa-user-group"></i><span>Friends</span>
        </a>
        <a class="wc-sidebar-link <?= $activeNav === 'groups' ? 'active' : '' ?>" href="<?= e(APP_URL) ?>/groups.php">
            <i class="fa-solid fa-users"></i><span>Groups</span>
        </a>
        <a class="wc-sidebar-link <?= $activeNav === 'forums' ? 'active' : '' ?>" href="<?= e(APP_URL) ?>/forums.php">
            <i class="fa-solid fa-comments"></i><span>Community</span>
        </a>
        <a class="wc-sidebar-link <?= $activeNav === 'notifications' ? 'active' : '' ?>" href="<?= e(APP_URL) ?>/notifications.php">
            <i class="fa-solid fa-bell"></i><span>Alerts</span>
            <span id="navNotifBadge" class="badge rounded-pill bg-danger d-none">0</span>
        </a>
    </nav>
    <div class="wc-sidebar-footer">
        <a class="wc-sidebar-user" href="<?= e(APP_URL) ?>/profile.php">
            <img src="<?= e(avatar_url($me['avatar'] ?? null)) ?>" alt="" class="wc-nav-avatar">
            <span class="wc-sidebar-username"><?= e($me['username']) ?></span>
        </a>
        <a class="btn btn-sm btn-outline-light w-100" href="<?= e(APP_URL) ?>/logout.php">Logout</a>
    </div>
</aside>
<div class="wc-app-content">
<main class="wc-main">
<?php else: ?>
<main class="wc-main">
<?php endif; ?>