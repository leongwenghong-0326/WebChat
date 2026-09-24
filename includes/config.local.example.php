<?php
declare(strict_types=1);

// Copy to config.local.php and adjust for your environment.

define('DB_HOST', '127.0.0.1');
define('DB_PORT', '3307'); // XAMPP often uses 3307; default MySQL is 3306
define('DB_NAME', 'webconnect');
define('DB_USER', 'root');
define('DB_PASS', '');
define('APP_URL', 'http://localhost/webchat');
define('DISPLAY_ERRORS', true);

// Optional TURN for WebRTC on restrictive networks:
// define('RTC_TURN_URLS', ['turn:your.turn.server:3478']);
// define('RTC_TURN_USERNAME', 'user');
// define('RTC_TURN_CREDENTIAL', 'secret');