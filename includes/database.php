<?php
/**
 * PDO database connection singleton
 */

declare(strict_types=1);

final class Database
{
    private static ?PDO $pdo = null;

    public static function connection(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            DB_HOST,
            DB_PORT,
            DB_NAME,
            DB_CHARSET
        );

        try {
            self::$pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            // Match PHP timezone so NOW() / last_seen / presence are consistent on cPanel
            self::$pdo->exec("SET time_zone = '+08:00'");
        } catch (PDOException $e) {
            app_log('Database connection failed: ' . $e->getMessage());
            throw new RuntimeException('Unable to connect to the database.');
        }

        return self::$pdo;
    }
}

function db(): PDO
{
    return Database::connection();
}
