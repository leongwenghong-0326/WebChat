<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';
require_login();

$action = str_input('action');
$userId = current_user_id();

function format_forum(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'slug' => $row['slug'],
        'description' => $row['description'] ?? '',
        'sort_order' => (int) $row['sort_order'],
    ];
}

function format_post(array $row, bool $detail = false): array
{
    $author = get_user_by_id((int) $row['user_id']);
    $likeCount = db()->prepare('SELECT COUNT(*) FROM post_likes WHERE post_id = ?');
    $likeCount->execute([(int) $row['id']]);
    $shareCount = db()->prepare('SELECT COUNT(*) FROM post_shares WHERE post_id = ?');
    $shareCount->execute([(int) $row['id']]);
    $commentCount = db()->prepare('SELECT COUNT(*) FROM post_comments WHERE post_id = ? AND is_hidden = 0');
    $commentCount->execute([(int) $row['id']]);
    $liked = db()->prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ? LIMIT 1');
    $liked->execute([(int) $row['id'], current_user_id()]);
    $shared = db()->prepare('SELECT id FROM post_shares WHERE post_id = ? AND user_id = ? LIMIT 1');
    $shared->execute([(int) $row['id'], current_user_id()]);

    $data = [
        'id' => (int) $row['id'],
        'forum_id' => (int) $row['forum_id'],
        'title' => $row['title'],
        'content' => $row['content'],
        'author' => $author ? public_user($author) : null,
        'like_count' => (int) $likeCount->fetchColumn(),
        'share_count' => (int) $shareCount->fetchColumn(),
        'comment_count' => (int) $commentCount->fetchColumn(),
        'liked' => (bool) $liked->fetch(),
        'shared' => (bool) $shared->fetch(),
        'created_at' => $row['created_at'],
        'created_label' => format_datetime($row['created_at']),
    ];

    if ($detail) {
        $comments = db()->prepare(
            'SELECT c.*, u.username, u.avatar, u.presence, u.last_seen_at, u.last_activity_at
             FROM post_comments c
             INNER JOIN users u ON u.id = c.user_id
             WHERE c.post_id = ? AND c.is_hidden = 0
             ORDER BY c.created_at ASC'
        );
        $comments->execute([(int) $row['id']]);
        $data['comments'] = [];
        foreach ($comments->fetchAll() as $c) {
            $data['comments'][] = [
                'id' => (int) $c['id'],
                'content' => $c['content'],
                'author' => public_user($c),
                'created_at' => $c['created_at'],
                'created_label' => time_ago($c['created_at']),
            ];
        }
    }

    return $data;
}

function create_report(int $reporterId, string $targetType, int $targetId, string $reason): void
{
    db()->prepare(
        'INSERT INTO reports (reporter_id, target_type, target_id, reason, status) VALUES (?, ?, ?, ?, ?)'
    )->execute([$reporterId, $targetType, $targetId, $reason, 'open']);
}

try {
    switch ($action) {
        case 'categories':
            $stmt = db()->query(
                'SELECT f.*,
                    (SELECT COUNT(*) FROM forum_posts fp WHERE fp.forum_id = f.id AND fp.is_hidden = 0) AS post_count
                 FROM forums f
                 WHERE f.is_active = 1
                 ORDER BY f.sort_order ASC, f.name ASC'
            );
            $forums = [];
            foreach ($stmt->fetchAll() as $row) {
                $item = format_forum($row);
                $item['post_count'] = (int) ($row['post_count'] ?? 0);
                $forums[] = $item;
            }
            json_success('OK', ['forums' => $forums]);
            break;

        case 'posts':
            $forumId = int_input('forum_id');
            if ($forumId <= 0) {
                json_error('Invalid forum.');
            }
            $forum = db()->prepare('SELECT * FROM forums WHERE id = ? AND is_active = 1 LIMIT 1');
            $forum->execute([$forumId]);
            if (!$forum->fetch()) {
                json_error('Forum not found.', 404);
            }
            $limit = min(50, max(1, int_input('limit', 20)));
            $offset = max(0, int_input('offset', 0));
            $stmt = db()->prepare(
                'SELECT * FROM forum_posts WHERE forum_id = ? AND is_hidden = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?'
            );
            $stmt->bindValue(1, $forumId, PDO::PARAM_INT);
            $stmt->bindValue(2, $limit, PDO::PARAM_INT);
            $stmt->bindValue(3, $offset, PDO::PARAM_INT);
            $stmt->execute();
            $posts = array_map(fn ($r) => format_post($r), $stmt->fetchAll());
            json_success('OK', ['posts' => $posts]);
            break;

        case 'get':
            $postId = int_input('post_id');
            if ($postId <= 0) {
                json_error('Invalid post.');
            }
            $stmt = db()->prepare('SELECT * FROM forum_posts WHERE id = ? AND is_hidden = 0 LIMIT 1');
            $stmt->execute([$postId]);
            $post = $stmt->fetch();
            if (!$post) {
                json_error('Post not found.', 404);
            }
            json_success('OK', format_post($post, true));
            break;

        case 'create':
            require_csrf();
            require_rate_limit('forum_post', RATE_LIMIT_FORUM, RATE_LIMIT_FORUM_WINDOW);
            $forumId = int_input('forum_id');
            $title = str_input('title');
            $content = str_input('content');
            if ($forumId <= 0) {
                json_error('Invalid forum.');
            }
            if ($title === '' || strlen($title) > 200) {
                json_error('Title is required (max 200 characters).');
            }
            if ($content === '') {
                json_error('Content is required.');
            }
            $forum = db()->prepare('SELECT id FROM forums WHERE id = ? AND is_active = 1 LIMIT 1');
            $forum->execute([$forumId]);
            if (!$forum->fetch()) {
                json_error('Forum not found.', 404);
            }
            db()->prepare('INSERT INTO forum_posts (forum_id, user_id, title, content) VALUES (?, ?, ?, ?)')
                ->execute([$forumId, $userId, $title, $content]);
            $postId = (int) db()->lastInsertId();
            $stmt = db()->prepare('SELECT * FROM forum_posts WHERE id = ? LIMIT 1');
            $stmt->execute([$postId]);
            json_success('Post created.', format_post($stmt->fetch()));
            break;

        case 'comment':
            require_csrf();
            require_rate_limit('forum_comment', RATE_LIMIT_FORUM, RATE_LIMIT_FORUM_WINDOW);
            $postId = int_input('post_id');
            $content = str_input('content');
            if ($postId <= 0 || $content === '') {
                json_error('Comment content is required.');
            }
            $post = db()->prepare('SELECT id, user_id, title FROM forum_posts WHERE id = ? AND is_hidden = 0 LIMIT 1');
            $post->execute([$postId]);
            $postRow = $post->fetch();
            if (!$postRow) {
                json_error('Post not found.', 404);
            }
            db()->prepare('INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)')
                ->execute([$postId, $userId, $content]);
            $commentId = (int) db()->lastInsertId();

            // Alert every active user (except the commenter) so the whole community sees it.
            $commenter = get_user_by_id($userId);
            $who = $commenter['username'] ?? 'Someone';
            $title = 'New community comment';
            $body = $who . ' commented on "' . $postRow['title'] . '".';
            $link = 'forums.php?post=' . $postId;

            $people = db()->prepare(
                'SELECT id FROM users WHERE is_disabled = 0 AND id != ?'
            );
            $people->execute([$userId]);
            foreach ($people->fetchAll(PDO::FETCH_COLUMN) as $uid) {
                notify_user((int) $uid, 'forum_comment', $title, $body, $link, $postId);
            }

            json_success('Comment added.', ['id' => $commentId]);
            break;

        case 'like':
            require_csrf();
            $postId = int_input('post_id');
            if ($postId <= 0) {
                json_error('Invalid post.');
            }
            $post = db()->prepare('SELECT id FROM forum_posts WHERE id = ? AND is_hidden = 0 LIMIT 1');
            $post->execute([$postId]);
            if (!$post->fetch()) {
                json_error('Post not found.', 404);
            }
            $exists = db()->prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ? LIMIT 1');
            $exists->execute([$postId, $userId]);
            if ($exists->fetch()) {
                db()->prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?')
                    ->execute([$postId, $userId]);
                json_success('Like removed.', ['liked' => false]);
            }
            db()->prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)')
                ->execute([$postId, $userId]);
            json_success('Post liked.', ['liked' => true]);
            break;

        case 'share':
            require_csrf();
            $postId = int_input('post_id');
            if ($postId <= 0) {
                json_error('Invalid post.');
            }
            $post = db()->prepare('SELECT id, title FROM forum_posts WHERE id = ? AND is_hidden = 0 LIMIT 1');
            $post->execute([$postId]);
            $postRow = $post->fetch();
            if (!$postRow) {
                json_error('Post not found.', 404);
            }
            $exists = db()->prepare('SELECT id FROM post_shares WHERE post_id = ? AND user_id = ? LIMIT 1');
            $exists->execute([$postId, $userId]);
            if (!$exists->fetch()) {
                db()->prepare('INSERT INTO post_shares (post_id, user_id) VALUES (?, ?)')
                    ->execute([$postId, $userId]);
            }
            json_success('Post shared.', [
                'share_url' => rtrim(APP_URL, '/') . '/forums.php?post=' . $postId,
                'title' => $postRow['title'],
            ]);
            break;

        case 'report':
            require_csrf();
            $postId = int_input('post_id');
            $reason = str_input('reason');
            if ($postId <= 0 || $reason === '') {
                json_error('Report reason is required.');
            }
            $post = db()->prepare('SELECT id FROM forum_posts WHERE id = ? LIMIT 1');
            $post->execute([$postId]);
            if (!$post->fetch()) {
                json_error('Post not found.', 404);
            }
            create_report($userId, 'forum_post', $postId, $reason);
            json_success('Report submitted. Thank you.');
            break;

        default:
            json_error('Unknown action.', 404);
    }
} catch (Throwable $e) {
    app_log('forums.php: ' . $e->getMessage());
    json_error('An unexpected error occurred.', 500);
}
