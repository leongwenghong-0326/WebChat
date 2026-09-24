<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
require_login();

$pageTitle = 'Groups';
$activeNav = 'groups';
$pageScripts = ['groups.js'];

require __DIR__ . '/includes/layout_start.php';
?>
<div class="container py-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
        <h1 class="h3 mb-0"><i class="fa-solid fa-users"></i> Groups</h1>
        <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#createGroupModal">
            <i class="fa-solid fa-plus"></i> New Group
        </button>
    </div>
    <div class="card wc-card">
        <div id="groupsList" class="list-group list-group-flush">
            <p class="text-muted p-3 mb-0">Loading groups...</p>
        </div>
    </div>
</div>

<div class="modal fade" id="createGroupModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <form id="createGroupForm">
                <div class="modal-header">
                    <h5 class="modal-title">Create Group</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label" for="groupName">Group name</label>
                        <input type="text" class="form-control" id="groupName" maxlength="120" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label" for="groupDescription">Description</label>
                        <textarea class="form-control" id="groupDescription" rows="3"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary">Create</button>
                </div>
            </form>
        </div>
    </div>
</div>
<?php require __DIR__ . '/includes/layout_end.php'; ?>
