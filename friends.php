<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

require_login();

$pageTitle = 'Friends';
$activeNav = 'friends';
$pageScripts = ['friends.js'];

require __DIR__ . '/includes/layout_start.php';
?>

<div class="container py-4 wc-friends-page">
    <div class="row g-4">
        <div class="col-12">
            <div class="wc-card p-4">
                <h1 class="h4 mb-3"><i class="fa-solid fa-user-group text-primary"></i> Find People</h1>
                <div class="wc-search-box">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="search" id="friendSearchInput" class="form-control" placeholder="Search by username or email..." autocomplete="off">
                </div>
                <div id="friendSearchResults" class="mt-3"></div>
            </div>
        </div>

        <div class="col-12">
            <div class="wc-friends-grid">
                <div class="wc-card p-3">
                    <div class="wc-section-title">Incoming Requests <span id="incomingCount" class="badge bg-primary">0</span></div>
                    <div id="incomingRequests"></div>
                </div>
                <div class="wc-card p-3">
                    <div class="wc-section-title">Sent Requests <span id="outgoingCount" class="badge bg-secondary">0</span></div>
                    <div id="outgoingRequests"></div>
                </div>
            </div>
        </div>

        <div class="col-lg-8">
            <div class="wc-card p-3">
                <div class="wc-section-title">Your Friends</div>
                <div id="friendsList"></div>
            </div>
        </div>

        <div class="col-lg-4">
            <div class="wc-card p-3">
                <div class="wc-section-title">Blocked Users</div>
                <div id="blockedList"></div>
            </div>
        </div>
    </div>
</div>

<?php require __DIR__ . '/includes/layout_end.php'; ?>
