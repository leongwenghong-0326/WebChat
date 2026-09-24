<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/admin_bootstrap.php';
require_admin();

$message = '';
$filter = str_input('status', 'open');
if (!in_array($filter, ['open', 'reviewed', 'resolved', 'all'], true)) {
    $filter = 'open';
}

if (request_method() === 'POST' && verify_csrf()) {
    $reportId = int_input('report_id');
    $do = str_input('do');
    $notes = str_input('admin_notes');
    $adminId = current_admin_id();
    if ($reportId > 0 && in_array($do, ['reviewed', 'resolved', 'open'], true)) {
        db()->prepare(
            'UPDATE reports SET status = ?, admin_notes = ?, reviewed_by = ?, updated_at = NOW() WHERE id = ?'
        )->execute([$do, $notes !== '' ? $notes : null, $adminId, $reportId]);
        $message = 'Report updated.';
    }
}

$sql = 'SELECT r.*, u.username AS reporter_name, a.username AS reviewer_name
        FROM reports r
        INNER JOIN users u ON u.id = r.reporter_id
        LEFT JOIN admins a ON a.id = r.reviewed_by';
$params = [];
if ($filter !== 'all') {
    $sql .= ' WHERE r.status = ?';
    $params[] = $filter;
}
$sql .= ' ORDER BY r.created_at DESC LIMIT 100';
$stmt = db()->prepare($sql);
$stmt->execute($params);
$reports = $stmt->fetchAll();

$adminTitle = 'Reports';
$activeAdminNav = 'reports';
require dirname(__DIR__) . '/includes/admin_layout_start.php';
?>
<h1 class="h3 mb-4">Reports</h1>
<?php if ($message): ?><div class="alert alert-success"><?= e($message) ?></div><?php endif; ?>

<div class="btn-group mb-3">
    <?php foreach (['open' => 'Open', 'reviewed' => 'Reviewed', 'resolved' => 'Resolved', 'all' => 'All'] as $key => $label): ?>
    <a href="reports.php?status=<?= e($key) ?>" class="btn btn-sm <?= $filter === $key ? 'btn-primary' : 'btn-outline-primary' ?>"><?= e($label) ?></a>
    <?php endforeach; ?>
</div>

<div class="card wc-card">
    <div class="table-responsive">
        <table class="table table-hover wc-admin-table mb-0">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Reporter</th>
                    <th>Target</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($reports as $r): ?>
                <tr>
                    <td><?= e((string) $r['id']) ?></td>
                    <td><?= e($r['reporter_name']) ?></td>
                    <td><span class="badge bg-secondary"><?= e($r['target_type']) ?></span> #<?= e((string) $r['target_id']) ?></td>
                    <td><?= e($r['reason']) ?></td>
                    <td><span class="badge bg-<?= $r['status'] === 'open' ? 'warning' : ($r['status'] === 'resolved' ? 'success' : 'info') ?>"><?= e($r['status']) ?></span></td>
                    <td><?= e(format_datetime($r['created_at'])) ?></td>
                    <td>
                        <button type="button" class="btn btn-sm btn-outline-primary" data-bs-toggle="collapse" data-bs-target="#report-<?= e((string) $r['id']) ?>">Review</button>
                    </td>
                </tr>
                <tr class="collapse" id="report-<?= e((string) $r['id']) ?>">
                    <td colspan="7">
                        <form method="post" class="p-3 bg-light rounded">
                            <?= csrf_field() ?>
                            <input type="hidden" name="report_id" value="<?= e((string) $r['id']) ?>">
                            <div class="mb-2">
                                <label class="form-label">Admin notes</label>
                                <textarea class="form-control" name="admin_notes" rows="2"><?= e($r['admin_notes'] ?? '') ?></textarea>
                            </div>
                            <div class="d-flex gap-2">
                                <button type="submit" name="do" value="reviewed" class="btn btn-sm btn-info">Mark reviewed</button>
                                <button type="submit" name="do" value="resolved" class="btn btn-sm btn-success">Resolve</button>
                                <button type="submit" name="do" value="open" class="btn btn-sm btn-outline-secondary">Reopen</button>
                            </div>
                            <?php if ($r['reviewer_name']): ?>
                            <p class="small text-muted mt-2 mb-0">Last reviewed by <?= e($r['reviewer_name']) ?></p>
                            <?php endif; ?>
                        </form>
                    </td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$reports): ?>
                <tr><td colspan="7" class="text-muted text-center py-4">No reports found.</td></tr>
            <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php require dirname(__DIR__) . '/includes/admin_layout_end.php'; ?>
