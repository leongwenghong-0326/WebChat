<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
require_login();

$uid = current_user_id();
$user = get_user_by_id($uid);
if (!$user) {
    logout_user();
    redirect('login.php');
}

$pageTitle = 'Profile';
$activeNav = 'profile';
$pageScripts = ['profile.js'];

require __DIR__ . '/includes/layout_start.php';
?>
<div class="container py-4">
    <div class="row justify-content-center">
        <div class="col-lg-8">
            <h1 class="h4 mb-4"><i class="fa-solid fa-user-gear"></i> My Profile</h1>

            <div class="card wc-card shadow-sm mb-4">
                <div class="card-body p-4">
                    <div class="d-flex flex-column flex-sm-row align-items-center gap-3 mb-4">
                        <div class="position-relative">
                            <img id="profileAvatar" src="<?= e(avatar_url($user['avatar'] ?? null)) ?>"
                                 alt="" class="rounded-circle" width="96" height="96"
                                 style="object-fit:cover;border:3px solid var(--wc-primary-muted);">
                        </div>
                        <div class="text-center text-sm-start">
                            <h2 class="h5 mb-1" id="profileUsername"><?= e($user['username']) ?></h2>
                            <p class="text-muted small mb-2" id="profileEmail"><?= e($user['email']) ?></p>
                            <label class="btn btn-sm btn-outline-primary mb-0" for="avatarInput">
                                <i class="fa-solid fa-camera"></i> Change avatar
                            </label>
                            <input type="file" id="avatarInput" class="d-none" accept="image/jpeg,image/png,image/gif,image/webp">
                        </div>
                    </div>

                    <form id="profileForm" class="wc-form">
                        <div class="mb-3">
                            <label class="form-label" for="username">Username</label>
                            <input type="text" class="form-control" id="username" name="username"
                                   value="<?= e($user['username']) ?>" maxlength="50"
                                   pattern="[a-zA-Z0-9_\.]+">
                        </div>
                        <div class="mb-3">
                            <label class="form-label" for="status_message">Status message</label>
                            <input type="text" class="form-control" id="status_message" name="status_message"
                                   value="<?= e($user['status_message'] ?? '') ?>" maxlength="255"
                                   placeholder="What's on your mind?">
                        </div>
                        <button type="submit" class="btn wc-btn-primary" id="profileSaveBtn">
                            <i class="fa-solid fa-floppy-disk"></i> Save profile
                        </button>
                    </form>
                </div>
            </div>

            <div class="card wc-card shadow-sm mb-4">
                <div class="card-body p-4">
                    <h2 class="h5 mb-3"><i class="fa-solid fa-lock"></i> Change password</h2>
                    <form id="passwordForm" class="wc-form">
                        <div class="mb-3">
                            <label class="form-label" for="current_password">Current password</label>
                            <input type="password" class="form-control" id="current_password" name="current_password" required autocomplete="current-password">
                        </div>
                        <div class="mb-3">
                            <label class="form-label" for="new_password">New password</label>
                            <input type="password" class="form-control" id="new_password" name="new_password" required minlength="8" autocomplete="new-password">
                        </div>
                        <div class="mb-3">
                            <label class="form-label" for="confirm">Confirm new password</label>
                            <input type="password" class="form-control" id="confirm" name="confirm" required minlength="8" autocomplete="new-password">
                        </div>
                        <button type="submit" class="btn wc-btn-primary" id="passwordSaveBtn">
                            <i class="fa-solid fa-key"></i> Update password
                        </button>
                    </form>
                </div>
            </div>

            <div class="card wc-card shadow-sm">
                <div class="card-body p-4">
                    <h2 class="h5 mb-3"><i class="fa-solid fa-ban"></i> Blocked users</h2>
                    <div id="blockedList" class="list-group list-group-flush">
                        <p class="text-muted small mb-0" id="blockedEmpty">Loading blocked users…</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
<?php require __DIR__ . '/includes/layout_end.php'; ?>
