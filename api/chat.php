<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';

require_login();

if (str_input('action') === '') {
    $_GET['action'] = 'conversations';
    $_POST['action'] = 'conversations';
    $_REQUEST['action'] = 'conversations';
}

require __DIR__ . '/messages.php';
