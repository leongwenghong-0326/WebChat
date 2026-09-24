<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';

require_login();

$action = str_input('action');
$meId = current_user_id();
$pdo = db();

function friendship_status(int $meId, int $otherId): string
{
    if (users_are_friends($meId, $otherId)) {
        return 'friend';
    }

    $stmt = db()->prepare(
        'SELECT sender_id, status FROM friend_requests
         WHERE status = \'pending\'
           AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
         LIMIT 1'
    );
    $stmt->execute([$meId, $otherId, $otherId, $meId]);
    $row = $stmt->fetch();
    if (!$row) {
        return 'none';
    }
    return (int) $row['sender_id'] === $meId ? 'pending_outgoing' : 'pending_incoming';
}

function user_search_row(array $row, int $meId): array
{
    $pub = public_user($row);
    $pub['friendship_status'] = friendship_status($meId, (int) $row['id']);
    $pub['is_blocked_by_me'] = is_user_blocked_by($meId, (int) $row['id']);
    $pub['has_blocked_me'] = is_user_blocked_by((int) $row['id'], $meId);
    $pub['block_status'] = block_relation($meId, (int) $row['id']);
    return $pub;
}

function format_request(array $row, int $meId): array
{
    $isIncoming = (int) $row['receiver_id'] === $meId;
    $otherId = $isIncoming ? (int) $row['sender_id'] : (int) $row['receiver_id'];
    $other = get_user_by_id($otherId);

    return [
        'id' => (int) $row['id'],
        'direction' => $isIncoming ? 'incoming' : 'outgoing',
        'status' => $row['status'],
        'created_at' => $row['created_at'],
        'user' => $other ? public_user($other) : null,
    ];
}

switch ($action) {
    case 'search':
        $q = str_input('q');
        if (strlen($q) < 2) {
            json_success('OK', ['results' => []]);
        }

        $like = '%' . $q . '%';
        $stmt = $pdo->prepare(
            'SELECT id, username, email, avatar, status_message, presence, last_seen_at, last_activity_at, created_at
             FROM users
             WHERE is_disabled = 0
               AND id != ?
               AND (username LIKE ? OR email LIKE ?)
             ORDER BY username ASC
             LIMIT 30'
        );
        $stmt->execute([$meId, $like, $like]);
        $results = [];
        foreach ($stmt->fetchAll() as $row) {
            $results[] = user_search_row($row, $meId);
        }
        json_success('OK', ['results' => $results]);

    case 'list':
        $stmt = $pdo->prepare(
            'SELECT u.id, u.username, u.email, u.avatar, u.status_message, u.presence,
                    u.last_seen_at, u.last_activity_at, u.created_at, f.created_at AS friends_since
             FROM friendships f
             INNER JOIN users u ON u.id = f.friend_id
             WHERE f.user_id = ?
               AND u.is_disabled = 0
             ORDER BY u.username ASC'
        );
        $stmt->execute([$meId]);
        $friends = [];
        foreach ($stmt->fetchAll() as $row) {
            $pub = public_user($row);
            $pub['friends_since'] = $row['friends_since'];
            $pub['is_blocked_by_me'] = is_user_blocked_by($meId, (int) $row['id']);
            $pub['has_blocked_me'] = is_user_blocked_by((int) $row['id'], $meId);
            $pub['block_status'] = block_relation($meId, (int) $row['id']);
            $friends[] = $pub;
        }
        json_success('OK', ['friends' => $friends]);

    case 'requests':
        $stmt = $pdo->prepare(
            'SELECT fr.id, fr.sender_id, fr.receiver_id, fr.status, fr.created_at
             FROM friend_requests fr
             WHERE fr.status = \'pending\'
               AND (fr.receiver_id = ? OR fr.sender_id = ?)
             ORDER BY fr.created_at DESC'
        );
        $stmt->execute([$meId, $meId]);
        $incoming = [];
        $outgoing = [];
        foreach ($stmt->fetchAll() as $row) {
            $item = format_request($row, $meId);
            if ($item['direction'] === 'incoming') {
                $incoming[] = $item;
            } else {
                $outgoing[] = $item;
            }
        }
        json_success('OK', ['incoming' => $incoming, 'outgoing' => $outgoing]);

    case 'send':
        require_csrf();
        require_rate_limit('friend_send', RATE_LIMIT_FRIEND, RATE_LIMIT_FRIEND_WINDOW);

        $receiverId = int_input('receiver_id');
        if ($receiverId <= 0 || $receiverId === $meId) {
            json_error('Invalid user.');
        }

        $receiver = get_user_by_id($receiverId);
        if (!$receiver || (int) $receiver['is_disabled'] === 1) {
            json_error('User not found.', 404);
        }

        if (users_are_friends($meId, $receiverId)) {
            json_error('You are already friends.');
        }

        if (is_blocked_either($meId, $receiverId)) {
            json_error('Unable to send friend request.');
        }

        $existing = $pdo->prepare(
            'SELECT id, sender_id, receiver_id, status FROM friend_requests
             WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
             LIMIT 1'
        );
        $existing->execute([$meId, $receiverId, $receiverId, $meId]);
        $reqRow = $existing->fetch();

        if ($reqRow) {
            if ($reqRow['status'] === 'pending') {
                json_error('Friend request already pending.');
            }
            if ($reqRow['status'] === 'accepted') {
                json_error('You are already friends.');
            }
            if ((int) $reqRow['sender_id'] === $receiverId && $reqRow['status'] === 'pending') {
                json_error('This user already sent you a request.');
            }
            $upd = $pdo->prepare(
                'UPDATE friend_requests SET sender_id = ?, receiver_id = ?, status = \'pending\', updated_at = NOW()
                 WHERE id = ?'
            );
            $upd->execute([$meId, $receiverId, $reqRow['id']]);
            $requestId = (int) $reqRow['id'];
        } else {
            $ins = $pdo->prepare(
                'INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES (?, ?, \'pending\')'
            );
            $ins->execute([$meId, $receiverId]);
            $requestId = (int) $pdo->lastInsertId();
        }

        $me = get_user_by_id($meId);
        notify_user(
            $receiverId,
            'friend_request',
            'New friend request',
            ($me['username'] ?? 'Someone') . ' sent you a friend request.',
            'friends.php',
            $requestId
        );

        json_success('Friend request sent.', ['request_id' => $requestId]);

    case 'accept':
        require_csrf();

        $requestId = int_input('request_id');
        $stmt = $pdo->prepare('SELECT * FROM friend_requests WHERE id = ? LIMIT 1');
        $stmt->execute([$requestId]);
        $request = $stmt->fetch();
        if (!$request || $request['status'] !== 'pending') {
            json_error('Request not found.', 404);
        }
        if ((int) $request['receiver_id'] !== $meId) {
            json_error('Not allowed.', 403);
        }

        $senderId = (int) $request['sender_id'];
        if (is_blocked_either($meId, $senderId)) {
            json_error('Unable to accept request.');
        }

        $pdo->beginTransaction();
        try {
            $upd = $pdo->prepare('UPDATE friend_requests SET status = \'accepted\', updated_at = NOW() WHERE id = ?');
            $upd->execute([$requestId]);

            $ins = $pdo->prepare('INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)');
            $ins->execute([$meId, $senderId, $senderId, $meId]);

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $me = get_user_by_id($meId);
        notify_user(
            $senderId,
            'friend_accepted',
            'Friend request accepted',
            ($me['username'] ?? 'Someone') . ' accepted your friend request.',
            'friends.php',
            $meId
        );

        json_success('Friend request accepted.');

    case 'reject':
        require_csrf();

        $requestId = int_input('request_id');
        $stmt = $pdo->prepare('SELECT * FROM friend_requests WHERE id = ? LIMIT 1');
        $stmt->execute([$requestId]);
        $request = $stmt->fetch();
        if (!$request || $request['status'] !== 'pending') {
            json_error('Request not found.', 404);
        }
        if ((int) $request['receiver_id'] !== $meId) {
            json_error('Not allowed.', 403);
        }

        $upd = $pdo->prepare('UPDATE friend_requests SET status = \'rejected\', updated_at = NOW() WHERE id = ?');
        $upd->execute([$requestId]);
        json_success('Friend request rejected.');

    case 'cancel':
        require_csrf();

        $requestId = int_input('request_id');
        $stmt = $pdo->prepare('SELECT * FROM friend_requests WHERE id = ? LIMIT 1');
        $stmt->execute([$requestId]);
        $request = $stmt->fetch();
        if (!$request || $request['status'] !== 'pending') {
            json_error('Request not found.', 404);
        }
        if ((int) $request['sender_id'] !== $meId) {
            json_error('Not allowed.', 403);
        }

        $upd = $pdo->prepare('UPDATE friend_requests SET status = \'cancelled\', updated_at = NOW() WHERE id = ?');
        $upd->execute([$requestId]);
        json_success('Friend request cancelled.');

    case 'remove':
        require_csrf();

        $friendId = int_input('friend_id');
        if ($friendId <= 0 || $friendId === $meId) {
            json_error('Invalid friend.');
        }
        if (!users_are_friends($meId, $friendId)) {
            json_error('Not friends with this user.');
        }

        $del = $pdo->prepare(
            'DELETE FROM friendships
             WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
        );
        $del->execute([$meId, $friendId, $friendId, $meId]);
        json_success('Friend removed.');

    case 'block':
        require_csrf();

        $userId = int_input('user_id');
        if ($userId <= 0 || $userId === $meId) {
            json_error('Invalid user.');
        }
        if (!get_user_by_id($userId)) {
            json_error('User not found.', 404);
        }

        $ins = $pdo->prepare('INSERT IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)');
        $ins->execute([$meId, $userId]);

        $pdo->prepare(
            'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
        )->execute([$meId, $userId, $userId, $meId]);

        $pdo->prepare(
            'UPDATE friend_requests SET status = \'cancelled\', updated_at = NOW()
             WHERE status = \'pending\' AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))'
        )->execute([$meId, $userId, $userId, $meId]);

        json_success('User blocked.');

    case 'unblock':
        require_csrf();

        $userId = int_input('user_id');
        if ($userId <= 0) {
            json_error('Invalid user.');
        }

        $del = $pdo->prepare('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?');
        $del->execute([$meId, $userId]);
        restore_friendship($meId, $userId);
        json_success('User unblocked. They are back on your friends list.');

    case 'blocked':
        $stmt = $pdo->prepare(
            'SELECT u.id, u.username, u.email, u.avatar, u.status_message, u.presence,
                    u.last_seen_at, u.last_activity_at, u.created_at, b.created_at AS blocked_at
             FROM user_blocks b
             INNER JOIN users u ON u.id = b.blocked_id
             WHERE b.blocker_id = ?
             ORDER BY b.created_at DESC'
        );
        $stmt->execute([$meId]);
        $blocked = [];
        foreach ($stmt->fetchAll() as $row) {
            $pub = public_user($row);
            $pub['blocked_at'] = $row['blocked_at'];
            $blocked[] = $pub;
        }
        json_success('OK', ['blocked' => $blocked]);

    default:
        json_error('Unknown action.', 404);
}
