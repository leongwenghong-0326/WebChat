<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

if (current_user_id()) {
    redirect('chat.php');
}

redirect('login.php');
