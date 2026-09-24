<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
require_login();

$pageTitle = 'Notifications';
$activeNav = 'notifications';
$pageScripts = ['notifications.js'];

require __DIR__ . '/includes/layout_start.php';
?>
<div class="container py-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
        <h1 class="h3 mb-0"><i class="fa-solid fa-bell"></i> Notifications</h1>
        <button type="button" class="btn btn-outline-primary btn-sm" id="btnMarkAllRead">Mark all read</button>
    </div>
    <div class="card wc-card">
        <div id="notificationsList" class="list-group list-group-flush">
            <p class="text-muted p-3 mb-0">Loading...</p>
        </div>
    </div>
</div>
<?php require __DIR__ . '/includes/layout_end.php'; ?>
