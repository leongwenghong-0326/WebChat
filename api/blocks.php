<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';

require_login();

$action = str_input('action');
$meId = current_user_id();
$pdo = db();

function blocked_users(int $blockerId): array
{
    $stmt = db()->prepare(
        'SELECT u.id, u.username, u.email, u.avatar, u.status_message, u.presence,
                u.last_seen_at, u.last_activity_at, u.created_at, b.created_at AS blocked_at
         FROM user_blocks b
         INNER JOIN users u ON u.id = b.blocked_id
         WHERE b.blocker_id = ?
         ORDER BY b.created_at DESC'
    );
    $stmt->execute([$blockerId]);

    $list = [];
    foreach ($stmt->fetchAll() as $row) {
        $pub = public_user($row);
        $pub['blocked_at'] = $row['blocked_at'];
        $list[] = $pub;
    }
    return $list;
}

switch ($action) {
    case 'list':
        json_success('OK', ['blocked' => blocked_users($meId)]);

    case 'block':
        if (request_method() !== 'POST') {
            json_error('Method not allowed.', 405);
        }
        require_csrf();

        $targetId = int_input('user_id');
        if ($targetId <= 0) {
            json_error('Invalid user.');
        }
        if ($targetId === $meId) {
            json_error('You cannot block yourself.');
        }

        $target = get_user_by_id($targetId);
        if (!$target || (int) $target['is_disabled'] === 1) {
            json_error('User not found.', 404);
        }

        $check = $pdo->prepare(
            'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1'
        );
        $check->execute([$meId, $targetId]);
        if ($check->fetch()) {
            json_error('User is already blocked.');
        }

        $ins = $pdo->prepare('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)');
        $ins->execute([$meId, $targetId]);

        // Match friends.php block: remove friendship so chat/calls stay closed.
        $pdo->prepare(
            'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
        )->execute([$meId, $targetId, $targetId, $meId]);

        $pdo->prepare(
            'UPDATE friend_requests SET status = \'cancelled\', updated_at = NOW()
             WHERE status = \'pending\' AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))'
        )->execute([$meId, $targetId, $targetId, $meId]);

        json_success('User blocked.', ['blocked' => blocked_users($meId)]);

    case 'unblock':
        if (request_method() !== 'POST') {
            json_error('Method not allowed.', 405);
        }
        require_csrf();

        $targetId = int_input('user_id');
        if ($targetId <= 0) {
            json_error('Invalid user.');
        }

        $del = $pdo->prepare('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?');
        $del->execute([$meId, $targetId]);

        if ($del->rowCount() === 0) {
            json_error('User is not blocked.');
        }

        restore_friendship($meId, $targetId);
        json_success('User unblocked. They are back on your friends list.', ['blocked' => blocked_users($meId)]);

    default:
        json_error('Unknown action.', 404);
}
