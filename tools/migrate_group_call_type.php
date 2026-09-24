<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';

$col = db()->query("SHOW COLUMNS FROM group_messages LIKE 'message_type'")->fetch(PDO::FETCH_ASSOC);
$type = (string) ($col['Type'] ?? '');
if (stripos($type, "'call'") === false) {
    db()->exec(
        "ALTER TABLE group_messages
         MODIFY COLUMN message_type ENUM('text','image','file','voice','call') NOT NULL DEFAULT 'text'"
    );
    echo "enum updated\n";
} else {
    echo "enum already has call\n";
}

$fixed = db()->exec(
    "UPDATE group_messages
     SET message_type = 'call'
     WHERE (message_type = '' OR message_type IS NULL OR message_type NOT IN ('text','image','file','voice','call'))
       AND (
            file_name LIKE 'gcall:%'
            OR body LIKE '{%\"call_type\"%'
       )"
);
echo "rows fixed: " . (int) $fixed . "\n";
