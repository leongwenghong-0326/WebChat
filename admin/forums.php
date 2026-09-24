<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/admin_bootstrap.php';
require_admin();

$message = '';

function slugify(string $text): string
{
    $text = strtolower(trim($text));
    $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
    return trim($text, '-') ?: 'forum';
}

if (request_method() === 'POST' && verify_csrf()) {
    $do = str_input('do');

    if ($do === 'save_forum') {
        $id = int_input('forum_id');
        $name = str_input('name');
        $slug = str_input('slug');
        $description = str_input('description');
        $sortOrder = int_input('sort_order', 0);
        $isActive = int_input('is_active', 1) ? 1 : 0;
        if ($name === '') {
            $message = 'Forum name is required.';
        } else {
            if ($slug === '') {
                $slug = slugify($name);
            }
            if ($id > 0) {
                db()->prepare(
                    'UPDATE forums SET name = ?, slug = ?, description = ?, sort_order = ?, is_active = ? WHERE id = ?'
                )->execute([$name, $slug, $description ?: null, $sortOrder, $isActive, $id]);
                $message = 'Forum updated.';
            } else {
                db()->prepare(
                    'INSERT INTO forums (name, slug, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?)'
                )->execute([$name, $slug, $description ?: null, $sortOrder, $isActive]);
                $message = 'Forum created.';
            }
        }
    } elseif ($do === 'delete_forum') {
        $id = int_input('forum_id');
        if ($id > 0) {
            db()->prepare('DELETE FROM forums WHERE id = ?')->execute([$id]);
            $message = 'Forum deleted.';
        }
    } elseif ($do === 'hide_post') {
        $postId = int_input('post_id');
        db()->prepare('UPDATE forum_posts SET is_hidden = 1 WHERE id = ?')->execute([$postId]);
        $message = 'Post hidden.';
    } elseif ($do === 'show_post') {
        $postId = int_input('post_id');
        db()->prepare('UPDATE forum_posts SET is_hidden = 0 WHERE id = ?')->execute([$postId]);
        $message = 'Post restored.';
    }
}

$forums = db()->query('SELECT * FROM forums ORDER BY sort_order ASC, name ASC')->fetchAll();
$posts = db()->query(
    'SELECT fp.id, fp.title, fp.is_hidden, fp.created_at, f.name AS forum_name, u.username
     FROM forum_posts fp
     INNER JOIN forums f ON f.id = fp.forum_id
     INNER JOIN users u ON u.id = fp.user_id
     ORDER BY fp.created_at DESC LIMIT 50'
)->fetchAll();

$editId = int_input('edit');
$editForum = null;
if ($editId > 0) {
    $stmt = db()->prepare('SELECT * FROM forums WHERE id = ? LIMIT 1');
    $stmt->execute([$editId]);
    $editForum = $stmt->fetch() ?: null;
}

$adminTitle = 'Forums';
$activeAdminNav = 'forums';
require dirname(__DIR__) . '/includes/admin_layout_start.php';
?>
<h1 class="h3 mb-4">Forum Management</h1>
<?php if ($message): ?><div class="alert alert-success"><?= e($message) ?></div><?php endif; ?>

<div class="row g-4">
    <div class="col-lg-5">
        <div class="card wc-card">
            <div class="card-header"><strong><?= $editForum ? 'Edit Category' : 'New Category' ?></strong></div>
            <div class="card-body">
                <form method="post">
                    <?= csrf_field() ?>
                    <input type="hidden" name="do" value="save_forum">
                    <input type="hidden" name="forum_id" value="<?= e((string) ($editForum['id'] ?? 0)) ?>">
                    <div class="mb-3">
                        <label class="form-label">Name</label>
                        <input type="text" class="form-control" name="name" value="<?= e($editForum['name'] ?? '') ?>" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Slug</label>
                        <input type="text" class="form-control" name="slug" value="<?= e($editForum['slug'] ?? '') ?>">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Description</label>
                        <textarea class="form-control" name="description" rows="2"><?= e($editForum['description'] ?? '') ?></textarea>
                    </div>
                    <div class="row g-2 mb-3">
                        <div class="col-6">
                            <label class="form-label">Sort order</label>
                            <input type="number" class="form-control" name="sort_order" value="<?= e((string) ($editForum['sort_order'] ?? 0)) ?>">
                        </div>
                        <div class="col-6">
                            <label class="form-label">Active</label>
                            <select class="form-select" name="is_active">
                                <option value="1" <?= !isset($editForum['is_active']) || (int) $editForum['is_active'] === 1 ? 'selected' : '' ?>>Yes</option>
                                <option value="0" <?= isset($editForum['is_active']) && (int) $editForum['is_active'] === 0 ? 'selected' : '' ?>>No</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary"><?= $editForum ? 'Update' : 'Create' ?></button>
                    <?php if ($editForum): ?>
                    <a href="forums.php" class="btn btn-link">Cancel</a>
                    <?php endif; ?>
                </form>
            </div>
        </div>

        <div class="card wc-card mt-4">
            <div class="card-header"><strong>Categories</strong></div>
            <ul class="list-group list-group-flush">
                <?php foreach ($forums as $f): ?>
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <strong><?= e($f['name']) ?></strong>
                        <?php if ((int) $f['is_active'] === 0): ?><span class="badge bg-secondary">Hidden</span><?php endif; ?>
                        <div class="small text-muted"><?= e($f['slug']) ?></div>
                    </div>
                    <div class="btn-group btn-group-sm">
                        <a href="forums.php?edit=<?= e((string) $f['id']) ?>" class="btn btn-outline-primary">Edit</a>
                        <form method="post" class="d-inline" onsubmit="return confirm('Delete forum and all posts?')">
                            <?= csrf_field() ?>
                            <input type="hidden" name="do" value="delete_forum">
                            <input type="hidden" name="forum_id" value="<?= e((string) $f['id']) ?>">
                            <button type="submit" class="btn btn-outline-danger">Delete</button>
                        </form>
                    </div>
                </li>
                <?php endforeach; ?>
            </ul>
        </div>
    </div>

    <div class="col-lg-7">
        <div class="card wc-card">
            <div class="card-header"><strong>Recent Posts</strong></div>
            <div class="table-responsive">
                <table class="table table-hover wc-admin-table mb-0">
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Forum</th>
                            <th>Author</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                    <?php foreach ($posts as $p): ?>
                        <tr>
                            <td><?= e($p['title']) ?></td>
                            <td><?= e($p['forum_name']) ?></td>
                            <td><?= e($p['username']) ?></td>
                            <td><?= (int) $p['is_hidden'] === 1 ? '<span class="badge bg-danger">Hidden</span>' : '<span class="badge bg-success">Visible</span>' ?></td>
                            <td class="text-end">
                                <form method="post" class="d-inline">
                                    <?= csrf_field() ?>
                                    <input type="hidden" name="post_id" value="<?= e((string) $p['id']) ?>">
                                    <?php if ((int) $p['is_hidden'] === 1): ?>
                                    <button type="submit" name="do" value="show_post" class="btn btn-sm btn-outline-success">Restore</button>
                                    <?php else: ?>
                                    <button type="submit" name="do" value="hide_post" class="btn btn-sm btn-outline-warning">Hide</button>
                                    <?php endif; ?>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
<?php require dirname(__DIR__) . '/includes/admin_layout_end.php'; ?>
