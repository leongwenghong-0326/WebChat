<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';

require_login();

$action = str_input('action');
$meId = current_user_id();
$pdo = db();

function require_valid_peer(int $meId, int $peerId): void
{
    if ($peerId <= 0 || $peerId === $meId) {
        json_error('Invalid conversation partner.');
    }
    if (!get_user_by_id($peerId)) {
        json_error('User not found.', 404);
    }
}

function users_have_message_history(int $a, int $b): bool
{
    $stmt = db()->prepare(
        'SELECT id FROM messages
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         LIMIT 1'
    );
    $stmt->execute([$a, $b, $b, $a]);
    return (bool) $stmt->fetch();
}

/** Allow opening a chat (history) even after a block, so the UI can show the block banner. */
function require_can_view_chat(int $meId, int $peerId): void
{
    require_valid_peer($meId, $peerId);
    if (
        users_are_friends($meId, $peerId)
        || users_have_message_history($meId, $peerId)
        || block_relation($meId, $peerId) !== null
    ) {
        return;
    }
    json_error('You can only message friends.', 403);
}

/** Sending / typing requires friendship and no block either way. */
function require_can_send_message(int $meId, int $peerId): void
{
    require_valid_peer($meId, $peerId);
    assert_not_blocked($meId, $peerId, 'message');
    if (!users_are_friends($meId, $peerId)) {
        json_error('You can only message friends.', 403);
    }
}

/** @deprecated Use require_can_send_message / require_can_view_chat */
function require_peer_friend(int $meId, int $peerId): void
{
    require_can_send_message($meId, $peerId);
}

function fetch_reactions_for_messages(array $messageIds, int $meId): array
{
    if ($messageIds === []) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($messageIds), '?'));
    $params = $messageIds;
    $stmt = db()->prepare(
        "SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN ($placeholders)"
    );
    $stmt->execute($params);

    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $mid = (int) $row['message_id'];
        $emoji = $row['emoji'];
        if (!isset($map[$mid][$emoji])) {
            $map[$mid][$emoji] = ['emoji' => $emoji, 'count' => 0, 'reacted' => false];
        }
        $map[$mid][$emoji]['count']++;
        if ((int) $row['user_id'] === $meId) {
            $map[$mid][$emoji]['reacted'] = true;
        }
    }

    $out = [];
    foreach ($map as $mid => $emojis) {
        $out[$mid] = array_values($emojis);
    }
    return $out;
}

function reply_preview(?array $replyRow): ?array
{
    if (!$replyRow) {
        return null;
    }
    $type = (string) ($replyRow['message_type'] ?? 'text');
    $deleted = (int) ($replyRow['is_deleted'] ?? 0) === 1;
    $body = $deleted ? '' : (string) ($replyRow['body'] ?? '');
    if ($body === '' || $type === 'call') {
        if ($type === 'call') {
            $payload = parse_call_payload((string) ($replyRow['body'] ?? ''));
            $body = $payload !== []
                ? call_log_preview($payload, (int) (current_user_id() ?: 0))
                : 'Call';
        } elseif ($body === '') {
            $body = match ($type) {
                'image' => 'Photo',
                'file' => (string) ($replyRow['file_name'] ?? 'File'),
                'voice' => 'Voice message',
                default => $type !== 'text' ? ucfirst($type) : '',
            };
        }
    }
    return [
        'id' => (int) $replyRow['id'],
        'body' => $body,
        'message_type' => $type,
        'file_name' => $replyRow['file_name'] ?? null,
        'is_deleted' => $deleted,
    ];
}

function format_message(array $row, int $meId, array $reactionsMap, ?array $replyRow = null): array
{
    $type = (string) $row['message_type'];
    $fileUrl = null;
    if (!empty($row['file_path'])) {
        $mediaType = match ($type) {
            'image' => 'image',
            'voice' => 'voice',
            default => 'file',
        };
        $fileUrl = media_url($mediaType, (string) $row['file_path']);
    }

    $mid = (int) $row['id'];
    $isMine = (int) $row['sender_id'] === $meId;

    $callInfo = null;
    if ($type === 'call' && (int) $row['is_deleted'] !== 1) {
        $payload = parse_call_payload((string) ($row['body'] ?? ''));
        if ($payload !== []) {
            $callInfo = $payload;
            $callInfo['preview'] = call_log_preview($payload, $meId);
        }
    }

    return [
        'id' => $mid,
        'sender_id' => (int) $row['sender_id'],
        'receiver_id' => (int) $row['receiver_id'],
        'message_type' => $type,
        'body' => (int) $row['is_deleted'] === 1 ? '' : (($type === 'call') ? '' : (string) ($row['body'] ?? '')),
        'call_info' => $callInfo,
        'file_url' => $fileUrl,
        'file_name' => $row['file_name'] ?? null,
        'mime_type' => ($type === 'voice'
            ? (function () {
                $m = (string) ($row['mime_type'] ?? '');
                $path = (string) ($row['file_path'] ?? '');
                if (str_ends_with(strtolower($path), '.wav') || str_starts_with($m, 'audio/wav') || str_starts_with($m, 'audio/x-wav')) {
                    return 'audio/wav';
                }
                if (str_ends_with(strtolower($path), '.ogg') || str_starts_with($m, 'audio/ogg')) {
                    return 'audio/ogg';
                }
                // MediaRecorder WebM containers play most reliably as video/webm
                return 'video/webm';
            })()
            : ($row['mime_type'] ?? null)),
        'file_size' => isset($row['file_size']) ? (int) $row['file_size'] : null,
        'voice_duration' => isset($row['voice_duration']) ? (float) $row['voice_duration'] : null,
        'reply_to' => reply_preview($replyRow),
        'delivery_status' => (string) $row['delivery_status'],
        'is_mine' => $isMine,
        'reactions' => $reactionsMap[$mid] ?? [],
        'created_at' => $row['created_at'],
        'is_deleted' => (int) $row['is_deleted'] === 1,
    ];
}

function mark_incoming_delivered_read(int $meId, int $peerId, bool $markRead): void
{
    $pdo = db();

    $pdo->prepare(
        'UPDATE messages SET delivery_status = \'delivered\'
         WHERE sender_id = ? AND receiver_id = ? AND delivery_status = \'sent\' AND is_deleted = 0'
    )->execute([$peerId, $meId]);

    if (!$markRead) {
        return;
    }

    $stmt = $pdo->prepare(
        'SELECT id FROM messages
         WHERE sender_id = ? AND receiver_id = ? AND delivery_status != \'read\' AND is_deleted = 0'
    );
    $stmt->execute([$peerId, $meId]);
    $ids = array_map(static fn ($r) => (int) $r['id'], $stmt->fetchAll());
    if ($ids === []) {
        return;
    }

    $pdo->prepare(
        'UPDATE messages SET delivery_status = \'read\'
         WHERE sender_id = ? AND receiver_id = ? AND delivery_status != \'read\' AND is_deleted = 0'
    )->execute([$peerId, $meId]);

    $ins = $pdo->prepare(
        'INSERT IGNORE INTO message_read_receipts (message_id, user_id) VALUES (?, ?)'
    );
    foreach ($ids as $id) {
        $ins->execute([$id, $meId]);
    }
}

switch ($action) {
    case 'conversations':
        $sql = '
            SELECT u.id, u.username, u.email, u.avatar, u.status_message, u.presence,
                   u.last_seen_at, u.last_activity_at, u.created_at,
                   lm.id AS last_message_id,
                   lm.sender_id AS last_sender_id,
                   lm.message_type AS last_message_type,
                   lm.body AS last_body,
                   lm.file_name AS last_file_name,
                   lm.is_deleted AS last_is_deleted,
                   lm.created_at AS last_message_at,
                   (
                       SELECT COUNT(*)
                       FROM messages um
                       WHERE um.sender_id = u.id
                         AND um.receiver_id = :me_unread
                         AND um.delivery_status != \'read\'
                         AND um.is_deleted = 0
                   ) AS unread_count
            FROM (
                SELECT DISTINCT
                    CASE WHEN m.sender_id = :me_peer1 THEN m.receiver_id ELSE m.sender_id END AS peer_id
                FROM messages m
                WHERE m.sender_id = :me_peer2 OR m.receiver_id = :me_peer3

                UNION

                SELECT f.friend_id AS peer_id
                FROM friendships f
                WHERE f.user_id = :me_friends
            ) peers
            INNER JOIN users u ON u.id = peers.peer_id AND u.is_disabled = 0
            LEFT JOIN messages lm ON lm.id = (
                SELECT m2.id FROM messages m2
                WHERE ((m2.sender_id = :me_last1 AND m2.receiver_id = u.id)
                    OR (m2.sender_id = u.id AND m2.receiver_id = :me_last2))
                  AND m2.is_deleted = 0
                ORDER BY m2.created_at DESC, m2.id DESC
                LIMIT 1
            )
            ORDER BY IFNULL(lm.created_at, \'1970-01-01 00:00:00\') DESC, u.username ASC
        ';

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'me_unread' => $meId,
            'me_peer1' => $meId,
            'me_peer2' => $meId,
            'me_peer3' => $meId,
            'me_friends' => $meId,
            'me_last1' => $meId,
            'me_last2' => $meId,
        ]);

        $conversations = [];
        foreach ($stmt->fetchAll() as $row) {
            $pub = public_user($row);
            $preview = '';
            if (!empty($row['last_message_id'])) {
                if ((int) $row['last_is_deleted'] === 1) {
                    $preview = 'Message deleted';
                } elseif (($row['last_message_type'] ?? '') === 'call') {
                    $preview = call_log_preview(parse_call_payload((string) ($row['last_body'] ?? '')), $meId);
                } elseif (!empty($row['last_body'])) {
                    $preview = (string) $row['last_body'];
                } elseif (!empty($row['last_file_name'])) {
                    $preview = (string) $row['last_file_name'];
                } else {
                    $preview = ucfirst((string) $row['last_message_type']);
                }
                if ((int) $row['last_sender_id'] === $meId && ($row['last_message_type'] ?? '') !== 'call') {
                    $preview = 'You: ' . $preview;
                }
            }

            $rel = block_relation($meId, (int) $row['id']);
            $pub['is_blocked_by_me'] = $rel === 'you_blocked';
            $pub['has_blocked_me'] = $rel === 'blocked_you';
            $pub['block_status'] = $rel;

            $conversations[] = [
                'peer' => $pub,
                'last_message' => [
                    'id' => $row['last_message_id'] ? (int) $row['last_message_id'] : null,
                    'preview' => $preview,
                    'message_type' => $row['last_message_type'] ?? null,
                    'created_at' => $row['last_message_at'] ?? null,
                    'is_mine' => !empty($row['last_sender_id']) && (int) $row['last_sender_id'] === $meId,
                ],
                'unread_count' => (int) $row['unread_count'],
            ];
        }

        json_success('OK', ['conversations' => $conversations]);

    case 'history':
        $peerId = int_input('peer_id');
        require_can_view_chat($meId, $peerId);

        $sinceId = int_input('since_id', 0);
        mark_incoming_delivered_read($meId, $peerId, true);

        $params = [$meId, $peerId, $peerId, $meId];
        $sinceSql = '';
        if ($sinceId > 0) {
            $sinceSql = ' AND m.id > ?';
            $params[] = $sinceId;
        }

        $stmt = $pdo->prepare(
            "SELECT m.*,
                    r.id AS reply_id, r.body AS reply_body, r.is_deleted AS reply_is_deleted,
                    r.message_type AS reply_message_type, r.file_name AS reply_file_name
             FROM messages m
             LEFT JOIN messages r ON r.id = m.reply_to_id
             WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
               $sinceSql
             ORDER BY m.id ASC
             LIMIT 200"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $ids = array_map(static fn ($r) => (int) $r['id'], $rows);
        $reactionsMap = fetch_reactions_for_messages($ids, $meId);

        $messages = [];
        foreach ($rows as $row) {
            $replyRow = null;
            if (!empty($row['reply_id'])) {
                $replyRow = [
                    'id' => $row['reply_id'],
                    'body' => $row['reply_body'],
                    'is_deleted' => $row['reply_is_deleted'],
                    'message_type' => $row['reply_message_type'],
                    'file_name' => $row['reply_file_name'],
                ];
            }
            $messages[] = format_message($row, $meId, $reactionsMap, $replyRow);
        }

        // Outgoing delivery/read statuses for live ticks (sender side)
        $receiptStmt = $pdo->prepare(
            'SELECT id, delivery_status FROM messages
             WHERE sender_id = ? AND receiver_id = ? AND is_deleted = 0
             ORDER BY id DESC
             LIMIT 150'
        );
        $receiptStmt->execute([$meId, $peerId]);
        $receipts = [];
        foreach ($receiptStmt->fetchAll() as $rr) {
            $receipts[] = [
                'id' => (int) $rr['id'],
                'delivery_status' => (string) $rr['delivery_status'],
            ];
        }

        $rel = block_relation($meId, $peerId);
        json_success('OK', [
            'messages' => $messages,
            'peer_id' => $peerId,
            'receipts' => $receipts,
            'block_status' => $rel,
            'can_message' => $rel === null && users_are_friends($meId, $peerId),
        ]);

    case 'send':
        require_csrf();
        require_rate_limit('message_send', RATE_LIMIT_MESSAGE, RATE_LIMIT_MESSAGE_WINDOW);

        $peerId = int_input('peer_id');
        require_can_send_message($meId, $peerId);

        $messageType = str_input('message_type', 'text');
        if (!in_array($messageType, ['text', 'image', 'file', 'voice'], true)) {
            json_error('Invalid message type.');
        }

        $body = str_input('body');
        $replyToId = int_input('reply_to_id', 0);
        $voiceDuration = input('voice_duration');

        if ($replyToId > 0) {
            $rStmt = $pdo->prepare(
                'SELECT id, is_deleted FROM messages
                 WHERE id = ? AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                 LIMIT 1'
            );
            $rStmt->execute([$replyToId, $meId, $peerId, $peerId, $meId]);
            $replyMsg = $rStmt->fetch();
            if (!$replyMsg || (int) $replyMsg['is_deleted'] === 1) {
                json_error('Reply target is not available.');
            }
        } else {
            $replyToId = null;
        }

        $filePath = null;
        $fileName = null;
        $mimeType = null;
        $fileSize = null;

        if ($messageType !== 'text') {
            if (empty($_FILES['file'])) {
                json_error('File is required for this message type.');
            }
            try {
                $uploadCategory = $messageType === 'image' ? 'image' : ($messageType === 'voice' ? 'voice' : 'file');
                $upload = store_upload($_FILES['file'], $uploadCategory);
                $filePath = $upload['stored_name'];
                $fileName = $upload['original_name'];
                $mimeType = $upload['mime_type'];
                $fileSize = $upload['file_size'];
                if ($messageType === 'voice') {
                    $ext = strtolower(pathinfo((string) $filePath, PATHINFO_EXTENSION));
                    $mimeType = match ($ext) {
                        'webm' => 'audio/webm',
                        'ogg', 'oga' => 'audio/ogg',
                        'mp3' => 'audio/mpeg',
                        'wav' => 'audio/wav',
                        'm4a' => 'audio/mp4',
                        default => (str_starts_with((string) $mimeType, 'audio/') ? $mimeType : 'audio/webm'),
                    };
                }
            } catch (InvalidArgumentException $e) {
                json_error($e->getMessage());
            } catch (Throwable $e) {
                app_log('Upload error: ' . $e->getMessage());
                json_error('Upload failed.', 500);
            }
        } elseif ($body === '') {
            json_error('Message cannot be empty.');
        }

        $voiceDurVal = null;
        if ($messageType === 'voice' && $voiceDuration !== null && $voiceDuration !== '') {
            $voiceDurVal = max(0, (float) $voiceDuration);
        }

        $ins = $pdo->prepare(
            'INSERT INTO messages
             (sender_id, receiver_id, message_type, body, file_path, file_name, mime_type, file_size, voice_duration, reply_to_id, delivery_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'sent\')'
        );
        $ins->execute([
            $meId,
            $peerId,
            $messageType,
            $body !== '' ? $body : null,
            $filePath,
            $fileName,
            $mimeType,
            $fileSize,
            $voiceDurVal,
            $replyToId,
        ]);

        $messageId = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT m.* FROM messages m WHERE m.id = ? LIMIT 1');
        $stmt->execute([$messageId]);
        $row = $stmt->fetch();

        $replyRow = null;
        if ($replyToId) {
            $rStmt = $pdo->prepare('SELECT id, body, is_deleted, message_type, file_name FROM messages WHERE id = ?');
            $rStmt->execute([$replyToId]);
            $replyRow = $rStmt->fetch() ?: null;
        }

        $formatted = format_message($row, $meId, [], $replyRow);

        $me = get_user_by_id($meId);
        notify_user(
            $peerId,
            'message',
            'New message',
            ($me['username'] ?? 'Someone') . ' sent you a message.',
            'chat.php?peer=' . $meId,
            $messageId
        );

        json_success('Message sent.', ['message' => $formatted]);

    case 'delete':
        require_csrf();

        $messageId = int_input('message_id');
        $stmt = $pdo->prepare('SELECT id, sender_id FROM messages WHERE id = ? LIMIT 1');
        $stmt->execute([$messageId]);
        $msg = $stmt->fetch();
        if (!$msg) {
            json_error('Message not found.', 404);
        }
        if ((int) $msg['sender_id'] !== $meId) {
            json_error('You can only delete your own messages.', 403);
        }

        $upd = $pdo->prepare('UPDATE messages SET is_deleted = 1, body = NULL WHERE id = ?');
        $upd->execute([$messageId]);
        json_success('Message deleted.');

    case 'typing':
        require_csrf();

        $peerId = int_input('peer_id');
        require_can_send_message($meId, $peerId);

        cleanup_typing();
        $expires = (new DateTimeImmutable('now'))->modify('+' . TYPING_TTL_SECONDS . ' seconds')->format('Y-m-d H:i:s');

        $stmt = $pdo->prepare(
            'INSERT INTO typing_indicators (user_id, conversation_type, target_id, expires_at)
             VALUES (?, \'private\', ?, ?)
             ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)'
        );
        $stmt->execute([$meId, $peerId, $expires]);
        json_success('OK');

    case 'typing_status':
        $peerId = int_input('peer_id');
        if ($peerId <= 0) {
            json_error('Invalid peer.');
        }

        cleanup_typing();
        $stmt = $pdo->prepare(
            'SELECT id FROM typing_indicators
             WHERE user_id = ? AND conversation_type = \'private\' AND target_id = ? AND expires_at >= NOW()
             LIMIT 1'
        );
        $stmt->execute([$peerId, $meId]);
        json_success('OK', ['is_typing' => (bool) $stmt->fetch()]);

    case 'mark_read':
        require_csrf();

        $peerId = int_input('peer_id');
        require_can_view_chat($meId, $peerId);
        mark_incoming_delivered_read($meId, $peerId, true);
        json_success('Marked as read.');

    default:
        json_error('Unknown action.', 404);
}
