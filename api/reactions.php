<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';

require_login();

$action = str_input('action');
$meId = current_user_id();
$pdo = db();

if ($action !== 'toggle') {
    json_error('Unknown action.', 404);
}

require_csrf();

$scope = str_input('scope', 'private');
$emoji = str_input('emoji');
$messageId = int_input('message_id');

if ($messageId <= 0) {
    json_error('Invalid message.');
}

$allowed = allowed_reaction_emojis();
if (!in_array($emoji, $allowed, true)) {
    json_error('Emoji not allowed.');
}

if ($scope === 'private') {
    $stmt = $pdo->prepare(
        'SELECT id, sender_id, receiver_id FROM messages WHERE id = ? AND is_deleted = 0 LIMIT 1'
    );
    $stmt->execute([$messageId]);
    $msg = $stmt->fetch();
    if (!$msg) {
        json_error('Message not found.', 404);
    }

    $senderId = (int) $msg['sender_id'];
    $receiverId = (int) $msg['receiver_id'];
    if ($meId !== $senderId && $meId !== $receiverId) {
        json_error('Not allowed.', 403);
    }

    $peerId = $meId === $senderId ? $receiverId : $senderId;
    assert_not_blocked($meId, $peerId, 'message');

    $check = $pdo->prepare(
        'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ? LIMIT 1'
    );
    $check->execute([$messageId, $meId, $emoji]);
    $existing = $check->fetch();

    if ($existing) {
        $del = $pdo->prepare('DELETE FROM message_reactions WHERE id = ?');
        $del->execute([(int) $existing['id']]);
        json_success('Reaction removed.', ['added' => false]);
    }

    $ins = $pdo->prepare(
        'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)'
    );
    $ins->execute([$messageId, $meId, $emoji]);

    $peerId = $meId === $senderId ? $receiverId : $senderId;
    $me = get_user_by_id($meId);
    notify_user(
        $peerId,
        'reaction',
        'New reaction',
        ($me['username'] ?? 'Someone') . ' reacted ' . $emoji . ' to your message.',
        'chat.php?peer=' . $meId,
        $messageId
    );

    json_success('Reaction added.', ['added' => true]);
}

if ($scope === 'group') {
    $stmt = $pdo->prepare(
        'SELECT gm.id, gm.group_id, gm.sender_id
         FROM group_messages gm
         WHERE gm.id = ? AND gm.is_deleted = 0
         LIMIT 1'
    );
    $stmt->execute([$messageId]);
    $msg = $stmt->fetch();
    if (!$msg) {
        json_error('Message not found.', 404);
    }

    $member = $pdo->prepare(
        'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1'
    );
    $member->execute([(int) $msg['group_id'], $meId]);
    if (!$member->fetch()) {
        json_error('Not allowed.', 403);
    }

    $check = $pdo->prepare(
        'SELECT id FROM group_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ? LIMIT 1'
    );
    $check->execute([$messageId, $meId, $emoji]);
    $existing = $check->fetch();

    if ($existing) {
        $del = $pdo->prepare('DELETE FROM group_message_reactions WHERE id = ?');
        $del->execute([(int) $existing['id']]);
        json_success('Reaction removed.', ['added' => false]);
    }

    $ins = $pdo->prepare(
        'INSERT INTO group_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)'
    );
    $ins->execute([$messageId, $meId, $emoji]);
    json_success('Reaction added.', ['added' => true]);
}

json_error('Invalid scope.');
