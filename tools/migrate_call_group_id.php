<?php
require_once dirname(__DIR__) . '/includes/bootstrap.php';
$cols = db()->query("SHOW COLUMNS FROM voice_call_sessions LIKE 'group_id'")->fetch();
if (!$cols) {
    db()->exec('ALTER TABLE voice_call_sessions ADD COLUMN group_id INT UNSIGNED NULL DEFAULT NULL AFTER callee_id');
    try {
        db()->exec('ALTER TABLE voice_call_sessions ADD KEY idx_calls_group (group_id)');
    } catch (Throwable $e) {}
    echo "added group_id\n";
} else {
    echo "group_id exists\n";
}