<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/admin_bootstrap.php';
require_admin();

$stats = [
    'total_users' => (int) db()->query('SELECT COUNT(*) FROM users')->fetchColumn(),
    'active_users' => (int) db()->query('SELECT COUNT(*) FROM users WHERE is_disabled = 0')->fetchColumn(),
    'disabled_users' => (int) db()->query('SELECT COUNT(*) FROM users WHERE is_disabled = 1')->fetchColumn(),
    'total_messages' => (int) db()->query('SELECT COUNT(*) FROM messages')->fetchColumn(),
    'total_groups' => (int) db()->query('SELECT COUNT(*) FROM group_chats')->fetchColumn(),
    'total_forum_posts' => (int) db()->query('SELECT COUNT(*) FROM forum_posts')->fetchColumn(),
    'open_reports' => (int) db()->query("SELECT COUNT(*) FROM reports WHERE status = 'open'")->fetchColumn(),
];

$adminTitle = 'Dashboard';
$activeAdminNav = 'dashboard';
require dirname(__DIR__) . '/includes/admin_layout_start.php';
?>
<h1 class="h3 mb-4"><i class="fa-solid fa-chart-line text-primary"></i> Dashboard</h1>
<div class="row g-3">
    <?php
    $cards = [
        ['Total Users', $stats['total_users'], 'fa-users'],
        ['Active Users', $stats['active_users'], 'fa-user-check'],
        ['Disabled Users', $stats['disabled_users'], 'fa-user-slash'],
        ['Total Messages', $stats['total_messages'], 'fa-message'],
        ['Total Groups', $stats['total_groups'], 'fa-users-rectangle'],
        ['Forum Posts', $stats['total_forum_posts'], 'fa-comments'],
        ['Open Reports', $stats['open_reports'], 'fa-flag'],
    ];
    foreach ($cards as [$label, $value, $icon]):
    ?>
    <div class="col-sm-6 col-xl-4">
        <div class="card wc-card wc-stat-card h-100">
            <div class="card-body d-flex align-items-center gap-3">
                <div class="wc-stat-icon"><i class="fa-solid <?= e($icon) ?>"></i></div>
                <div>
                    <div class="text-muted small"><?= e($label) ?></div>
                    <div class="h3 mb-0"><?= e((string) $value) ?></div>
                </div>
            </div>
        </div>
    </div>
    <?php endforeach; ?>
</div>
<?php require dirname(__DIR__) . '/includes/admin_layout_end.php'; ?>
