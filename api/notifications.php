<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';
require_login();

$action = str_input('action');
$userId = current_user_id();

function format_notification(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'type' => $row['type'],
        'title' => $row['title'],
        'body' => $row['body'] ?? '',
        'link' => $row['link'] ?? '',
        'related_id' => isset($row['related_id']) ? (int) $row['related_id'] : null,
        'is_read' => (int) $row['is_read'] === 1,
        'created_at' => $row['created_at'],
        'created_label' => time_ago($row['created_at']),
    ];
}

try {
    switch ($action) {
        case 'list':
            $limit = min(100, max(1, int_input('limit', 50)));
            $offset = max(0, int_input('offset', 0));
            $stmt = db()->prepare(
                'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
            );
            $stmt->bindValue(1, $userId, PDO::PARAM_INT);
            $stmt->bindValue(2, $limit, PDO::PARAM_INT);
            $stmt->bindValue(3, $offset, PDO::PARAM_INT);
            $stmt->execute();
            $items = array_map('format_notification', $stmt->fetchAll());
            json_success('OK', ['notifications' => $items]);
            break;

        case 'unread_count':
            $stmt = db()->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
            $stmt->execute([$userId]);
            json_success('OK', ['count' => (int) $stmt->fetchColumn()]);
            break;

        case 'mark_read':
            require_csrf();
            $id = int_input('id');
            if ($id <= 0) {
                json_error('Invalid notification.');
            }
            db()->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
                ->execute([$id, $userId]);
            json_success('Marked as read.');
            break;

        case 'mark_all_read':
            require_csrf();
            db()->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
                ->execute([$userId]);
            json_success('All notifications marked as read.');
            break;

        default:
            json_error('Unknown action.', 404);
    }
} catch (Throwable $e) {
    app_log('notifications.php: ' . $e->getMessage());
    json_error('An unexpected error occurred.', 500);
}
