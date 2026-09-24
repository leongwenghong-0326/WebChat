<?php
declare(strict_types=1);

$localConfig = __DIR__ . '/config.local.php';
if (is_file($localConfig)) {
    require $localConfig;
}

if (!defined('APP_NAME')) define('APP_NAME', 'WebConnect');
if (!defined('APP_VERSION')) define('APP_VERSION', '1.0.0');

if (!defined('DB_HOST')) define('DB_HOST', '127.0.0.1');
if (!defined('DB_PORT')) define('DB_PORT', '3307');
if (!defined('DB_NAME')) define('DB_NAME', 'webconnect');
if (!defined('DB_USER')) define('DB_USER', 'root');
if (!defined('DB_PASS')) define('DB_PASS', '');
if (!defined('DB_CHARSET')) define('DB_CHARSET', 'utf8mb4');

if (!defined('APP_URL')) define('APP_URL', 'http://localhost/webchat');
if (!defined('APP_PATH')) define('APP_PATH', dirname(__DIR__));

if (!defined('SESSION_NAME')) define('SESSION_NAME', 'webconnect_sess');
if (!defined('ADMIN_SESSION_NAME')) define('ADMIN_SESSION_NAME', 'webconnect_admin_sess');

if (!defined('UPLOAD_MAX_IMAGE')) define('UPLOAD_MAX_IMAGE', 5 * 1024 * 1024);
if (!defined('UPLOAD_MAX_FILE')) define('UPLOAD_MAX_FILE', 15 * 1024 * 1024);
if (!defined('UPLOAD_MAX_VOICE')) define('UPLOAD_MAX_VOICE', 8 * 1024 * 1024);
if (!defined('UPLOAD_MAX_AVATAR')) define('UPLOAD_MAX_AVATAR', 2 * 1024 * 1024);

if (!defined('TYPING_TTL_SECONDS')) define('TYPING_TTL_SECONDS', 4);
if (!defined('PRESENCE_ONLINE_SECONDS')) define('PRESENCE_ONLINE_SECONDS', 60);
if (!defined('POLL_MESSAGES_MS')) define('POLL_MESSAGES_MS', 1000);
if (!defined('POLL_CALLS_MS')) define('POLL_CALLS_MS', 600);
if (!defined('POLL_NOTIFICATIONS_MS')) define('POLL_NOTIFICATIONS_MS', 5000);

if (!defined('CSRF_TOKEN_KEY')) define('CSRF_TOKEN_KEY', '_csrf_token');
if (!defined('RATE_LIMIT_LOGIN')) define('RATE_LIMIT_LOGIN', 10);
if (!defined('RATE_LIMIT_LOGIN_WINDOW')) define('RATE_LIMIT_LOGIN_WINDOW', 300);
if (!defined('RATE_LIMIT_MESSAGE')) define('RATE_LIMIT_MESSAGE', 60);
if (!defined('RATE_LIMIT_MESSAGE_WINDOW')) define('RATE_LIMIT_MESSAGE_WINDOW', 60);
if (!defined('RATE_LIMIT_FRIEND')) define('RATE_LIMIT_FRIEND', 30);
if (!defined('RATE_LIMIT_FRIEND_WINDOW')) define('RATE_LIMIT_FRIEND_WINDOW', 300);
if (!defined('RATE_LIMIT_FORUM')) define('RATE_LIMIT_FORUM', 20);
if (!defined('RATE_LIMIT_FORUM_WINDOW')) define('RATE_LIMIT_FORUM_WINDOW', 300);
if (!defined('RATE_LIMIT_CALL')) define('RATE_LIMIT_CALL', 20);
if (!defined('RATE_LIMIT_CALL_WINDOW')) define('RATE_LIMIT_CALL_WINDOW', 300);

if (!defined('ALLOWED_IMAGE_EXT')) define('ALLOWED_IMAGE_EXT', ['jpg', 'jpeg', 'png', 'gif', 'webp']);
if (!defined('ALLOWED_FILE_EXT')) define('ALLOWED_FILE_EXT', ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip']);
if (!defined('ALLOWED_VOICE_EXT')) define('ALLOWED_VOICE_EXT', ['webm', 'ogg', 'mp3', 'wav', 'm4a']);

if (!defined('ALLOWED_IMAGE_MIME')) define('ALLOWED_IMAGE_MIME', [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp'
]);
if (!defined('ALLOWED_FILE_MIME')) define('ALLOWED_FILE_MIME', [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
]);
if (!defined('ALLOWED_VOICE_MIME')) define('ALLOWED_VOICE_MIME', [
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3',
    'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a',
    'video/webm',
]);

if (!defined('RTC_STUN_URLS')) define('RTC_STUN_URLS', [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
]);

if (!defined('RTC_TURN_URLS')) define('RTC_TURN_URLS', []);
if (!defined('RTC_TURN_USERNAME')) define('RTC_TURN_USERNAME', '');
if (!defined('RTC_TURN_CREDENTIAL')) define('RTC_TURN_CREDENTIAL', '');

if (!defined('LOG_PATH')) define('LOG_PATH', APP_PATH . '/logs/app.log');
if (!defined('DISPLAY_ERRORS')) define('DISPLAY_ERRORS', true);