<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';
require_login();

$action = str_input('action');
$userId = current_user_id();

function validate_report_target(string $type, int $targetId): bool
{
    return match ($type) {
        'user' => (bool) get_user_by_id($targetId),
        'private_message' => (function () use ($targetId) {
            $stmt = db()->prepare('SELECT id FROM messages WHERE id = ? LIMIT 1');
            $stmt->execute([$targetId]);
            return (bool) $stmt->fetch();
        })(),
        'group_message' => (function () use ($targetId) {
            $stmt = db()->prepare('SELECT id FROM group_messages WHERE id = ? LIMIT 1');
            $stmt->execute([$targetId]);
            return (bool) $stmt->fetch();
        })(),
        'forum_post' => (function () use ($targetId) {
            $stmt = db()->prepare('SELECT id FROM forum_posts WHERE id = ? LIMIT 1');
            $stmt->execute([$targetId]);
            return (bool) $stmt->fetch();
        })(),
        default => false,
    };
}

try {
    switch ($action) {
        case 'create':
            require_csrf();
            $targetType = str_input('target_type');
            $targetId = int_input('target_id');
            $reason = str_input('reason');

            if ($reason === '' || strlen($reason) > 500) {
                json_error('Reason is required (max 500 characters).');
            }
            if (!in_array($targetType, ['user', 'private_message', 'group_message', 'forum_post'], true)) {
                json_error('Invalid target type.');
            }
            if ($targetId <= 0) {
                json_error('Invalid target.');
            }
            if ($targetType === 'user' && $targetId === $userId) {
                json_error('You cannot report yourself.');
            }
            if (!validate_report_target($targetType, $targetId)) {
                json_error('Target not found.', 404);
            }

            db()->prepare(
                'INSERT INTO reports (reporter_id, target_type, target_id, reason, status) VALUES (?, ?, ?, ?, ?)'
            )->execute([$userId, $targetType, $targetId, $reason, 'open']);

            json_success('Report submitted. Our team will review it.');
            break;

        default:
            json_error('Unknown action.', 404);
    }
} catch (Throwable $e) {
    app_log('reports.php: ' . $e->getMessage());
    json_error('An unexpected error occurred.', 500);
}
