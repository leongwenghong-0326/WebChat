<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/admin_bootstrap.php';
require_admin();

$message = '';
$search = str_input('q');

if (request_method() === 'POST' && verify_csrf()) {
    $userId = int_input('user_id');
    $do = str_input('do');
    if ($userId > 0) {
        if ($do === 'disable') {
            db()->prepare('UPDATE users SET is_disabled = 1 WHERE id = ?')->execute([$userId]);
            $message = 'User disabled.';
        } elseif ($do === 'enable') {
            db()->prepare('UPDATE users SET is_disabled = 0 WHERE id = ?')->execute([$userId]);
            $message = 'User enabled.';
        } elseif ($do === 'delete') {
            db()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
            $message = 'User deleted.';
        }
    }
}

$sql = 'SELECT id, username, email, is_disabled, created_at, last_seen_at FROM users';
$params = [];
if ($search !== '') {
    $sql .= ' WHERE username LIKE ? OR email LIKE ?';
    $like = '%' . $search . '%';
    $params = [$like, $like];
}
$sql .= ' ORDER BY id DESC LIMIT 100';
$stmt = db()->prepare($sql);
$stmt->execute($params);
$users = $stmt->fetchAll();

$adminTitle = 'Users';
$activeAdminNav = 'users';
require dirname(__DIR__) . '/includes/admin_layout_start.php';
?>
<h1 class="h3 mb-4">Users</h1>
<?php if ($message): ?><div class="alert alert-success"><?= e($message) ?></div><?php endif; ?>

<form class="row g-2 mb-3" method="get">
    <div class="col-md-6">
        <input type="search" class="form-control" name="q" value="<?= e($search) ?>" placeholder="Search username or email">
    </div>
    <div class="col-auto">
        <button type="submit" class="btn btn-primary">Search</button>
    </div>
</form>

<div class="card wc-card">
    <div class="table-responsive">
        <table class="table table-hover wc-admin-table mb-0">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th>Last seen</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($users as $u): ?>
                <tr>
                    <td><?= e((string) $u['id']) ?></td>
                    <td><?= e($u['username']) ?></td>
                    <td><?= e($u['email']) ?></td>
                    <td>
                        <?php if ((int) $u['is_disabled'] === 1): ?>
                        <span class="badge bg-danger">Disabled</span>
                        <?php else: ?>
                        <span class="badge bg-success">Active</span>
                        <?php endif; ?>
                    </td>
                    <td><?= e(format_datetime($u['created_at'])) ?></td>
                    <td><?= e(time_ago($u['last_seen_at'])) ?></td>
                    <td class="text-end">
                        <form method="post" class="d-inline">
                            <?= csrf_field() ?>
                            <input type="hidden" name="user_id" value="<?= e((string) $u['id']) ?>">
                            <?php if ((int) $u['is_disabled'] === 1): ?>
                            <button type="submit" name="do" value="enable" class="btn btn-sm btn-outline-success">Enable</button>
                            <?php else: ?>
                            <button type="submit" name="do" value="disable" class="btn btn-sm btn-outline-warning">Disable</button>
                            <?php endif; ?>
                            <button type="submit" name="do" value="delete" class="btn btn-sm btn-outline-danger"
                                    onclick="return confirm('Delete this user permanently?')">Delete</button>
                        </form>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<?php require dirname(__DIR__) . '/includes/admin_layout_end.php'; ?>
