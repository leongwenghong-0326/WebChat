<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';

$action = str_input('action');

$allowedPresence = ['online', 'away', 'busy', 'offline'];

switch ($action) {
    case 'ping':
        require_login();
        touch_presence(current_user_id(), 'online');
        json_success('OK');

    case 'set':
        require_login();
        require_csrf();

        $presence = str_input('presence');
        if (!in_array($presence, $allowedPresence, true)) {
            json_error('Invalid presence value.');
        }

        $uid = current_user_id();
        if ($presence === 'offline') {
            $stmt = db()->prepare(
                "UPDATE users SET presence = 'offline', last_seen_at = NOW() WHERE id = ?"
            );
            $stmt->execute([$uid]);
        } else {
            touch_presence($uid, $presence);
        }

        $user = get_user_by_id($uid);
        json_success('Presence updated.', [
            'presence' => $user ? public_user($user)['presence'] : $presence,
        ]);

    case 'get':
        require_login();

        $targetId = int_input('user_id');
        if ($targetId <= 0) {
            json_error('Invalid user.');
        }

        $user = get_user_by_id($targetId);
        if (!$user || (int) $user['is_disabled'] === 1) {
            json_error('User not found.', 404);
        }

        $pub = public_user($user);
        json_success('OK', [
            'presence' => [
                'id' => $pub['id'],
                'username' => $pub['username'],
                'presence' => $pub['presence'],
                'last_seen_at' => $pub['last_seen_at'],
                'last_seen_label' => $pub['last_seen_label'],
            ],
        ]);

    default:
        json_error('Unknown action.', 404);
}
