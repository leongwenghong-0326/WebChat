<?php
declare(strict_types=1);

function app_log(string $message): void
{
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $message . PHP_EOL;
    $dir = dirname(LOG_PATH);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents(LOG_PATH, $line, FILE_APPEND | LOCK_EX);
}

function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function redirect(string $path): never
{
    if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
        header('Location: ' . $path);
    } else {
        header('Location: ' . rtrim(APP_URL, '/') . '/' . ltrim($path, '/'));
    }
    exit;
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_success(string $message = 'OK', mixed $data = null, int $status = 200): never
{
    json_response(['success' => true, 'message' => $message, 'data' => $data], $status);
}

function json_error(string $message, int $status = 400, mixed $data = null): never
{
    json_response(['success' => false, 'message' => $message, 'data' => $data], $status);
}

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function input_json(): array
{
    static $cached = null;
    static $loaded = false;
    if ($loaded) {
        return is_array($cached) ? $cached : [];
    }
    $loaded = true;
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        $cached = [];
        return $cached;
    }
    $decoded = json_decode($raw, true);
    $cached = is_array($decoded) ? $decoded : [];
    return $cached;
}

function normalize_sdp(string $sdp): string
{
    // Normalize line endings and ensure trailing CRLF (required by WebRTC SDP parsers)
    $sdp = str_replace(["\r\n", "\r"], "\n", $sdp);
    $sdp = trim($sdp);
    if ($sdp === '') {
        return '';
    }
    $lines = preg_split("/\n/", $sdp) ?: [];
    $clean = [];
    foreach ($lines as $line) {
        $line = rtrim($line, " \t");
        if ($line !== '') {
            $clean[] = $line;
        }
    }
    return implode("\r\n", $clean) . "\r\n";
}

function sdp_input(string $key): string
{
    $v = input($key, '');
    if (!is_string($v)) {
        return '';
    }
    return normalize_sdp($v);
}

function input(string $key, mixed $default = null): mixed
{
    $json = input_json();
    if (array_key_exists($key, $json)) {
        return $json[$key];
    }
    if (array_key_exists($key, $_POST)) {
        return $_POST[$key];
    }
    if (array_key_exists($key, $_GET)) {
        return $_GET[$key];
    }
    return $default;
}

function str_input(string $key, mixed $default = ''): string
{
    $v = input($key, $default);
    return is_string($v) ? trim($v) : (string) $v;
}

function int_input(string $key, int $default = 0): int
{
    $v = input($key, $default);
    return filter_var($v, FILTER_VALIDATE_INT) !== false ? (int) $v : $default;
}

function csrf_token(): string
{
    if (empty($_SESSION[CSRF_TOKEN_KEY])) {
        $_SESSION[CSRF_TOKEN_KEY] = bin2hex(random_bytes(32));
    }
    return $_SESSION[CSRF_TOKEN_KEY];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf_token" value="' . e(csrf_token()) . '">';
}

function verify_csrf(?string $token = null): bool
{
    $token = $token ?? (string) (input('csrf_token') ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
    $session = $_SESSION[CSRF_TOKEN_KEY] ?? '';
    return is_string($session) && $session !== '' && hash_equals($session, $token);
}

function require_csrf(): void
{
    if (!verify_csrf()) {
        json_error('Invalid security token. Please refresh and try again.', 403);
    }
}

function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function rate_limit(string $action, int $maxHits, int $windowSeconds): bool
{
    $key = $action . ':' . client_ip() . ':' . (current_user_id() ?? 0);
    $pdo = db();
    $now = new DateTimeImmutable('now');

    $stmt = $pdo->prepare('SELECT id, hits, window_start FROM rate_limits WHERE rate_key = ? LIMIT 1');
    $stmt->execute([$key]);
    $row = $stmt->fetch();

    if (!$row) {
        $ins = $pdo->prepare('INSERT INTO rate_limits (rate_key, hits, window_start) VALUES (?, 1, ?)');
        $ins->execute([$key, $now->format('Y-m-d H:i:s')]);
        return true;
    }

    $windowStart = new DateTimeImmutable($row['window_start']);
    $elapsed = $now->getTimestamp() - $windowStart->getTimestamp();

    if ($elapsed >= $windowSeconds) {
        $upd = $pdo->prepare('UPDATE rate_limits SET hits = 1, window_start = ? WHERE id = ?');
        $upd->execute([$now->format('Y-m-d H:i:s'), $row['id']]);
        return true;
    }

    if ((int) $row['hits'] >= $maxHits) {
        return false;
    }

    $upd = $pdo->prepare('UPDATE rate_limits SET hits = hits + 1 WHERE id = ?');
    $upd->execute([$row['id']]);
    return true;
}

function require_rate_limit(string $action, int $maxHits, int $windowSeconds): void
{
    if (!rate_limit($action, $maxHits, $windowSeconds)) {
        json_error('Too many requests. Please wait and try again.', 429);
    }
}

function random_filename(string $extension): string
{
    $ext = strtolower(preg_replace('/[^a-z0-9]/i', '', $extension) ?? '');
    return bin2hex(random_bytes(16)) . ($ext !== '' ? '.' . $ext : '');
}

function detect_mime(string $tmpPath): string
{
    if (!is_file($tmpPath)) {
        return 'application/octet-stream';
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmpPath);
    return is_string($mime) ? $mime : 'application/octet-stream';
}

function extension_of(string $filename): string
{
    return strtolower(pathinfo($filename, PATHINFO_EXTENSION));
}

function app_base_path(): string
{
    $path = parse_url(APP_URL, PHP_URL_PATH);
    if (!is_string($path) || $path === '' || $path === '/') {
        return '';
    }
    return rtrim($path, '/');
}

function avatar_url(?string $avatar): string
{
    $base = app_base_path();
    if ($avatar) {
        return $base . '/api/media.php?type=avatar&f=' . rawurlencode($avatar);
    }
    return $base . '/assets/images/default-avatar.svg';
}

function media_url(string $type, string $file): string
{
    return app_base_path() . '/api/media.php?type=' . rawurlencode($type) . '&f=' . rawurlencode($file);
}


function format_call_clock(?int $seconds): string
{
    $seconds = max(0, (int) $seconds);
    $m = intdiv($seconds, 60);
    $s = $seconds % 60;
    return $m . ':' . str_pad((string) $s, 2, '0', STR_PAD_LEFT);
}

function parse_call_payload(?string $body): array
{
    if (!$body) {
        return [];
    }
    $data = json_decode($body, true);
    return is_array($data) ? $data : [];
}

function call_log_preview(array $payload, int $viewerId): string
{
    $isVideo = (($payload['call_type'] ?? 'voice') === 'video');
    $callType = $isVideo ? 'Video call' : 'Voice call';
    $outcome = (string) ($payload['outcome'] ?? '');
    $callerId = (int) ($payload['caller_id'] ?? 0);
    $callerName = (string) ($payload['caller_name'] ?? 'User');
    $incoming = $callerId > 0 && $callerId !== $viewerId;

    return match ($outcome) {
        'rejected' => $incoming
            ? ($callType . ' from ' . $callerName . ' · Declined')
            : ($callType . ' · Declined'),
        'missed' => $incoming ? ('Missed ' . strtolower($callType)) : ($callType . ' · No answer'),
        'cancelled' => $callType . ' · Cancelled',
        'ended' => $callType . (isset($payload['duration']) ? (' · ' . format_call_clock((int) $payload['duration'])) : ''),
        default => $callType,
    };
}

function insert_group_call_log_message(int $groupId, array $call, string $outcome, array $participants = [], ?string $batchKey = null): void
{
    if ($groupId <= 0) {
        return;
    }
    $callId = (int) ($call['id'] ?? 0);
    $callerId = (int) ($call['caller_id'] ?? current_user_id());
    if ($callerId <= 0) {
        return;
    }

    $marker = $batchKey ? ('gcall:' . $batchKey) : ('gcall:' . ($callId > 0 ? $callId : uniqid('x', true)));
    $exists = db()->prepare(
        'SELECT id FROM group_messages WHERE message_type = \'call\' AND file_name = ? LIMIT 1'
    );
    $exists->execute([$marker]);
    if ($exists->fetch()) {
        return;
    }

    $duration = null;
    if ($outcome === 'ended' && !empty($call['answered_at'])) {
        $start = strtotime((string) $call['answered_at']);
        $end = !empty($call['ended_at']) ? strtotime((string) $call['ended_at']) : time();
        if ($start && $end && $end >= $start) {
            $duration = (int) ($end - $start);
        }
    }
    if ($duration === null && isset($call['duration'])) {
        $duration = (int) $call['duration'];
    }

    $caller = get_user_by_id($callerId);
    $participantPayload = [];
    foreach ($participants as $pid) {
        $pid = (int) $pid;
        if ($pid <= 0) {
            continue;
        }
        $u = get_user_by_id($pid);
        if ($u) {
            $participantPayload[] = [
                'id' => $pid,
                'username' => (string) $u['username'],
                'avatar' => avatar_url($u['avatar'] ?? null),
            ];
        }
    }

    $payload = [
        'call_id' => $callId,
        'group_id' => $groupId,
        'call_type' => (string) ($call['call_type'] ?? 'voice'),
        'outcome' => $outcome,
        'duration' => $duration,
        'caller_id' => $callerId,
        'caller_name' => (string) ($caller['username'] ?? 'User'),
        'participants' => $participantPayload,
        'participant_count' => max(count($participantPayload), 1),
    ];
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($body === false) {
        return;
    }

    db()->prepare(
        'INSERT INTO group_messages (group_id, sender_id, message_type, body, file_name, voice_duration)
         VALUES (?, ?, \'call\', ?, ?, ?)'
    )->execute([$groupId, $callerId, $body, $marker, $duration]);
}

function insert_call_log_message(array $call, string $outcome): void
{
    $callId = (int) ($call['id'] ?? 0);
    $callerId = (int) ($call['caller_id'] ?? 0);
    $calleeId = (int) ($call['callee_id'] ?? 0);
    if ($callId <= 0 || $callerId <= 0 || $calleeId <= 0) {
        return;
    }

    // Group multi-call legs log into the group thread instead.
    if (!empty($call['group_id'])) {
        return;
    }

    $marker = 'call:' . $callId;
    $exists = db()->prepare('SELECT id FROM messages WHERE message_type = \'call\' AND file_name = ? LIMIT 1');
    $exists->execute([$marker]);
    if ($exists->fetch()) {
        return;
    }

    $duration = null;
    if ($outcome === 'ended' && !empty($call['answered_at'])) {
        $start = strtotime((string) $call['answered_at']);
        $end = !empty($call['ended_at']) ? strtotime((string) $call['ended_at']) : time();
        if ($start && $end && $end >= $start) {
            $duration = (int) ($end - $start);
        }
    }

    $caller = get_user_by_id($callerId);
    $payload = [
        'call_id' => $callId,
        'call_type' => (string) ($call['call_type'] ?? 'voice'),
        'outcome' => $outcome,
        'duration' => $duration,
        'caller_id' => $callerId,
        'caller_name' => (string) ($caller['username'] ?? 'User'),
    ];
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($body === false) {
        return;
    }

    db()->prepare(
        'INSERT INTO messages (sender_id, receiver_id, message_type, body, file_name, voice_duration, delivery_status)
         VALUES (?, ?, \'call\', ?, ?, ?, \'delivered\')'
    )->execute([
        $callerId,
        $calleeId,
        $body,
        $marker,
        $duration,
    ]);
}

function format_datetime(?string $dt): string
{
    if (!$dt) {
        return '';
    }
    try {
        $d = new DateTimeImmutable($dt);
        return $d->format('M j, Y g:i A');
    } catch (Exception) {
        return $dt;
    }
}

function time_ago(?string $dt): string
{
    if (!$dt) {
        return 'never';
    }
    try {
        $then = new DateTimeImmutable($dt);
        $diff = (new DateTimeImmutable('now'))->getTimestamp() - $then->getTimestamp();
        if ($diff < 60) {
            return 'just now';
        }
        if ($diff < 3600) {
            return (int) floor($diff / 60) . 'm ago';
        }
        if ($diff < 86400) {
            return (int) floor($diff / 3600) . 'h ago';
        }
        return (int) floor($diff / 86400) . 'd ago';
    } catch (Exception) {
        return '';
    }
}

function allowed_reaction_emojis(): array
{
    return ['👍', '❤️', '😂', '😮', '😢', '👏'];
}

function notify_user(int $userId, string $type, string $title, ?string $body = null, ?string $link = null, ?int $relatedId = null): void
{
    $stmt = db()->prepare(
        'INSERT INTO notifications (user_id, type, title, body, link, related_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$userId, $type, $title, $body, $link, $relatedId]);
}

function users_are_friends(int $a, int $b): bool
{
    $stmt = db()->prepare(
        'SELECT id FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1'
    );
    $stmt->execute([$a, $b, $b, $a]);
    return (bool) $stmt->fetch();
}

function is_blocked_either(int $a, int $b): bool
{
    $stmt = db()->prepare(
        'SELECT id FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1'
    );
    $stmt->execute([$a, $b, $b, $a]);
    return (bool) $stmt->fetch();
}

function is_user_blocked_by(int $blockerId, int $blockedId): bool
{
    if ($blockerId <= 0 || $blockedId <= 0) {
        return false;
    }
    $stmt = db()->prepare(
        'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1'
    );
    $stmt->execute([$blockerId, $blockedId]);
    return (bool) $stmt->fetch();
}

/**
 * @return 'you_blocked'|'blocked_you'|null
 */
function block_relation(int $viewerId, int $otherId): ?string
{
    if (is_user_blocked_by($viewerId, $otherId)) {
        return 'you_blocked';
    }
    if (is_user_blocked_by($otherId, $viewerId)) {
        return 'blocked_you';
    }
    return null;
}

function block_action_message(?string $relation, string $context = 'message'): string
{
    $verb = $context === 'call' ? 'call' : 'message';
    if ($relation === 'blocked_you') {
        return 'You are blocked and cannot ' . $verb . ' this user.';
    }
    if ($relation === 'you_blocked') {
        return 'You blocked this user. Unblock them to ' . $verb . ' again.';
    }
    return 'This action is not allowed.';
}

function assert_not_blocked(int $meId, int $peerId, string $context = 'message'): void
{
    $relation = block_relation($meId, $peerId);
    if ($relation !== null) {
        json_error(block_action_message($relation, $context), 403, [
            'block_status' => $relation,
        ]);
    }
}

/** Re-add both friendship rows after unblock (block deletes them). */
function restore_friendship(int $a, int $b): void
{
    if ($a <= 0 || $b <= 0 || $a === $b) {
        return;
    }
    if (is_blocked_either($a, $b)) {
        return;
    }
    $target = get_user_by_id($b);
    if (!$target || (int) ($target['is_disabled'] ?? 0) === 1) {
        return;
    }
    db()->prepare(
        'INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)'
    )->execute([$a, $b, $b, $a]);
}

function get_user_by_id(int $id): ?array
{
    $stmt = db()->prepare(
        'SELECT id, username, email, avatar, status_message, presence, last_seen_at, last_activity_at, is_disabled, created_at
         FROM users WHERE id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function public_user(array $user): array
{
    $presence = $user['presence'] ?? 'offline';
    $lastActivity = $user['last_activity_at'] ?? null;
    if ($lastActivity) {
        $age = time() - strtotime($lastActivity);
        if ($age > PRESENCE_ONLINE_SECONDS && $presence === 'online') {
            $presence = 'offline';
        }
    }

    return [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'avatar' => avatar_url($user['avatar'] ?? null),
        'avatar_file' => $user['avatar'] ?? null,
        'status_message' => $user['status_message'] ?? '',
        'presence' => $presence,
        'last_seen_at' => $user['last_seen_at'] ?? null,
        'last_seen_label' => time_ago($user['last_seen_at'] ?? null),
        'created_at' => $user['created_at'] ?? null,
    ];
}

function touch_presence(int $userId, string $presence = 'online'): void
{
    $stmt = db()->prepare(
        'UPDATE users SET presence = ?, last_activity_at = NOW(), last_seen_at = NOW() WHERE id = ?'
    );
    $stmt->execute([$presence, $userId]);
}

function cleanup_typing(): void
{
    db()->exec('DELETE FROM typing_indicators WHERE expires_at < NOW()');
}

function rtc_config(): array
{
    $ice = [];
    foreach (RTC_STUN_URLS as $url) {
        $ice[] = ['urls' => $url];
    }
    if (!empty(RTC_TURN_URLS)) {
        $turn = ['urls' => RTC_TURN_URLS];
        if (RTC_TURN_USERNAME !== '') {
            $turn['username'] = RTC_TURN_USERNAME;
            $turn['credential'] = RTC_TURN_CREDENTIAL;
        }
        $ice[] = $turn;
    }
    return ['iceServers' => $ice];
}
