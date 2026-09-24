<?php
declare(strict_types=1);

function wc_asset_ver(string $relativePath): string
{
    $full = APP_PATH . '/' . ltrim(str_replace('\\', '/', $relativePath), '/');
    return is_file($full) ? (string) filemtime($full) : (string) time();
}
?>
</main>
<?php if (current_user_id()): ?>
</div>
<?php endif; ?>

<div id="callOverlay" class="wc-call-overlay d-none" aria-hidden="true">
    <div class="wc-call-panel">
        <audio id="remoteAudio" autoplay playsinline></audio>
        <div id="callVideoArea" class="wc-call-video d-none">
            <div id="callVideoGrid" class="wc-call-video-grid d-none" aria-hidden="true"></div>
            <video id="remoteVideo" autoplay playsinline></video>
            <video id="localVideo" autoplay playsinline muted></video>
            <div class="wc-call-video-meta">
                <div id="callPeerBanner">User</div>
                <div id="callStatusBanner">Calling...</div>
                <div id="callVideoTimer" class="wc-call-timer">0:00</div>
                <div id="callVideoMetaLine" class="wc-call-meta-line"></div>
            </div>
        </div>
        <div id="callVoiceArea" class="wc-call-voice">
            <div id="callAvatarStack" class="wc-call-avatars">
                <img id="callAvatar" src="<?= e(APP_URL) ?>/assets/images/default-avatar.svg" alt="">
            </div>
            <h3 id="callPeerName">User</h3>
            <p id="callStatusText">Calling...</p>
            <div id="callVoiceTimer" class="wc-call-timer">0:00</div>
            <div id="callVoiceMetaLine" class="wc-call-meta-line"></div>
        </div>
        <div class="wc-call-controls">
            <button type="button" class="btn btn-light btn-lg rounded-circle" id="btnMute" title="Mute"><i class="fa-solid fa-microphone"></i></button>
            <button type="button" class="btn btn-light btn-lg rounded-circle d-none" id="btnCamera" title="Camera"><i class="fa-solid fa-video"></i></button>
            <button type="button" class="btn btn-success btn-lg rounded-circle d-none" id="btnAcceptCall" title="Accept"><i class="fa-solid fa-phone"></i></button>
            <button type="button" class="btn btn-danger btn-lg rounded-circle" id="btnEndCall" title="End call"><i class="fa-solid fa-phone-slash"></i></button>
        </div>
    </div>
</div>

<script>
window.WC = window.WC || {};
WC.appUrl = <?= json_encode(rtrim(APP_URL, '/')) ?>;
WC.csrf = <?= json_encode(csrf_token()) ?>;
WC.userId = <?= json_encode(current_user_id()) ?>;
<?php
$wcMe = current_user_id() ? get_user_by_id((int) current_user_id()) : null;
?>
WC.userName = <?= json_encode($wcMe['username'] ?? '') ?>;
WC.userAvatar = <?= json_encode($wcMe ? avatar_url($wcMe['avatar'] ?? null) : '') ?>;
WC.rtcConfig = <?= json_encode(rtc_config()) ?>;
WC.poll = {
    messages: <?= (int) POLL_MESSAGES_MS ?>,
    calls: <?= (int) POLL_CALLS_MS ?>,
    notifications: <?= (int) POLL_NOTIFICATIONS_MS ?>
};
</script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="<?= e(APP_URL) ?>/assets/js/app.js?v=<?= e(wc_asset_ver('assets/js/app.js')) ?>"></script>
<script src="<?= e(APP_URL) ?>/assets/js/calls.js?v=<?= e(wc_asset_ver('assets/js/calls.js')) ?>"></script>
<script src="<?= e(APP_URL) ?>/assets/js/notifications.js?v=<?= e(wc_asset_ver('assets/js/notifications.js')) ?>"></script>
<script>
(function () {
    var toggle = document.getElementById('btnSidebarToggle');
    var backdrop = document.getElementById('sidebarBackdrop');
    if (toggle) toggle.addEventListener('click', function () {
        document.body.classList.toggle('wc-sidebar-open');
    });
    if (backdrop) backdrop.addEventListener('click', function () {
        document.body.classList.remove('wc-sidebar-open');
    });
})();
</script>
<?php if (!empty($pageScripts) && is_array($pageScripts)): ?>
<?php foreach ($pageScripts as $script): ?>
<script src="<?= e(APP_URL) ?>/assets/js/<?= e($script) ?>?v=<?= e(wc_asset_ver('assets/js/' . $script)) ?>"></script>
<?php endforeach; ?>
<?php endif; ?>
</body>
</html>