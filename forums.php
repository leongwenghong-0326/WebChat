<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
require_login();

$forumId = (int) ($_GET['forum'] ?? 0);
$postId = (int) ($_GET['post'] ?? 0);

$pageTitle = $postId ? 'Post' : ($forumId ? 'Forum' : 'Community');
$activeNav = 'forums';
$pageScripts = ['forums.js'];

require __DIR__ . '/includes/layout_start.php';
?>
<div class="container py-4" id="forumsRoot"
     data-forum-id="<?= e((string) $forumId) ?>"
     data-post-id="<?= e((string) $postId) ?>">
    <div class="row g-4">
        <div class="col-lg-4">
            <div class="card wc-card">
                <div class="card-header"><strong>Categories</strong></div>
                <div id="forumCategories" class="list-group list-group-flush">
                    <p class="text-muted p-3 mb-0">Loading...</p>
                </div>
            </div>
        </div>
        <div class="col-lg-8">
            <?php if ($postId): ?>
                <div id="forumPostDetail"><p class="text-muted">Loading post...</p></div>
                <a href="forums.php<?= $forumId ? '?forum=' . $forumId : '' ?>" class="btn btn-link mt-2">&larr; Back to posts</a>
            <?php elseif ($forumId): ?>
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h1 class="h4 mb-0">Discussion</h1>
                    <button type="button" class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#createPostModal">
                        <i class="fa-solid fa-plus"></i> New Post
                    </button>
                </div>
                <div id="forumPosts"><p class="text-muted">Loading posts...</p></div>
            <?php else: ?>
                <div class="card wc-card">
                    <div class="card-body text-center py-5">
                        <i class="fa-solid fa-comments fa-3x text-muted mb-3"></i>
                        <h2 class="h4">Community Forums</h2>
                        <p class="text-muted">Select a category on the left to browse discussions or create a new post.</p>
                    </div>
                </div>
            <?php endif; ?>
        </div>
    </div>
</div>

<?php if ($forumId && !$postId): ?>
<div class="modal fade" id="createPostModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <form id="createPostForm">
                <div class="modal-header">
                    <h5 class="modal-title">Create Post</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label" for="postTitle">Title</label>
                        <input type="text" class="form-control" id="postTitle" maxlength="200" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label" for="postContent">Content</label>
                        <textarea class="form-control" id="postContent" rows="6" required></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary">Publish</button>
                </div>
            </form>
        </div>
    </div>
</div>
<?php endif; ?>
<?php require __DIR__ . '/includes/layout_end.php'; ?>
