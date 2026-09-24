<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';
require_login();

$action = str_input('action');
$userId = current_user_id();

function group_member(int $groupId, int $userId): ?array
{
    $stmt = db()->prepare(
        'SELECT id, group_id, user_id, role, joined_at FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1'
    );
    $stmt->execute([$groupId, $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function require_group_member(int $groupId, int $userId): array
{
    $m = group_member($groupId, $userId);
    if (!$m) {
        json_error('You are not a member of this group.', 403);
    }
    return $m;
}

function can_manage_group(array $member): bool
{
    return in_array($member['role'], ['owner', 'admin'], true);
}

function is_group_owner(array $member): bool
{
    return $member['role'] === 'owner';
}

function group_avatar_url(?string $avatar): string
{
    if ($avatar) {
        return media_url('group', $avatar);
    }
    return rtrim(APP_URL, '/') . '/assets/images/default-avatar.svg';
}

function format_group(array $row, ?array $membership = null): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'description' => $row['description'] ?? '',
        'avatar' => group_avatar_url($row['avatar'] ?? null),
        'avatar_file' => $row['avatar'] ?? null,
        'owner_id' => (int) $row['owner_id'],
        'created_at' => $row['created_at'],
        'my_role' => $membership['role'] ?? null,
    ];
}

function format_group_message(array $msg): array
{
    $viewerId = current_user_id();
    $sender = get_user_by_id((int) $msg['sender_id']);
    $replyPreview = null;
    if (!empty($msg['reply_to_id'])) {
        $r = db()->prepare(
            'SELECT id, body, message_type, file_name, is_deleted FROM group_messages WHERE id = ? LIMIT 1'
        );
        $r->execute([(int) $msg['reply_to_id']]);
        $reply = $r->fetch();
        if ($reply) {
            $deleted = (int) $reply['is_deleted'] === 1;
            $replyBody = $deleted ? 'Deleted message' : (string) ($reply['body'] ?? '');
            if (!$deleted && ($reply['message_type'] ?? '') === 'call') {
                $replyBody = call_log_preview(parse_call_payload($replyBody), (int) $viewerId);
            }
            $replyPreview = [
                'id' => (int) $reply['id'],
                'body' => $replyBody,
                'message_type' => $reply['message_type'],
                'file_name' => $reply['file_name'] ?? null,
                'is_deleted' => $deleted,
            ];
        }
    }

    $mediaUrl = null;
    if (!empty($msg['file_path'])) {
        $type = match ($msg['message_type']) {
            'image' => 'image',
            'file' => 'file',
            'voice' => 'voice',
            default => 'file',
        };
        $mediaUrl = media_url($type, $msg['file_path']);
    }

    $reactions = db()->prepare(
        'SELECT emoji, COUNT(*) AS cnt,
                SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
         FROM group_message_reactions
         WHERE message_id = ?
         GROUP BY emoji'
    );
    $reactions->execute([$viewerId, (int) $msg['id']]);
    $reactionList = [];
    foreach ($reactions->fetchAll() as $r) {
        $reactionList[] = [
            'emoji' => $r['emoji'],
            'count' => (int) $r['cnt'],
            'reacted' => (int) $r['mine'] > 0,
        ];
    }

    $isMine = (int) $msg['sender_id'] === $viewerId;

    $callInfo = null;
    $msgType = (string) ($msg['message_type'] ?? 'text');
    $fileName = (string) ($msg['file_name'] ?? '');
    $rawBody = (string) ($msg['body'] ?? '');
    $looksLikeCall = $msgType === 'call'
        || str_starts_with($fileName, 'gcall:')
        || (str_starts_with($rawBody, '{') && str_contains($rawBody, '"call_type"'));
    if ($looksLikeCall && (int) ($msg['is_deleted'] ?? 0) !== 1) {
        $msgType = 'call';
        $decoded = function_exists('parse_call_payload')
            ? parse_call_payload($rawBody)
            : (json_decode($rawBody, true) ?: []);
        if (is_array($decoded) && $decoded !== []) {
            $callInfo = $decoded;
            $callInfo['preview'] = call_log_preview($decoded, $viewerId);
        }
    }

    $deliveryStatus = 'sent';
    $readCount = 0;
    if ($isMine && (int) $msg['is_deleted'] !== 1) {
        $rc = db()->prepare(
            'SELECT COUNT(*) FROM group_message_reads WHERE message_id = ? AND user_id != ?'
        );
        $rc->execute([(int) $msg['id'], $viewerId]);
        $readCount = (int) $rc->fetchColumn();
        if ($readCount > 0) {
            $deliveryStatus = 'read';
        }
    }

    return [
        'id' => (int) $msg['id'],
        'group_id' => (int) $msg['group_id'],
        'sender' => $sender ? public_user($sender) : null,
        'is_mine' => $isMine,
        'message_type' => $msgType,
        'body' => (int) $msg['is_deleted'] === 1 ? null : ($msgType === 'call' ? '' : ($msg['body'] ?? '')),
        'is_deleted' => (int) $msg['is_deleted'] === 1,
        'file_name' => $msg['file_name'] ?? null,
        'file_size' => isset($msg['file_size']) ? (int) $msg['file_size'] : null,
        'mime_type' => $msg['mime_type'] ?? null,
        'voice_duration' => $msg['voice_duration'] ?? null,
        'file_url' => $mediaUrl,
        'media_url' => $mediaUrl,
        'reply_to' => $replyPreview,
        'reactions' => $reactionList,
        'call_info' => $callInfo,
        'delivery_status' => $deliveryStatus,
        'read_count' => $readCount,
        'created_at' => $msg['created_at'],
        'created_label' => format_datetime($msg['created_at']),
    ];
}

function notify_group_members(int $groupId, int $exceptUserId, string $title, string $body, string $link): void
{
    $stmt = db()->prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?');
    $stmt->execute([$groupId, $exceptUserId]);
    foreach ($stmt->fetchAll() as $row) {
        notify_user((int) $row['user_id'], 'group_message', $title, $body, $link, $groupId);
    }
}

try {
    switch ($action) {
        case 'create':
            require_csrf();
            $name = str_input('name');
            $description = str_input('description');
            if ($name === '' || strlen($name) > 120) {
                json_error('Group name is required (max 120 characters).');
            }
            $pdo = db();
            $pdo->beginTransaction();
            $ins = $pdo->prepare(
                'INSERT INTO group_chats (name, description, owner_id) VALUES (?, ?, ?)'
            );
            $ins->execute([$name, $description !== '' ? $description : null, $userId]);
            $groupId = (int) $pdo->lastInsertId();
            $mem = $pdo->prepare(
                'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
            );
            $mem->execute([$groupId, $userId, 'owner']);
            $pdo->commit();
            $g = db()->prepare('SELECT * FROM group_chats WHERE id = ? LIMIT 1');
            $g->execute([$groupId]);
            json_success('Group created.', format_group($g->fetch(), ['role' => 'owner']));
            break;

        case 'list':
            $stmt = db()->prepare(
                'SELECT g.*, gm.role,
                    (SELECT COUNT(*) FROM group_messages gm2
                     LEFT JOIN group_message_reads gmr ON gmr.message_id = gm2.id AND gmr.user_id = ?
                     WHERE gm2.group_id = g.id AND gm2.is_deleted = 0 AND gmr.id IS NULL AND gm2.sender_id != ?) AS unread_count,
                    (SELECT gm3.body FROM group_messages gm3 WHERE gm3.group_id = g.id AND gm3.is_deleted = 0 ORDER BY gm3.id DESC LIMIT 1) AS last_message,
                    (SELECT gm3.message_type FROM group_messages gm3 WHERE gm3.group_id = g.id AND gm3.is_deleted = 0 ORDER BY gm3.id DESC LIMIT 1) AS last_message_type
                 FROM group_chats g
                 INNER JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
                 ORDER BY g.updated_at DESC, g.id DESC'
            );
            $stmt->execute([$userId, $userId, $userId]);
            $groups = [];
            foreach ($stmt->fetchAll() as $row) {
                $item = format_group($row, ['role' => $row['role']]);
                $item['unread_count'] = (int) ($row['unread_count'] ?? 0);
                $lastType = (string) ($row['last_message_type'] ?? 'text');
                $lastBody = (string) ($row['last_message'] ?? '');
                if ($lastType === 'call' || ($lastType === '' && str_starts_with($lastBody, '{') && str_contains($lastBody, '"call_type"'))) {
                    $item['last_message'] = call_log_preview(parse_call_payload($lastBody), $userId);
                } elseif ($lastType === 'image') {
                    $item['last_message'] = 'Photo';
                } elseif ($lastType === 'file') {
                    $item['last_message'] = 'File';
                } elseif ($lastType === 'voice') {
                    $item['last_message'] = 'Voice message';
                } else {
                    $item['last_message'] = $lastBody;
                }
                $groups[] = $item;
            }
            json_success('OK', ['groups' => $groups]);
            break;

        case 'get':
            $groupId = int_input('group_id');
            if ($groupId <= 0) {
                json_error('Invalid group.');
            }
            $membership = require_group_member($groupId, $userId);
            $g = db()->prepare('SELECT * FROM group_chats WHERE id = ? LIMIT 1');
            $g->execute([$groupId]);
            $group = $g->fetch();
            if (!$group) {
                json_error('Group not found.', 404);
            }
            $members = db()->prepare(
                'SELECT u.id, gm.user_id, gm.role, gm.joined_at, u.username, u.email, u.avatar, u.status_message,
                        u.presence, u.last_seen_at, u.last_activity_at, u.created_at
                 FROM group_members gm
                 INNER JOIN users u ON u.id = gm.user_id
                 WHERE gm.group_id = ?
                 ORDER BY FIELD(gm.role, "owner","admin","member"), u.username'
            );
            $members->execute([$groupId]);
            $memberList = [];
            foreach ($members->fetchAll() as $m) {
                $memberList[] = array_merge(public_user($m), [
                    'role' => $m['role'],
                    'joined_at' => $m['joined_at'],
                ]);
            }
            json_success('OK', [
                'group' => format_group($group, $membership),
                'members' => $memberList,
            ]);
            break;

        case 'update':
            require_csrf();
            $groupId = int_input('group_id');
            $membership = require_group_member($groupId, $userId);
            if (!can_manage_group($membership)) {
                json_error('Only owners and admins can edit the group.', 403);
            }
            $name = str_input('name');
            $description = str_input('description');
            if ($name === '' || strlen($name) > 120) {
                json_error('Group name is required.');
            }
            $upd = db()->prepare(
                'UPDATE group_chats SET name = ?, description = ?, updated_at = NOW() WHERE id = ?'
            );
            $upd->execute([$name, $description !== '' ? $description : null, $groupId]);
            json_success('Group updated.');
            break;

        case 'avatar':
            require_csrf();
            $groupId = int_input('group_id');
            $membership = require_group_member($groupId, $userId);
            if (!can_manage_group($membership)) {
                json_error('Only owners and admins can change the group avatar.', 403);
            }
            if (empty($_FILES['avatar'])) {
                json_error('No file uploaded.');
            }
            $upload = store_upload($_FILES['avatar'], 'group');
            $g = db()->prepare('SELECT avatar FROM group_chats WHERE id = ? LIMIT 1');
            $g->execute([$groupId]);
            $old = $g->fetchColumn();
            db()->prepare('UPDATE group_chats SET avatar = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$upload['stored_name'], $groupId]);
            if ($old) {
                $path = APP_PATH . '/uploads/groups/' . basename((string) $old);
                if (is_file($path)) {
                    @unlink($path);
                }
            }
            json_success('Avatar updated.', ['avatar' => group_avatar_url($upload['stored_name'])]);
            break;

        case 'add_member':
            require_csrf();
            $groupId = int_input('group_id');
            $targetId = int_input('user_id');
            $membership = require_group_member($groupId, $userId);
            if (!can_manage_group($membership)) {
                json_error('Only owners and admins can add members.', 403);
            }
            if ($targetId <= 0 || $targetId === $userId) {
                json_error('Invalid user.');
            }
            $target = get_user_by_id($targetId);
            if (!$target || (int) $target['is_disabled'] === 1) {
                json_error('User not found or disabled.', 404);
            }
            if (!users_are_friends($userId, $targetId)) {
                json_error('You can only add friends to the group.', 403);
            }
            if (group_member($groupId, $targetId)) {
                json_error('User is already a member.');
            }
            db()->prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
                ->execute([$groupId, $targetId, 'member']);
            $g = db()->prepare('SELECT name FROM group_chats WHERE id = ? LIMIT 1');
            $g->execute([$groupId]);
            $groupName = (string) $g->fetchColumn();
            notify_user(
                $targetId,
                'group_invite',
                'Added to group',
                'You were added to "' . $groupName . '".',
                'group_chat.php?id=' . $groupId,
                $groupId
            );
            json_success('Member added.');
            break;

        case 'remove_member':
            require_csrf();
            $groupId = int_input('group_id');
            $targetId = int_input('user_id');
            $membership = require_group_member($groupId, $userId);
            $targetMember = group_member($groupId, $targetId);
            if (!$targetMember) {
                json_error('User is not a member.');
            }
            if ($targetMember['role'] === 'owner') {
                json_error('Cannot remove the group owner.');
            }
            if ($targetId === $userId) {
                json_error('Use leave to remove yourself.');
            }
            if (!can_manage_group($membership)) {
                json_error('Insufficient permissions.', 403);
            }
            if ($membership['role'] === 'admin' && $targetMember['role'] === 'admin') {
                json_error('Admins cannot remove other admins.', 403);
            }
            db()->prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
                ->execute([$groupId, $targetId]);
            json_success('Member removed.');
            break;

        case 'set_role':
            require_csrf();
            $groupId = int_input('group_id');
            $targetId = int_input('user_id');
            $role = str_input('role');
            $membership = require_group_member($groupId, $userId);
            if (!is_group_owner($membership)) {
                json_error('Only the owner can change roles.', 403);
            }
            if (!in_array($role, ['admin', 'member'], true)) {
                json_error('Invalid role.');
            }
            $targetMember = group_member($groupId, $targetId);
            if (!$targetMember || $targetMember['role'] === 'owner') {
                json_error('Cannot change role for this user.');
            }
            db()->prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?')
                ->execute([$role, $groupId, $targetId]);
            json_success('Role updated.');
            break;

        case 'leave':
            require_csrf();
            $groupId = int_input('group_id');
            $membership = require_group_member($groupId, $userId);
            if ($membership['role'] === 'owner') {
                json_error('Owner must delete the group or transfer ownership before leaving.');
            }
            db()->prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
                ->execute([$groupId, $userId]);
            json_success('You left the group.');
            break;

        case 'delete':
            require_csrf();
            $groupId = int_input('group_id');
            $membership = require_group_member($groupId, $userId);
            if (!is_group_owner($membership)) {
                json_error('Only the owner can delete the group.', 403);
            }
            $g = db()->prepare('SELECT avatar FROM group_chats WHERE id = ? LIMIT 1');
            $g->execute([$groupId]);
            $avatar = $g->fetchColumn();
            db()->prepare('DELETE FROM group_chats WHERE id = ?')->execute([$groupId]);
            if ($avatar) {
                $path = APP_PATH . '/uploads/groups/' . basename((string) $avatar);
                if (is_file($path)) {
                    @unlink($path);
                }
            }
            json_success('Group deleted.');
            break;

        case 'messages':
            $groupId = int_input('group_id');
            require_group_member($groupId, $userId);
            $afterId = int_input('after_id', 0);
            $beforeId = int_input('before_id', 0);
            $limit = min(100, max(1, int_input('limit', 50)));

            if ($beforeId > 0) {
                $stmt = db()->prepare(
                    'SELECT * FROM group_messages WHERE group_id = ? AND id < ? ORDER BY id DESC LIMIT ?'
                );
                $stmt->bindValue(1, $groupId, PDO::PARAM_INT);
                $stmt->bindValue(2, $beforeId, PDO::PARAM_INT);
                $stmt->bindValue(3, $limit, PDO::PARAM_INT);
            } elseif ($afterId > 0) {
                $stmt = db()->prepare(
                    'SELECT * FROM group_messages WHERE group_id = ? AND id > ? ORDER BY id ASC LIMIT ?'
                );
                $stmt->bindValue(1, $groupId, PDO::PARAM_INT);
                $stmt->bindValue(2, $afterId, PDO::PARAM_INT);
                $stmt->bindValue(3, $limit, PDO::PARAM_INT);
            } else {
                $stmt = db()->prepare(
                    'SELECT * FROM group_messages WHERE group_id = ? ORDER BY id DESC LIMIT ?'
                );
                $stmt->bindValue(1, $groupId, PDO::PARAM_INT);
                $stmt->bindValue(2, $limit, PDO::PARAM_INT);
            }
            $stmt->execute();
            $rows = $stmt->fetchAll();
            if (!$afterId && !$beforeId) {
                $rows = array_reverse($rows);
            }
            $messages = array_map('format_group_message', $rows);

            // Mark all unread messages from others as read (so senders get ✓✓ Read live).
            $unread = db()->prepare(
                'SELECT gm.id FROM group_messages gm
                 LEFT JOIN group_message_reads gmr ON gmr.message_id = gm.id AND gmr.user_id = ?
                 WHERE gm.group_id = ? AND gm.sender_id != ? AND gm.is_deleted = 0 AND gmr.id IS NULL'
            );
            $unread->execute([$userId, $groupId, $userId]);
            $insRead = db()->prepare(
                'INSERT IGNORE INTO group_message_reads (message_id, user_id) VALUES (?, ?)'
            );
            foreach ($unread->fetchAll() as $urow) {
                $insRead->execute([(int) $urow['id'], $userId]);
            }

            // Live receipts for the sender's own recent messages.
            $receiptStmt = db()->prepare(
                'SELECT gm.id,
                        (SELECT COUNT(*) FROM group_message_reads gmr
                         WHERE gmr.message_id = gm.id AND gmr.user_id != ?) AS read_count
                 FROM group_messages gm
                 WHERE gm.group_id = ? AND gm.sender_id = ? AND gm.is_deleted = 0
                 ORDER BY gm.id DESC
                 LIMIT 150'
            );
            $receiptStmt->execute([$userId, $groupId, $userId]);
            $receipts = [];
            foreach ($receiptStmt->fetchAll() as $rr) {
                $rc = (int) $rr['read_count'];
                $receipts[] = [
                    'id' => (int) $rr['id'],
                    'delivery_status' => $rc > 0 ? 'read' : 'sent',
                    'read_count' => $rc,
                ];
            }

            cleanup_typing();
            $typing = db()->prepare(
                'SELECT u.username FROM typing_indicators t
                 INNER JOIN users u ON u.id = t.user_id
                 WHERE t.conversation_type = ? AND t.target_id = ? AND t.user_id != ? AND t.expires_at > NOW()'
            );
            $typing->execute(['group', $groupId, $userId]);
            $typingUsers = array_column($typing->fetchAll(), 'username');

            json_success('OK', [
                'messages' => $messages,
                'typing' => $typingUsers,
                'receipts' => $receipts,
            ]);
            break;

        case 'send':
            require_csrf();
            require_rate_limit('group_message', RATE_LIMIT_MESSAGE, RATE_LIMIT_MESSAGE_WINDOW);
            $groupId = int_input('group_id');
            require_group_member($groupId, $userId);
            $messageType = str_input('message_type', 'text');
            $body = str_input('body');
            $replyToId = int_input('reply_to_id', 0);
            $voiceDuration = input('voice_duration');

            if (!in_array($messageType, ['text', 'image', 'file', 'voice'], true)) {
                json_error('Invalid message type.');
            }

            $filePath = null;
            $fileName = null;
            $mimeType = null;
            $fileSize = null;
            $duration = null;

            if ($messageType === 'text') {
                if ($body === '') {
                    json_error('Message cannot be empty.');
                }
            } else {
                $field = match ($messageType) {
                    'image' => 'file',
                    'file' => 'file',
                    'voice' => 'file',
                };
                $category = match ($messageType) {
                    'image' => 'image',
                    'file' => 'file',
                    'voice' => 'voice',
                };
                if (empty($_FILES[$field])) {
                    json_error('File is required.');
                }
                $upload = store_upload($_FILES[$field], $category);
                $filePath = $upload['stored_name'];
                $fileName = $upload['original_name'];
                $mimeType = $upload['mime_type'];
                $fileSize = $upload['file_size'];
                if ($messageType === 'voice' && $voiceDuration !== null) {
                    $duration = (float) $voiceDuration;
                }
            }

            if ($replyToId > 0) {
                $chk = db()->prepare('SELECT id FROM group_messages WHERE id = ? AND group_id = ? LIMIT 1');
                $chk->execute([$replyToId, $groupId]);
                if (!$chk->fetch()) {
                    json_error('Invalid reply target.');
                }
            } else {
                $replyToId = null;
            }

            $ins = db()->prepare(
                'INSERT INTO group_messages (group_id, sender_id, message_type, body, file_path, file_name, mime_type, file_size, voice_duration, reply_to_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $ins->execute([
                $groupId,
                $userId,
                $messageType,
                $body !== '' ? $body : null,
                $filePath,
                $fileName,
                $mimeType,
                $fileSize,
                $duration,
                $replyToId,
            ]);
            $msgId = (int) db()->lastInsertId();
            db()->prepare('UPDATE group_chats SET updated_at = NOW() WHERE id = ?')->execute([$groupId]);

            $g = db()->prepare('SELECT name FROM group_chats WHERE id = ? LIMIT 1');
            $g->execute([$groupId]);
            $groupName = (string) $g->fetchColumn();
            $preview = $messageType === 'text' ? mb_substr($body, 0, 80) : ucfirst($messageType) . ' message';
            notify_group_members(
                $groupId,
                $userId,
                'New group message',
                $groupName . ': ' . $preview,
                'group_chat.php?id=' . $groupId,
            );

            $stmt = db()->prepare('SELECT * FROM group_messages WHERE id = ? LIMIT 1');
            $stmt->execute([$msgId]);
            json_success('Message sent.', format_group_message($stmt->fetch()));
            break;

        case 'typing':
            require_csrf();
            $groupId = int_input('group_id');
            require_group_member($groupId, $userId);
            cleanup_typing();
            $expires = (new DateTimeImmutable('now'))->modify('+' . TYPING_TTL_SECONDS . ' seconds')->format('Y-m-d H:i:s');
            db()->prepare(
                'INSERT INTO typing_indicators (user_id, conversation_type, target_id, expires_at)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)'
            )->execute([$userId, 'group', $groupId, $expires]);
            json_success('OK');
            break;

        case 'mark_read':
            require_csrf();
            $groupId = int_input('group_id');
            require_group_member($groupId, $userId);
            $messageId = int_input('message_id', 0);

            if ($messageId > 0) {
                $chk = db()->prepare('SELECT id FROM group_messages WHERE id = ? AND group_id = ? LIMIT 1');
                $chk->execute([$messageId, $groupId]);
                if (!$chk->fetch()) {
                    json_error('Message not found.');
                }
                db()->prepare(
                    'INSERT IGNORE INTO group_message_reads (message_id, user_id) VALUES (?, ?)'
                )->execute([$messageId, $userId]);
            } else {
                $stmt = db()->prepare(
                    'SELECT gm.id FROM group_messages gm
                     LEFT JOIN group_message_reads gmr ON gmr.message_id = gm.id AND gmr.user_id = ?
                     WHERE gm.group_id = ? AND gm.sender_id != ? AND gmr.id IS NULL'
                );
                $stmt->execute([$userId, $groupId, $userId]);
                $ins = db()->prepare('INSERT IGNORE INTO group_message_reads (message_id, user_id) VALUES (?, ?)');
                foreach ($stmt->fetchAll() as $row) {
                    $ins->execute([(int) $row['id'], $userId]);
                }
            }
            json_success('Marked as read.');
            break;

        case 'delete_message':
            require_csrf();
            $messageId = int_input('message_id');
            if ($messageId <= 0) {
                json_error('Invalid message.');
            }
            $stmt = db()->prepare('SELECT * FROM group_messages WHERE id = ? LIMIT 1');
            $stmt->execute([$messageId]);
            $msg = $stmt->fetch();
            if (!$msg) {
                json_error('Message not found.', 404);
            }
            require_group_member((int) $msg['group_id'], $userId);
            if ((int) $msg['sender_id'] !== $userId) {
                json_error('You can only delete your own messages.', 403);
            }
            db()->prepare('UPDATE group_messages SET is_deleted = 1, body = NULL WHERE id = ?')
                ->execute([$messageId]);
            json_success('Message deleted.');
            break;

        case 'react':
            require_csrf();
            $messageId = int_input('message_id');
            $emoji = str_input('emoji');
            if ($messageId <= 0 || $emoji === '') {
                json_error('Invalid reaction.');
            }
            if (!in_array($emoji, allowed_reaction_emojis(), true)) {
                json_error('Emoji not allowed.');
            }
            $stmt = db()->prepare('SELECT group_id, sender_id FROM group_messages WHERE id = ? LIMIT 1');
            $stmt->execute([$messageId]);
            $msg = $stmt->fetch();
            if (!$msg) {
                json_error('Message not found.', 404);
            }
            require_group_member((int) $msg['group_id'], $userId);
            $exists = db()->prepare(
                'SELECT id FROM group_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ? LIMIT 1'
            );
            $exists->execute([$messageId, $userId, $emoji]);
            if ($exists->fetch()) {
                db()->prepare('DELETE FROM group_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
                    ->execute([$messageId, $userId, $emoji]);
                json_success('Reaction removed.', ['toggled' => false]);
            }
            db()->prepare('INSERT INTO group_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)')
                ->execute([$messageId, $userId, $emoji]);
            if ((int) $msg['sender_id'] !== $userId) {
                notify_user(
                    (int) $msg['sender_id'],
                    'reaction',
                    'New reaction',
                    'Someone reacted ' . $emoji . ' to your group message.',
                    'group_chat.php?id=' . (int) $msg['group_id'],
                    (int) $msg['group_id']
                );
            }
            json_success('Reaction added.', ['toggled' => true]);
            break;

        default:
            json_error('Unknown action.', 404);
    }
} catch (InvalidArgumentException $e) {
    json_error($e->getMessage());
} catch (Throwable $e) {
    app_log('groups.php: ' . $e->getMessage());
    json_error('An unexpected error occurred.', 500);
}
