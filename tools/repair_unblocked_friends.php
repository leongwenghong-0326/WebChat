<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/bootstrap.php';

$pdo = db();
$rows = $pdo->query(
    'SELECT DISTINCT
        LEAST(m.sender_id, m.receiver_id) AS a,
        GREATEST(m.sender_id, m.receiver_id) AS b
     FROM messages m'
)->fetchAll(PDO::FETCH_ASSOC);

$restored = 0;
$skipped = 0;
foreach ($rows as $row) {
    $a = (int) $row['a'];
    $b = (int) $row['b'];
    if ($a <= 0 || $b <= 0 || $a === $b) {
        continue;
    }
    if (is_blocked_either($a, $b)) {
        $skipped++;
        continue;
    }
    if (users_are_friends($a, $b)) {
        $skipped++;
        continue;
    }
    restore_friendship($a, $b);
    if (users_are_friends($a, $b)) {
        $restored++;
        echo "Restored friendship {$a} <-> {$b}\n";
    }
}
echo "Done. Restored={$restored}, skipped={$skipped}\n";