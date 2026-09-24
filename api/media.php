<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';
require_login();

$type = str_input('type');
$file = str_input('f');
$path = resolve_upload_path($type, $file);

if (!$path || !is_file($path)) {
    http_response_code(404);
    exit('Not found');
}

$userId = (int) current_user_id();
$allowed = false;
$base = basename($file);

switch ($type) {
    case 'avatar':
        $stmt = db()->prepare('SELECT id FROM users WHERE avatar = ? LIMIT 1');
        $stmt->execute([$base]);
        $allowed = (bool) $stmt->fetch();
        break;
    case 'group':
        $stmt = db()->prepare(
            'SELECT gm.id FROM group_members gm
             INNER JOIN group_chats g ON g.id = gm.group_id
             WHERE g.avatar = ? AND gm.user_id = ? LIMIT 1'
        );
        $stmt->execute([$base, $userId]);
        $allowed = (bool) $stmt->fetch();
        break;
    case 'image':
    case 'file':
    case 'voice':
        $stmt = db()->prepare(
            'SELECT id FROM messages WHERE file_path = ? AND (sender_id = ? OR receiver_id = ?) LIMIT 1'
        );
        $stmt->execute([$base, $userId, $userId]);
        $allowed = (bool) $stmt->fetch();
        if (!$allowed) {
            $stmt = db()->prepare(
                'SELECT gm.id FROM group_messages gm
                 INNER JOIN group_members m ON m.group_id = gm.group_id AND m.user_id = ?
                 WHERE gm.file_path = ? LIMIT 1'
            );
            $stmt->execute([$userId, $base]);
            $allowed = (bool) $stmt->fetch();
        }
        break;
}

if (!$allowed) {
    http_response_code(403);
    exit('Forbidden');
}

$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$mime = detect_mime($path);

if ($type === 'voice') {
    // MediaRecorder WebM is often detected as video/webm; browsers play it best that way.
    if ($ext === 'webm') {
        $mime = 'video/webm';
    } elseif ($ext === 'ogg' || $ext === 'oga') {
        $mime = 'audio/ogg';
    } elseif ($ext === 'mp3') {
        $mime = 'audio/mpeg';
    } elseif ($ext === 'wav') {
        $mime = 'audio/wav';
    } elseif ($ext === 'm4a') {
        $mime = 'audio/mp4';
    } elseif (!str_starts_with((string) $mime, 'audio/') && !str_starts_with((string) $mime, 'video/')) {
        $mime = 'video/webm';
    }
} elseif ($type === 'image') {
    $mime = match ($ext) {
        'jpg', 'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        default => $mime,
    };
}

$size = (int) filesize($path);
$inline = in_array($type, ['avatar', 'image', 'group', 'voice'], true);

// Avoid nosniff mismatch issues for voice containers
if ($type !== 'voice') {
    header('X-Content-Type-Options: nosniff');
}
header('X-Frame-Options: SAMEORIGIN');
header('Content-Type: ' . $mime);
header('Accept-Ranges: bytes');
header('Cache-Control: private, max-age=3600');
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . rawurlencode(basename($path)) . '"');

$range = $_SERVER['HTTP_RANGE'] ?? null;
if ($range && preg_match('/bytes=(\d*)-(\d*)/', $range, $m)) {
    $start = $m[1] !== '' ? (int) $m[1] : 0;
    $end = $m[2] !== '' ? (int) $m[2] : ($size - 1);
    if ($start > $end || $start >= $size) {
        http_response_code(416);
        header("Content-Range: bytes */$size");
        exit;
    }
    $end = min($end, $size - 1);
    $length = $end - $start + 1;
    http_response_code(206);
    header("Content-Range: bytes $start-$end/$size");
    header('Content-Length: ' . (string) $length);
    $fp = fopen($path, 'rb');
    fseek($fp, $start);
    $remaining = $length;
    while ($remaining > 0 && !feof($fp)) {
        $chunk = fread($fp, min(8192, $remaining));
        if ($chunk === false) {
            break;
        }
        echo $chunk;
        $remaining -= strlen($chunk);
    }
    fclose($fp);
    exit;
}

header('Content-Length: ' . (string) $size);
readfile($path);
exit;