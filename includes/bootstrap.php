<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Keep PHP + MySQL on the same clock (Malaysia) so presence / "xh ago" stay correct on cPanel
if (!ini_get('date.timezone')) {
    date_default_timezone_set('Asia/Kuala_Lumpur');
} else {
    // Prefer app timezone even if hosting default differs
    date_default_timezone_set('Asia/Kuala_Lumpur');
}

if (DISPLAY_ERRORS) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', '0');
}

require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/auth.php';

start_app_session();
